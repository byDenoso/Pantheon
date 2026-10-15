import unittest
import tree_matching_symbolic_r1 as r


class SymbolicR1Checks(unittest.TestCase):
    def test_formal_symbols_cancel_to_r_one(self):
        out = r.run({})
        self.assertEqual(out["verdict"], "PROMOTED")
        self.assertEqual(out["decision"], "SURVIVED_R1_IDENTITY")
        self.assertEqual(out["statistics"]["r"], "1")
        self.assertEqual(out["statistics"]["inferred_target_parameters"],
                         {"m2": "mu2*f^2", "lambda": "f^4", "v0": "mu2^2"})
        self.assertTrue(out["statistics"]["exact_termwise_match"])

    def test_no_scientific_parameters_are_accepted(self):
        with self.assertRaisesRegex(ValueError, "no scientific parameters"):
            r.run({"angular_scale": "3/2"})


if __name__ == "__main__":
    unittest.main()
