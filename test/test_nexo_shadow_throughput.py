"""Offline Sheets simulation for the opt-in throughput engine."""
import copy
import re
import unittest
import time
from unittest.mock import patch
from scripts import nexo_shadow_writer as w
from scripts import nexo_shadow_throughput as t


def event(number):
    key = f"test-batched-event-{number:05d}"
    data = {"tab":"MURAL", "stable_id":key,
            "values":["2026-11-03T04:00:00Z","S1","P","text","ref","TEST","",key]}
    return [key, data["values"][0],"S1","MURAL",*data["values"],"","", ""]


class Response:
    def __init__(self, body=None, status=200):
        self.body = body or {}
        self.status_code = status

    def json(self):
        return self.body

    def raise_for_status(self):
        if self.status_code >= 400:
            error = RuntimeError("simulated HTTP")
            error.response = self
            raise error


class Sheets:
    def __init__(self, rows, *, fail=None):
        self.source = {w.PLAIN_TAB:[w.PLAIN_HEADER]+copy.deepcopy(rows),
                       w.LEGACY_TAB:[["stable_id","created_at","role","envelope_b64url"]]}
        self.target = {"MURAL":[["header"]*8], "RESULTADOS":[["header"]*10]}
        self.calls = []
        self.fail = fail
        self.target_posts = 0

    def values(self, sheet, range_):
        m = re.match(r"'([^']+)'!A(\d+):([A-Z]+)(\d+)", range_)
        if not m:
            raise AssertionError("unsupported range")
        tab, start, _, end = m.groups()
        table = (self.source if sheet == w.SPOOL else self.target)[tab]
        start, end = int(start)-1, int(end)
        return copy.deepcopy(table[start:end])

    def full_index(self, session, tab):
        result = w.TargetIndex()
        for number, row in enumerate(self.target[tab][1:], start=2):
            result.last_row = number
            key, cells = t._row_data(tab, row)
            result[key] = cells
        return result

    def page_rows(self, session, sheet, tab, column, first=2):
        table = (self.source if sheet == w.SPOOL else self.target)[tab]
        return iter((number, copy.deepcopy(row))
                    for number, row in enumerate(table, start=1)
                    if number >= first and row)

    def post(self, url, *, json, timeout):
        self.calls.append(("post", url))
        if url.endswith("/values:batchUpdate"):
            for entry in json["data"]:
                m = re.match(r"'([^']+)'!([A-Z]+)(\d+)", entry["range"])
                tab, col, number = m.groups()
                index = int(number)-1
                column = ord(col)-ord("A")
                row = self.source[tab][index]
                row.extend([""]*max(0,column+1-len(row)))
                row[column] = entry["values"][0][0]
            return Response()
        self.target_posts += 1
        if self.fail == "before":
            raise TimeoutError("request not delivered")
        if self.fail == "429" and self.target_posts == 1:
            return Response(status=429)
        commands = json["requests"]
        if self.fail == "partial":
            commands = commands[:1]
        for cmd in commands:
            request = cmd["appendCells"]
            tab = next(x for x in w.TABS if w.TABS[x][0] == request["sheetId"])
            for row in request["rows"]:
                self.target[tab].append([c["userEnteredValue"]["stringValue"]
                                         for c in row["values"]])
        if self.fail == "after" and self.target_posts == 1:
            raise TimeoutError("ambiguous transport")
        return Response()

    def get(self, url, *, params=None, timeout=60):
        self.calls.append(("get", url))
        if url.endswith("/values:batchGet"):
            ranges = params["ranges"]
            parts = []
            for a1 in ranges:
                m = re.match(r"'([^']+)'!A(\d+):([A-Z]+)(\d+)", a1)
                if m:
                    tab,start,_,end=m.groups()
                    values=self.values(w.SHADOW if f"/{w.SHADOW}/" in url else w.SPOOL,a1)
                else:
                    m=re.match(r"'([^']+)'!([A-Z]+)(\d+)",a1)
                    tab,col,number=m.groups()
                    row=self.source[tab][int(number)-1]
                    cell=ord(col)-ord("A")
                    values=[[row[cell]]] if len(row)>cell and row[cell] else []
                parts.append({"values":values})
            return Response({"valueRanges":parts})
        raise AssertionError("unexpected GET")


class ThroughputTests(unittest.TestCase):
    def execute(self, sheets, state=None):
        state = state if state is not None else {}
        with patch.object(w, "values", side_effect=lambda session, sheet, rng: sheets.values(sheet, rng)), \
             patch.object(w, "target_index", side_effect=sheets.full_index), \
             patch.object(w, "page_rows", side_effect=sheets.page_rows):
            result = t.run_fast(sheets, state, apply=True)
        return result, state

    def test_batch_20_events_one_append(self):
        sheets=Sheets([event(i) for i in range(20)])
        counts,state=self.execute(sheets)
        self.assertEqual(counts["written"],20)
        self.assertEqual(sheets.target_posts,1)
        self.assertEqual(len(state["targets"]["MURAL"]["entries"]),20)
        self.assertEqual(counts["pending"],0)  # verified markers are no longer pending
        counts,_=self.execute(sheets,state)
        self.assertEqual(sheets.target_posts,1)
        self.assertEqual(counts["pending"],0)

    def test_after_claim_before_append_recover_on_lease(self):
        sheets=Sheets([event(0)],fail="before")
        state={}
        with self.assertRaises(TimeoutError):
            self.execute(sheets,state)
        sheets.fail=None
        self.execute(sheets,state)
        self.execute(sheets,state)
        self.assertEqual(sheets.target_posts,1)
        counts,_=self.execute(sheets,state)
        self.assertEqual(counts["written"],1)
        self.assertEqual(sheets.target_posts,2)

    def test_after_append_before_readback_dedupes(self):
        sheets=Sheets([event(0)],fail="after")
        state={}
        with self.assertRaises(TimeoutError):
            self.execute(sheets,state)
        sheets.fail=None
        counts,_=self.execute(sheets,state)
        self.assertEqual(counts["reconciled"],1)
        self.assertEqual(sheets.target_posts,1)

    def test_partial_batch_remains_claimed(self):
        sheets=Sheets([event(i) for i in range(3)],fail="partial")
        counts,state=self.execute(sheets)
        self.assertEqual(counts["written"],1)
        self.assertEqual(counts["unresolved"],2)
        self.assertEqual(len(sheets.target["MURAL"]),2)
        sheets.fail=None
        self.execute(sheets,state)
        self.execute(sheets,state)
        counts,_=self.execute(sheets,state)
        self.assertEqual(counts["written"],2)

    def test_429_never_same_invocation_replay(self):
        sheets=Sheets([event(0)],fail="429")
        counts,_=self.execute(sheets)
        self.assertEqual(sheets.target_posts,1)
        self.assertEqual(counts["quota_rejected"],1)
        self.assertEqual(counts["written"],0)
        self.assertEqual(sheets.source[w.PLAIN_TAB][1][14].split(":")[3],"0")

    def test_three_attempts_quarantine(self):
        sheets=Sheets([event(0)],fail="before")
        state={}
        for index in range(10):
            try:
                counts,_=self.execute(sheets,state)
            except TimeoutError:
                pass
        self.assertEqual(sheets.target_posts,3)
        self.assertEqual(sheets.source[w.PLAIN_TAB][1][14],"INVALID:LEASE_EXHAUSTED")

    def test_incremental_and_anchor_divergence(self):
        sheets=Sheets([event(0)])
        counts,state=self.execute(sheets)
        sheets.source[w.PLAIN_TAB].append(event(1))
        counts,_=self.execute(sheets,state)
        self.assertEqual(counts["written"],1)
        sheets.target["MURAL"][-1][3]="altered outside writer"
        counts,_=self.execute(sheets,state)
        self.assertIn(event(1)[0],state["targets"]["MURAL"]["entries"])

    def test_synthetic_10x_batches(self):
        sheets=Sheets([event(i) for i in range(100)])
        counts,state=self.execute(sheets)
        self.assertEqual(counts["written"],100)
        self.assertEqual(sheets.target_posts,1)
        self.assertLess(len(sheets.calls),20)


    def test_drain_consumes_arrivals_between_batches(self):
        class Incoming(Sheets):
            def post(self, url, *, json, timeout):
                response = super().post(url, json=json, timeout=timeout)
                if (url.endswith(":batchUpdate") and not url.endswith("/values:batchUpdate")
                        and self.target_posts == 1 and len(self.source[w.PLAIN_TAB]) == 2):
                    self.source[w.PLAIN_TAB].append(event(1))
                return response
        sheets = Incoming([event(0)])
        counts,_ = self.execute(sheets)
        self.assertEqual(counts["written"],2)
        self.assertEqual(sheets.target_posts,2)
        self.assertGreaterEqual(counts["drain_cycles"],2)

    def test_source_identity_collision_skips_both(self):
        left=event(0)
        right=event(0)
        right[7]="conflicting content"
        good=event(1)
        sheets=Sheets([left,right,good])
        counts,_=self.execute(sheets)
        self.assertEqual(counts["conflict"],2)
        self.assertEqual(counts["written"],1)

    def test_invalid_event_does_not_poison_neighbor(self):
        bad=event(0)
        bad[7]=""
        sheets=Sheets([bad,event(1)])
        counts,_=self.execute(sheets)
        self.assertEqual(counts["written"],1)
        self.assertGreaterEqual(counts["invalid"],1)

    def test_legacy_claim_receives_lease_without_replay(self):
        row=event(0)
        key=row[0]
        row[-1]="CLAIMED:"+t.w.digest_for({
            "tab":"MURAL","stable_id":key,"values":row[4:12]})
        sheets=Sheets([row])
        counts,_=self.execute(sheets)
        self.assertEqual(counts["written"],0)
        self.assertEqual(sheets.target_posts,0)
        self.assertIn("CLAIMED:",sheets.source[w.PLAIN_TAB][1][-1])
        self.assertEqual(sheets.source[w.PLAIN_TAB][1][-1].count(":"),4)

    def test_budget_caps_total_and_deadline(self):
        budget=t.BudgetSession(Sheets([]), time.monotonic()+60, total=1)
        with patch.object(budget.session,"get",return_value=Response()):
            budget.get("https://example.invalid")
            with self.assertRaises(t.BudgetExhausted):
                budget.get("https://example.invalid")
        expired=t.BudgetSession(Sheets([]), time.monotonic()-1)
        with self.assertRaises(t.BudgetExhausted):
            expired.get("https://example.invalid")

    def test_checkpoint_roundtrip(self):
        import tempfile
        import os
        with tempfile.TemporaryDirectory() as directory:
            path=os.path.join(directory,"state.json")
            state={"runs":2,"targets":{"MURAL":{"entries":{"event":[2,"deadbeef"]}}}}
            t.save_state(path,state)
            self.assertEqual(t.load_state(path),state)


    def test_cached_middle_row_deletion_never_applies(self):
        sheets=Sheets([event(0),event(1),event(2)])
        _,state=self.execute(sheets)
        original=event(1)
        # Reintroduce the same proposed identity as a fresh spool row.
        # Remove middle target row; anchor changes but the persistent
        # index still claims the old physical row.
        sheets.target["MURAL"].pop(2)
        original[-1]="CLAIMED:"+w.digest_for({"tab":"MURAL","values":original[4:12]})
        sheets.source[w.PLAIN_TAB].append(original)
        counts,_=self.execute(sheets,state)
        self.assertEqual(counts["written"],0)
        self.assertEqual(counts["reconciled"],0)
        self.assertNotEqual(sheets.source[w.PLAIN_TAB][-1][14][:8],"APPLIED:")
        self.assertEqual(sheets.target_posts,1)

    def test_cached_middle_row_edit_forces_reconciliation(self):
        sheets=Sheets([event(0),event(1),event(2)])
        _,state=self.execute(sheets)
        sheets.target["MURAL"][2][3]="edited"
        sheets.source[w.PLAIN_TAB].append(event(1))
        counts,_=self.execute(sheets,state)
        self.assertEqual(counts["reconciled"],0)
        self.assertGreaterEqual(counts["conflict"],1)

    def test_drain_budget_stops_clean_with_pending(self):
        class Incoming(Sheets):
            def post(self, url, *, json, timeout):
                result=super().post(url, json=json, timeout=timeout)
                if (url.endswith(":batchUpdate") and not url.endswith("/values:batchUpdate")
                        and self.target_posts == 1 and len(self.source[w.PLAIN_TAB]) == 2):
                    self.source[w.PLAIN_TAB].append(event(1))
                return result
        sheets=Incoming([event(0)])
        budget=t.BudgetSession(sheets, time.monotonic()+60, per_minute=40, total=5)
        state={}
        with patch.object(w, "values",
                          side_effect=lambda session, sheet, rng: sheets.values(sheet, rng)), \
             patch.object(w, "page_rows", side_effect=sheets.page_rows):
            with self.assertRaises(t.BudgetExhausted):
                t.run_fast(budget, state, deadline=budget.deadline)
        self.assertLessEqual(sum(budget.metrics[k] for k in ("get","post","put","patch")),5)
        self.assertEqual(len(sheets.source[w.PLAIN_TAB]),3)
        self.assertIn("sources",state)
        self.assertTrue(state["sources"][w.PLAIN_TAB]["pending"])

    def test_quarantine_counter_monotonic(self):
        sheets=Sheets([event(0)],fail="before")
        state={}
        for _ in range(11):
            try:
                self.execute(sheets,state)
            except TimeoutError:
                pass
        self.assertEqual(state["lease_quarantine_total"],1)
        self.execute(sheets,state)
        self.assertEqual(state["lease_quarantine_total"],1)

    def test_sharded_state_roundtrip_and_integrity(self):
        import tempfile
        import os
        with tempfile.TemporaryDirectory() as root:
            state={"runs":12,"sources":{"SHADOW_V2":{"last_row":77,"pending":[12]}},
                   "targets":{"MURAL":{"last_row":23,"anchor":"a","conflicts":[],
                                         "entries":{f"event-{i}":[i+2,f"digest-{i}"] for i in range(300)}}}}
            t.save_state_dir(root,state)
            loaded=t.load_state_dir(root)
            self.assertEqual(loaded["targets"],state["targets"])
            self.assertEqual(loaded["sources"],state["sources"])
            self.assertEqual(loaded["runs"],state["runs"])
            self.assertEqual(loaded["version"],1)
            entries=t.load_state(root)["targets"]["MURAL"]["entries"]
            self.assertEqual(len(entries),300)
            bad=next(f for f in os.listdir(root) if f.startswith("mural-"))
            with open(os.path.join(root,bad),"w",encoding="utf-8") as output:
                output.write('{"wrong-shard-key":"digest"}')
            with self.assertRaises(ValueError):
                t.load_state_dir(root)


if __name__ == "__main__":
    unittest.main()
