"""Bounded Writer tail readback: speed must not bypass exact-content proof."""
import unittest
from unittest.mock import patch

from scripts import nexo_shadow_writer as w


def event(key):
    return {"tab": "MURAL", "stable_id": key,
            "values": ["2026-10-26T10:00:00Z", "S2", "P",
                       "RESULT", "", "TEST", "", key]}


def counters():
    return {"written": 0, "readback_batches": 0,
            "tail_readback_tabs": 0, "tail_readback_fallbacks": 0}


class TestIncrementalReadback(unittest.TestCase):
    def prepare(self):
        initial = w.TargetIndex()
        initial.last_row = 20
        a, b = event("readback-one"), event("readback-two")
        pending = [(a, "digest-a", w.PLAIN_TAB, "O", 15),
                   (b, "digest-b", w.PLAIN_TAB, "O", 16)]
        return {"MURAL": initial, "RESULTADOS": w.TargetIndex()}, pending

    def test_exact_tail_avoids_full_target_rescan(self):
        stored, queue = self.prepare()
        marks = []
        with patch.object(w, "values", return_value=[q[0]["values"] for q in queue]) as get, \
             patch.object(w, "target_index", side_effect=AssertionError("full scan not needed")), \
             patch.object(w, "mark", side_effect=lambda *args: marks.append(args)):
            count = counters()
            w.flush_verified_appends(None, stored, count, queue)
        self.assertEqual(count["tail_readback_tabs"], 1)
        self.assertEqual(count["tail_readback_fallbacks"], 0)
        self.assertEqual(count["written"], 2)
        self.assertEqual(stored["MURAL"].last_row, 22)
        self.assertEqual(marks[-1][-1], "APPLIED:digest-b")
        self.assertEqual(len(queue), 0)
        self.assertIn("'MURAL'!A21:H22", get.call_args.args[2])

    def test_tail_mismatch_requires_full_reconciliation(self):
        stored, queue = self.prepare()
        correct = w.TargetIndex()
        for item in queue:
            d = item[0]
            correct[d["stable_id"]] = tuple(d["values"])
        marks = []
        with patch.object(w, "values", return_value=[["unexpected"]]), \
             patch.object(w, "target_index", return_value=correct) as full_scan, \
             patch.object(w, "mark", side_effect=lambda *args: marks.append(args)):
            count = counters()
            w.flush_verified_appends(None, stored, count, queue)
        self.assertEqual(full_scan.call_count, 1)
        self.assertEqual(count["tail_readback_fallbacks"], 1)
        self.assertEqual(len(marks), 2)

    def test_missing_target_does_not_mark_applied(self):
        stored, queue = self.prepare()
        with patch.object(w, "values", return_value=[]), \
             patch.object(w, "target_index", return_value=w.TargetIndex()), \
             patch.object(w, "mark") as mark:
            with self.assertRaisesRegex(RuntimeError, "WRITE_READBACK_UNKNOWN"):
                w.flush_verified_appends(None, stored, counters(), queue)
        mark.assert_not_called()
        self.assertEqual(len(queue), 2)

    def test_target_index_tracks_last_populated_row_including_sparse_rows(self):
        a = event("readback-one")
        with patch.object(w, "page_rows", return_value=iter(
                [(2, a["values"]), (19, ["annotation only"])])):
            index = w.target_index(None, "MURAL")
        self.assertEqual(index.last_row, 19)
        self.assertTrue(w.match_target(index, a))



class TestBatchAppliedMarkers(unittest.TestCase):
    class Response:
        status_code = 200

        def __init__(self, data=None):
            self.data = data or {}

        def raise_for_status(self):
            return None

        def json(self):
            return self.data

    class Session:
        def __init__(self, mismatch=False):
            self.writes = []
            self.reads = []
            self.mismatch = mismatch

        def post(self, url, **kwargs):
            self.writes.append((url, kwargs))
            return TestBatchAppliedMarkers.Response()

        def get(self, url, **kwargs):
            self.reads.append((url, kwargs))
            states = [item["values"] for item in self.writes[0][1]["json"]["data"]]
            if self.mismatch:
                states[-1] = [["CLAIMED:old"]]
            return TestBatchAppliedMarkers.Response({
                "valueRanges": [{"values": state} for state in states]
            })

    def test_batch_ack_requires_exact_readback(self):
        session = self.Session()
        entries = [(w.PLAIN_TAB, "O", 12, "APPLIED:first"),
                   (w.PLAIN_TAB, "O", 13, "APPLIED:second")]
        w.mark_applied_batch(session, entries)
        self.assertEqual(len(session.writes), 1)
        self.assertEqual(len(session.reads), 1)
        self.assertTrue(session.writes[0][0].endswith("/values:batchUpdate"))
        self.assertTrue(session.reads[0][0].endswith("/values:batchGet"))
        self.assertEqual(session.writes[0][1]["json"]["valueInputOption"], "RAW")
        self.assertEqual(session.reads[0][1]["params"]["ranges"],
                         ["'SHADOW_V2'!O12", "'SHADOW_V2'!O13"])

    def test_ambiguous_batch_ack_fails_closed_without_replay(self):
        session = self.Session(mismatch=True)
        entries = [(w.PLAIN_TAB, "O", 12, "APPLIED:first"),
                   (w.PLAIN_TAB, "O", 13, "APPLIED:second")]
        with self.assertRaisesRegex(RuntimeError, "STATE_READBACK_FAILED"):
            w.mark_applied_batch(session, entries)
        self.assertEqual(len(session.writes), 1)
        self.assertEqual(len(session.reads), 1)

    def test_verified_target_uses_one_batch_ack(self):
        stored = w.TargetIndex()
        stored.last_row = 20
        a, b = event("readback-one"), event("readback-two")
        queue = [(a, "digest-a", w.PLAIN_TAB, "O", 15),
                 (b, "digest-b", w.PLAIN_TAB, "O", 16)]
        counts = counters()
        counts["batch_acknowledged"] = 0
        with patch.object(w, "values", return_value=[a["values"], b["values"]]), \
             patch.object(w, "mark_applied_batch") as batch, \
             patch.object(w, "mark", side_effect=AssertionError("no scalar ack")):
            w.flush_verified_appends(None, {"MURAL": stored}, counts, queue,
                                     batch_applied=True)
        batch.assert_called_once()
        self.assertEqual(counts["written"], 2)
        self.assertEqual(counts["batch_acknowledged"], 2)
        self.assertEqual(len(queue), 0)


if __name__ == "__main__":
    unittest.main()
