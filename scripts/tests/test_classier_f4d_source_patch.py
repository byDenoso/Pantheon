"""Static integrity checks for the pinned CLASSIER F4D FINUFFT source patch.

These tests validate the patch and ownership boundaries. They deliberately do
not promote a DDM P(k) result or pretend the native CLASSIER solver ran.
"""
from pathlib import Path
import os
import re
import subprocess
import unittest

ROOT = Path(__file__).resolve().parents[2]
PATCH = ROOT / "nexo-one/executor-runtime/patches/classier-f4d-finufft-ownership-20261025.patch"


class ClassierF4DPatchTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.patch = PATCH.read_text(encoding="utf-8")

    def test_unified_diff_hunk_dimensions(self):
        lines = self.patch.splitlines()
        headers = [i for i, line in enumerate(lines) if line.startswith("@@ ")]
        self.assertGreaterEqual(len(headers), 8)
        pattern = re.compile(r"^@@ -(\d+),(\d+) \+(\d+),(\d+) @@")
        for j, start in enumerate(headers):
            old_count = new_count = 0
            head = pattern.match(lines[start])
            self.assertIsNotNone(head, lines[start])
            end = headers[j+1] if j+1 < len(headers) else len(lines)
            for line in lines[start+1:end]:
                if line.startswith(("diff --git ", "--- ", "+++ ")):
                    continue
                self.assertTrue(line.startswith((" ", "+", "-", "\\")), repr(line))
                if line.startswith((" ", "-")):
                    old_count += 1
                if line.startswith((" ", "+")):
                    new_count += 1
            self.assertEqual(old_count, int(head.group(2)), lines[start])
            self.assertEqual(new_count, int(head.group(4)), lines[start])

    def test_shared_plan_lifetime_and_immutable_setpts(self):
        patch = self.patch
        self.assertIn("+    /* Shared FINUFFT plans must NOT be destroyed", patch)
        for symbol in ("r2c_plans_finufft_short", "c2r_plans_finufft_short",
                       "r2c_plans_finufft_long", "c2r_plans_finufft_long"):
            self.assertIn("+      finufft_destroy(ppt->list_" + symbol + "[t]);", patch)
        self.assertIn("+    free(finufft_target_coords);", patch)
        self.assertIn("N_out, finufft_target_coords, NULL, NULL", patch)
        self.assertIn("+  class_test(ppt->has_ncdmfft != _TRUE_", patch)
        self.assertIn("no P(k) claim", patch)
        self.assertIn("FINUFFT inverse execute failed", patch)

    def test_pinned_checkout_apply_if_present(self):
        root = os.environ.get("NEXO_CLASSIER_PINNED_CHECKOUT")
        if not root:
            self.skipTest("Native upstream checkout absent; no numerical qualification.")
        result = subprocess.run(["git", "apply", "--check", str(PATCH)],
                                cwd=root, capture_output=True, text=True, timeout=30)
        self.assertEqual(result.returncode, 0, result.stderr)


if __name__ == "__main__":
    unittest.main()
