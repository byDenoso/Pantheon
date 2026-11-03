"""Offline Sheets simulation for the opt-in throughput engine."""
import copy
import re
import unittest
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
            t._merge({"entries": result, "conflicts": []}, tab, row)
            key, cells = t._row_data(tab, row)
            result[key] = cells
        return result

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
        if self.fail == "429" and self.target_posts == 1:
            return Response(status=429)
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
                    values=self.values(w.SPOOL,a1)
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
             patch.object(w, "target_index", side_effect=sheets.full_index):
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
        with self.assertRaises(RuntimeError):
            self.execute(sheets)
        self.assertEqual(sheets.target_posts,1)

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


if __name__ == "__main__":
    unittest.main()
