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


if __name__ == "__main__":
    unittest.main()
