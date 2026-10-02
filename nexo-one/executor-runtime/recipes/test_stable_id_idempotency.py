import unittest
import stable_id_idempotency as r


class StableIdChecks(unittest.TestCase):
    def test_promotes_twenty_exact_retries(self):
        pairs=[]
        for i in range(20):
            text='{"kind":"X","payload":{"i":%d}}' % i
            pairs.append({"a":{"stable_id":f"s{i}","envelope_text":text},"b":{"stable_id":f"s{i}","envelope_text":text}})
        out=r.run({}, {"pairs":pairs})
        self.assertEqual(out["verdict"], "PROMOTED")
        self.assertEqual(out["statistics"]["reuse_fraction"], 1.0)

    def test_collision_rejects(self):
        pairs=[]
        for i in range(20):
            a='{"x":%d}' % i
            b=a if i else '{"x":999}'
            pairs.append({"a":{"stable_id":f"s{i}","envelope_text":a},"b":{"stable_id":f"s{i}","envelope_text":b}})
        out=r.run({}, {"pairs":pairs})
        self.assertEqual(out["verdict"], "REJECTED")
        self.assertEqual(out["statistics"]["material_collisions"], 1)

    def test_small_sample_is_inconclusive(self):
        p={"a":{"stable_id":"s","envelope_text":"{}"},"b":{"stable_id":"s","envelope_text":"{}"}}
        out=r.run({}, {"pairs":[p]})
        self.assertEqual(out["decision"], "SAMPLE_TOO_SMALL")


if __name__ == "__main__":
    unittest.main()
