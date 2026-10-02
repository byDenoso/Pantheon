"""Guard the C01 approval-registry pins at the canonical Writer boundary."""

from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[2]
WRITER_WORKFLOW = ROOT / ".github" / "workflows" / "nexo-writer-robot.yml"
SELECTION_CI = ROOT / ".github" / "workflows" / "nexo-writer-selection-ci.yml"


class C01WriterPinBindingTests(unittest.TestCase):
    def test_writer_binds_fixed_registry_path_and_admin_managed_pins(self):
        workflow = WRITER_WORKFLOW.read_text(encoding="utf-8")
        start = workflow.index("      - name: Apply inbox to the Tower")
        end = workflow.find("\n      - name:", start + 1)
        self.assertGreater(end, start)
        step = workflow[start:end]

        expected = {
            "NEXO_C01_APPROVAL_REGISTRY_PATH":
                "${{ github.workspace }}/nexo-control/execution-assessment-approvals.json",
            "NEXO_C01_APPROVAL_REGISTRY_SHA256":
                "${{ vars.NEXO_C01_APPROVAL_REGISTRY_SHA256 }}",
            "NEXO_C01_APPROVAL_REF": "${{ vars.NEXO_C01_APPROVAL_REF }}",
            "NEXO_C01_APPROVED_AT": "${{ vars.NEXO_C01_APPROVED_AT }}",
        }
        bound = {}
        for line in step.splitlines():
            stripped = line.strip()
            for name in expected:
                prefix = f"{name}:"
                if stripped.startswith(prefix):
                    bound[name] = stripped[len(prefix):].strip()

        self.assertEqual(bound, expected)
        self.assertNotIn("secrets.", "\n".join(bound.values()))
        self.assertIn("Missing or mismatched admin-managed pins leave C01 fail-closed/OFF.", step)

    def test_registry_edits_reenter_the_writer_path_and_ci_checks_bindings(self):
        writer = WRITER_WORKFLOW.read_text(encoding="utf-8")
        selection_ci = SELECTION_CI.read_text(encoding="utf-8")
        registry_path = '"nexo-control/execution-assessment-approvals.json"'
        self.assertIn(registry_path, writer)
        self.assertIn("scripts/tests/test_c01_writer_pin_binding.py", selection_ci)


if __name__ == "__main__":
    unittest.main()
