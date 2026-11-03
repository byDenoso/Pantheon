"""Opt-in batched SHADOW ingestion with persistent source/destination cursors.

No retries of ambiguous POSTs in the same workflow invocation. All scientific
rows are read back before APPLIED. Intended to run under a singleton Action.
"""
import datetime as dt
import hashlib
import json
import os
import time

from scripts import nexo_shadow_writer as w

MAX_BATCH_BYTES = 1_900_000
MAX_BATCH_ROWS = 100
LEASE_RUNS = 2
MAX_ATTEMPTS = 3
FULL_AUDIT_EVERY = 96


class BudgetExhausted(RuntimeError):
    pass


class BudgetSession(w.MeteredSession):
    """Sliding-window per-service-account request budget, including retries."""
    def __init__(self, session, deadline, per_minute=40, total=300):
        super().__init__(session)
        self.deadline = deadline
        self.per_minute = per_minute
        self.total = total
        self.history = {"read": [], "write": []}

    def _call(self, method, *args, **kwargs):
        kind = "read" if method == "get" else "write"
        while True:
            now = time.monotonic()
            self.history[kind] = [t for t in self.history[kind] if now - t < 60]
            if (now >= self.deadline or
                    sum(self.metrics[k] for k in ("get", "post", "put", "patch")) >= self.total):
                raise BudgetExhausted("REQUEST_OR_TIME_BUDGET_EXHAUSTED")
            if len(self.history[kind]) < self.per_minute:
                self.history[kind].append(now)
                return super()._call(method, *args, **kwargs)
            delay = max(0.1, 60 - (now - self.history[kind][0]))
            if now + delay >= self.deadline:
                raise BudgetExhausted("REQUEST_OR_TIME_BUDGET_EXHAUSTED")
            time.sleep(delay)


def _stamp():
    return int(time.time())


def _fingerprint(tab, row):
    return w.digest_for({"tab": tab, "values": list(row)})


def _row_data(tab, row):
    width = w.TABS[tab][1]
    normalized = (list(row) + [""] * width)[:width]
    key = normalized[7 if tab == "MURAL" else 3]
    return key, tuple(normalized)


def _merge(target, tab, row):
    key, normalized = _row_data(tab, row)
    if not key:
        return
    digest = _fingerprint(tab, normalized)
    previous = target["entries"].get(key)
    if key in target["conflicts"]:
        return
    if previous is not None and previous != digest:
        target["conflicts"].append(key)
        del target["entries"][key]
    else:
        target["entries"][key] = digest


def _full_target(session, tab):
    index = w.target_index(session, tab)
    target = {"entries": {}, "conflicts": sorted(index.conflicts),
              "last_row": index.last_row, "anchor": ""}
    for key, row in index.items():
        target["entries"][key] = _fingerprint(tab, row)
    if index.last_row > 1:
        tail = w.values(session, w.SHADOW,
                        f"'{tab}'!A{index.last_row}:{w.TABS[tab][2] if tab == 'MURAL' else 'J'}{index.last_row}")
        if tail:
            target["anchor"] = _fingerprint(tab, (tail[0] + [""] * w.TABS[tab][1])[:w.TABS[tab][1]])
    return target


def _tail(session, sheet, tab, column, first):
    """Incremental append-only scan; stop at first empty page."""
    for start in range(first, w.MAX_GRID_ROWS + 1, w.PAGE_SIZE):
        end = start + w.PAGE_SIZE - 1
        rows = w.values(session, sheet, f"'{tab}'!A{start}:{column}{end}")
        if not rows:
            return
        for off, row in enumerate(rows):
            if row:
                yield start + off, row
        if len(rows) < w.PAGE_SIZE:
            return


def update_targets(session, state, *, force=False):
    targets = state.setdefault("targets", {})
    for tab in w.TABS:
        old = targets.get(tab)
        if force or not old:
            targets[tab] = _full_target(session, tab)
            continue
        col = "H" if tab == "MURAL" else "J"
        last = old["last_row"]
        if last > 1:
            rows = w.values(session, w.SHADOW, f"'{tab}'!A{last}:{col}{last}")
            if (len(rows) != 1 or
                    _fingerprint(tab, (rows[0] + [""] * w.TABS[tab][1])[:w.TABS[tab][1]]) != old.get("anchor")):
                targets[tab] = _full_target(session, tab)
                continue
        for number, row in _tail(session, w.SHADOW, tab, col, last + 1):
            _merge(old, tab, row)
            old["last_row"] = max(old["last_row"], number)
            old["anchor"] = _fingerprint(tab, (row + [""] * w.TABS[tab][1])[:w.TABS[tab][1]])
    return targets


def _read_source(session, state, tab, column, header):
    """Recheck unresolved rows and fetch only new spool rows."""
    sources = state.setdefault("sources", {})
    cursor = sources.setdefault(tab, {"last_row": 1, "pending": []})
    first = w.values(session, w.SPOOL, f"'{tab}'!A1:{column}1")
    if not first or (first[0] + [""] * len(header))[:len(header)] != header:
        raise RuntimeError("SPOOL_HEADER_MISMATCH")
    seen = {}
    pending = list(dict.fromkeys(cursor["pending"]))
    # Read old nonterminal sources in small batches, avoiding huge ranges.
    for offset in range(0, len(pending), 100):
        numbers = pending[offset:offset + 100]
        ranges = [f"'{tab}'!A{n}:{column}{n}" for n in numbers]
        resp = w.safe_get(session, f"{w.API}/{w.SPOOL}/values:batchGet",
                          params={"ranges": ranges}, timeout=60).json()
        windows = resp.get("valueRanges", [])
        if len(windows) != len(numbers):
            raise RuntimeError("STATE_READBACK_FAILED")
        for number, part in zip(numbers, windows):
            rows = part.get("values", [])
            if rows:
                seen[number] = rows[0]
    for number, row in _tail(session, w.SPOOL, tab, column, cursor["last_row"] + 1):
        seen[number] = row
        cursor["last_row"] = max(cursor["last_row"], number)
    return cursor, seen


def collect(session, state):
    specs = (
        (w.LEGACY_TAB, "E", ["stable_id", "created_at", "role", "envelope_b64url"]),
        (w.PLAIN_TAB, "O", w.PLAIN_HEADER),
    )
    items = []
    invalid = 0
    for tab, column, header in specs:
        cursor, rows = _read_source(session, state, tab, column, header)
        new_pending = []
        for number, row in rows.items():
            try:
                if tab == w.LEGACY_TAB:
                    if len(row) < 4:
                        raise ValueError("INVALID_LEGACY")
                    data = w.decode(row[0], row[3])
                    if data is None:
                        continue
                    digest = hashlib.sha256(row[3].encode("ascii")).hexdigest()[:16]
                    receipt = row[4] if len(row) > 4 else ""
                else:
                    decoded = w.decode_plain(row)
                    if decoded is None:
                        continue
                    data, receipt = decoded
                    digest = w.digest_for(data)
                if receipt.startswith("APPLIED:") or receipt.startswith("INVALID:"):
                    continue
                item = {"number": number, "source_tab": tab,
                        "column": column, "data": data,
                        "digest": digest, "receipt": receipt}
                items.append(item)
                new_pending.append(number)
            except (ValueError, KeyError, TypeError, UnicodeError):
                invalid += 1
                # Retain malformed pending for manual diagnosis; do not replay.
        cursor["pending"] = new_pending
    return items, invalid


def _parse_claim(state, digest):
    if state == "CLAIMED:" + digest:
        return (0, 0, 0)  # historical claim, first observed by this mode
    fields = state.split(":")
    if len(fields) == 5 and fields[:2] == ["CLAIMED", digest]:
        try:
            return tuple(int(value) for value in fields[2:])
        except ValueError:
            pass
    return None


def _claim(digest, when, attempts, run_number):
    return f"CLAIMED:{digest}:{when}:{attempts}:{run_number}"


def _markers(session, entries):
    """Write+readback all marker changes, with no unverified success."""
    if not entries:
        return
    data = [{"range": f"'{item['source_tab']}'!{item['column']}{item['number']}",
             "majorDimension": "ROWS", "values": [[receipt]]}
            for item, receipt in entries]
    ranges = [entry["range"] for entry in data]
    response = session.post(f"{w.API}/{w.SPOOL}/values:batchUpdate",
                            json={"valueInputOption": "RAW", "data": data}, timeout=60)
    response.raise_for_status()
    read = w.safe_get(session, f"{w.API}/{w.SPOOL}/values:batchGet",
                      params={"ranges": ranges, "valueRenderOption": "UNFORMATTED_VALUE"},
                      timeout=60).json().get("valueRanges", [])
    if len(read) != len(entries) or any(
            result.get("values", []) != [[entry[1]]]
            for result, entry in zip(read, entries)):
        raise RuntimeError("STATE_READBACK_FAILED")
    for item, receipt in entries:
        item["receipt"] = receipt


def _batches(items):
    part = []
    for item in items:
        request = w.append_request(item["data"])["requests"][0]
        proposal = part + [(item, request)]
        encoded = json.dumps({"requests": [req for _, req in proposal]},
                             ensure_ascii=False).encode("utf-8")
        if len(encoded) > MAX_BATCH_BYTES or len(proposal) > MAX_BATCH_ROWS:
            if not part:
                raise ValueError("BATCH_PLATFORM_LIMIT")
            yield part
            part = [(item, request)]
        else:
            part = proposal
    if part:
        yield part


def run_fast(session, state, *, apply=True, deadline=None):
    """One workflow invocation. No ambiguous append retry within this invocation."""
    state["runs"] = int(state.get("runs", 0)) + 1
    run_number = state["runs"]
    counts = {"collected": 0, "eligible": 0, "written": 0, "reconciled": 0,
              "unresolved": 0, "quarantined": 0, "invalid": 0, "conflict": 0,
              "batches": 0, "drain_cycles": 0, "pending": 0}
    update_targets(session, state, force=run_number % FULL_AUDIT_EVERY == 0)
    # Drain all available work in bounded batches, with one reconciliation
    # before every append. A second pass is permitted only for NEW arrivals.
    already_processed = set()
    while True:
        if deadline is not None and time.monotonic() >= deadline:
            break
        items, bad = collect(session, state)
        counts["drain_cycles"] += 1
        counts["invalid"] += bad
        counts["collected"] += len(items)
        groups = {}
        for item in items:
            key = (item["data"]["tab"], item["data"]["stable_id"])
            groups.setdefault(key, []).append(item)
        safe = []
        ack = []
        quarantines = []
        for key, group in groups.items():
            if key in already_processed:
                continue
            already_processed.add(key)
            digests = {w.digest_for(i["data"]) for i in group}
            if len(digests) != 1:
                counts["conflict"] += len(group)
                continue
            item = group[0]
            tab, stable_id = key
            target = state["targets"][tab]
            expected = w.digest_for(item["data"])
            if stable_id in target["conflicts"]:
                counts["conflict"] += len(group)
                continue
            existing = target["entries"].get(stable_id)
            if existing is not None and existing != expected:
                counts["conflict"] += len(group)
                continue
            if existing == expected:
                ack.extend((one, "APPLIED:" + one["digest"]) for one in group)
                counts["reconciled"] += len(group)
                continue
            if any(one["receipt"] not in ("", "CLAIMED:"+one["digest"])
                   and _parse_claim(one["receipt"], one["digest"]) is None
                   for one in group):
                counts["quarantined"] += len(group)
                continue
            claims = [_parse_claim(one["receipt"], one["digest"])
                      for one in group if one["receipt"]]
            if claims:
                if any(c is None for c in claims):
                    counts["quarantined"] += len(group)
                    continue
                when, attempts, previous_run = max(claims)
                if not when:
                    # Upgrade legacy CLAIMED to a timed lease, without replay.
                    for one in group:
                        if one["receipt"]:
                            quarantines.append((one, _claim(one["digest"], _stamp(), 1, run_number)))
                    counts["unresolved"] += len(group)
                    continue
                if run_number - previous_run <= LEASE_RUNS:
                    counts["unresolved"] += len(group)
                    continue
                if attempts >= MAX_ATTEMPTS:
                    quarantines.extend((one, "INVALID:LEASE_EXHAUSTED") for one in group)
                    counts["quarantined"] += len(group)
                    continue
            try:
                w.validate_new_event(item["data"])
            except (ValueError, TypeError, KeyError):
                counts["invalid"] += len(group)
                continue
            safe.append((item, group, claims[0][1] if claims else 0))
        if not apply:
            counts["eligible"] += len(safe)
            break
        _markers(session, ack + quarantines)
        if not safe:
            break
        counts["eligible"] += len(safe)
        for batch in _batches([item for item, _, _ in safe]):
            if deadline is not None and time.monotonic() >= deadline:
                break
            members = {id(item): (group, attempts)
                       for item, group, attempts in safe}
            reservations = []
            for item, _ in batch:
                group, attempts = members[id(item)]
                for one in group:
                    reservations.append((one, _claim(one["digest"], _stamp(),
                                                     attempts + 1, run_number)))
            _markers(session, reservations)
            # A claimed marker is durable BEFORE the target POST. Any timeout
            # leaves it reserved; only a later invocation can lease-retry.
            request = [command for _, command in batch]
            try:
                response = session.post(f"{w.API}/{w.SHADOW}:batchUpdate",
                                        json={"requests": request}, timeout=60)
                response.raise_for_status()
            except Exception:
                # Reconcile the tail on next invocation. Never resend here.
                raise
            counts["batches"] += 1
            update_targets(session, state)
            applied = []
            for item, _ in batch:
                target = state["targets"][item["data"]["tab"]]
                sid = item["data"]["stable_id"]
                if sid in target["conflicts"] or (
                        target["entries"].get(sid) != w.digest_for(item["data"])):
                    counts["unresolved"] += 1
                    continue
                group, _ = members[id(item)]
                applied.extend((one, "APPLIED:" + one["digest"]) for one in group)
            _markers(session, applied)
            counts["written"] += len(applied)
        # Each group from this invocation is visited at most once. Continue only
        # if the spool has unseen arrivals; otherwise stop without busy polling.
        if not any((i["data"]["tab"], i["data"]["stable_id"]) not in already_processed
                   for i in collect(session, state)[0]):
            break
    counts["pending"] = sum(len(v["pending"]) for v in state["sources"].values())
    return counts


def load_state(path):
    if not path or not os.path.isfile(path):
        return {}
    with open(path, encoding="utf-8") as handle:
        value = json.load(handle)
    if not isinstance(value, dict):
        raise ValueError("INVALID_STATE")
    return value


def save_state(path, state):
    if path:
        temp = path + ".tmp"
        with open(temp, "w", encoding="utf-8") as handle:
            json.dump(state, handle, sort_keys=True, separators=(",", ":"))
        os.replace(temp, path)

def main():
    """Opt-in CLI; branch CI needs no Google credentials."""
    import argparse
    import sys
    from google.oauth2 import service_account
    from google.auth.transport.requests import AuthorizedSession

    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--state", required=True)
    parser.add_argument("--state-out", required=True)
    parser.add_argument("--budget-seconds", type=int, default=420)
    args = parser.parse_args()
    raw = os.environ.get("GOOGLE_SERVICE_ACCOUNT_JSON")
    if not raw:
        raise SystemExit("WRITER_CREDENTIAL_MISSING")
    creds = service_account.Credentials.from_service_account_info(
        json.loads(raw), scopes=["https://www.googleapis.com/auth/spreadsheets"])
    state = load_state(args.state)
    start = time.monotonic()
    counts = None
    meter = None
    status = "STOP_UNCLASSIFIED"
    try:
        with AuthorizedSession(creds) as authenticated:
            meter = BudgetSession(authenticated, start + args.budget_seconds)
            try:
                counts = run_fast(meter, state, apply=args.apply, deadline=meter.deadline)
                status = "READBACK_VERIFIED" if not counts["conflict"] and not counts["invalid"] else "PARTIAL_RECONCILIATION"
            except BudgetExhausted:
                status = "BUDGET_EXHAUSTED_RESUMABLE"
            except Exception as exc:
                status = "STOP_" + w.safe_error_code(exc)
    finally:
        # A lost index checkpoint never authorizes blind append: the next run
        # scans any new tail rows before considering new source identities.
        if args.apply:
            save_state(args.state_out, state)
        metrics = meter.metrics if meter else {}
        counters = counts or {}
        summary = {"written": counters.get("written", 0),
                   "reconciled": counters.get("reconciled", 0),
                   "unresolved": counters.get("unresolved", 0),
                   "quarantined": counters.get("quarantined", 0),
                   "plain": counters.get("collected", 0)}
        w.step_summary(summary, metrics, time.monotonic() - start, status)
        print(json.dumps({"status": status, "duration_seconds": round(time.monotonic()-start, 3),
                          **metrics, **counters}, sort_keys=True))
    return 0 if status in ("READBACK_VERIFIED", "BUDGET_EXHAUSTED_RESUMABLE") else 1


if __name__ == "__main__":
    raise SystemExit(main())
