"""Prevent accidental restoration of the retired NEXO SHADOW writer."""

from pathlib import Path
import re
import unittest


WORKFLOW = Path(__file__).resolve().parents[2] / ".github/workflows/nexo-writer-robot.yml"


class WriterRetirementContractTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.workflow = WORKFLOW.read_text(encoding="utf-8")

    def test_no_automatic_entrypoints(self):
        triggers = self.workflow.split("\npermissions:", 1)[0]
        self.assertIn("\n  workflow_dispatch:", triggers)
        self.assertNotRegex(triggers, r"(?m)^  (schedule|push|pull_request):")

    def test_no_executable_writer_job(self):
        self.assertRegex(self.workflow, r"(?m)^  shadow:\\n    if: \\$\\{\\{ false \\$\\}\\}")
        self.assertRegex(self.workflow, r"(?m)^  write:\\n[^\\n]*\\n    if: \\$\\{\\{ false \\$\\}\\}")


if __name__ == "__main__":
    unittest.main()
