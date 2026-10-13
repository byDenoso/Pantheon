import copy
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import textwrap
import unittest

RUNTIME = Path(__file__).resolve().parents[1]
REPO = RUNTIME.parents[1]
sys.path.insert(0, str(RUNTIME))
from package_validation import CANARY_ID, read_package, recipe_revision


class FrozenPackage(unittest.TestCase):
    def package(self):
        return {"schema": "NEXO_SCIENTIFIC_PACKAGE_V1", "battery_id": "bat-synthetic", "source_revision": "a" * 40,
                "parallelism": 1, "tests": [{"test_id": "TEST-SYNTHETIC", "recipe": "runner_numeric_canary",
                "recipe_revision": "b" * 40, "recipe_sha256": "c" * 64, "attempt_id": "attempt-" + "d" * 32,
                "params": {}, "inputs": [{"kind": "generated", "generator": "synthetic-fixture", "seed": 1,
                                          "sha256": "e" * 64, "public": True}]}]}

    def read(self, body, **kwargs):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "package.json"
            path.write_text(json.dumps(body))
            return read_package(path, "bat-synthetic", **kwargs)

    def test_canonical_package_hash_binds_exact_bytes_and_frozen_workflow(self):
        body = self.package()
        value, digest = self.read(body, workflow_revision="a" * 40)
        self.assertEqual(value, body)
        self.assertEqual(digest, hashlib.sha256(json.dumps(body).encode()).hexdigest())
        with self.assertRaisesRegex(ValueError, "WORKFLOW_REVISION_MISMATCH"):
            self.read(body, workflow_revision="b" * 40)
        with self.assertRaisesRegex(ValueError, "PACKAGE_CHANGED_AFTER_PLAN"):
            self.read(body, expected_sha256="f" * 64)

    def test_private_inline_missing_binding_and_ambiguous_json_are_rejected(self):
        for changes in ({"private": True}, {"domain": "PEER"}, {"domain": "OLYMPUS"}, {"script": "print(1)"},
                        {"recipe_revision": "main"}, {"recipe_sha256": ""}, {"attempt_id": ""}, {"inputs": []},
                        {"inputs": [{"public": True, "url": "https://example.org/data?token=secret", "version": "1", "sha256": "c" * 64}]},
                        {"inputs": [{"url": "https://example.org/data", "version": "1", "sha256": "c" * 64}]}):
            with self.subTest(changes=changes):
                body = self.package()
                body["tests"][0].update(changes)
                with self.assertRaises(ValueError):
                    self.read(body)
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "bad.json"
            for raw in ('{"id":"bat-synthetic","id":"bat-synthetic"}', '{"id":"bat-synthetic","value":NaN}'):
                path.write_text(raw)
                with self.assertRaises(ValueError):
                    read_package(path, "bat-synthetic")

    def test_committed_legacy_reservation_keeps_its_route_and_requires_immutable_recipe(self):
        body = self.package()
        body.pop("schema")
        body["id"] = body.pop("battery_id")
        body["status"] = "DISPATCH_PENDING"
        body.pop("parallelism")
        body["tests"][0]["inputs"][0].pop("public")
        self.assertEqual(self.read(body, transport="LEGACY_GIT_SPEC")[0], body)
        for changes in ({"status": "QUEUED"}, {"mandate_id": "canonical-mandate"}):
            with self.assertRaisesRegex(ValueError, "LEGACY_WRITER_RESERVATION_REQUIRED"):
                self.read({**body, **changes}, transport="LEGACY_GIT_SPEC")

    def test_legacy_missing_revision_uses_fixed_workflow_sha_with_same_required_recipe_hash(self):
        body = self.package()
        body.update(id=body.pop("battery_id"), status="DISPATCH_PENDING")
        body["tests"][0]["recipe_revision"] = None
        self.assertEqual(recipe_revision(body["tests"][0], transport="LEGACY_GIT_SPEC", workflow_revision="a" * 40), "a" * 40)
        self.read(body, transport="LEGACY_GIT_SPEC", workflow_revision="a" * 40)
        with self.assertRaisesRegex(ValueError, "FROZEN_RECIPE_REVISION_REQUIRED"):
            self.read(body, transport="CANONICAL_DRIVE_PACKAGE", workflow_revision="a" * 40)
        body["tests"][0]["recipe_sha256"] = None
        with self.assertRaisesRegex(ValueError, "FROZEN_EXECUTION_BINDING_REQUIRED"):
            self.read(body, transport="LEGACY_GIT_SPEC", workflow_revision="a" * 40)

    def test_public_legacy_query_is_preserved_but_signed_or_authenticated_url_is_not(self):
        body = self.package()
        body.update(id=body.pop("battery_id"), status="DISPATCH_PENDING")
        binding = {"url": "https://example.org/data?table=public-release", "version": "v1", "sha256": "e" * 64}
        body["tests"][0]["inputs"] = [binding]
        self.read(body, transport="LEGACY_GIT_SPEC")
        for url in ("https://user:password@example.org/data", "https://example.org/data?access_token=private",
                    "https://example.org/data?X-Amz-Signature=private"):
            body["tests"][0]["inputs"][0]["url"] = url
            with self.assertRaisesRegex(ValueError, "FROZEN_PUBLIC_INPUTS_REQUIRED"):
                self.read(body, transport="LEGACY_GIT_SPEC")

    def test_real_writer_serializes_legacy_reservation_without_changing_bytes_or_authority(self):
        tcc = REPO.parent / "TCC"
        if not (tcc / "runtime/nexo_agent_api/gpt_writer.py").exists():
            self.skipTest("Companion TCC checkout required for Writer serialization fixture")
        sys.path.append(str(tcc))
        from runtime.nexo_agent_api.gpt_writer import _emit_committed_dispatch_specs
        from runtime.nexo_agent_api.live_tower import build_live_tower_payload
        body = self.package()
        body.pop("schema")
        body.update(id=body.pop("battery_id"), status="DISPATCH_PENDING")
        body["tests"][0]["recipe_revision"] = None
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "CONTROL.json").write_text(json.dumps({"truth_owner": "TOWER_V06@GOOGLE_DRIVE_PRIVATE"}))
            (root / "evolution").mkdir()
            (root / "evolution/batteries.json").write_text(json.dumps({"batteries": [body]}))
            raw = json.dumps(build_live_tower_payload(root)).encode()
            staged = root / "dispatch"
            _emit_committed_dispatch_specs(str(staged), raw, [body["id"]])
            package, _ = read_package(staged / (body["id"] + ".json"), body["id"],
                                     transport="LEGACY_GIT_SPEC", workflow_revision="a" * 40)
            self.assertEqual(package, body)
            self.assertIsNone(package["tests"][0]["recipe_revision"])

    def test_only_fixed_versioned_canary_recipes_use_fixture_mode(self):
        path = RUNTIME / "fixtures" / (CANARY_ID + ".json")
        value, _ = read_package(path, CANARY_ID, fixture=True)
        self.assertEqual(len(value["tests"]), 3)
        for change in ({"id": "bat-other"}, {"source": "USER_INPUT"}, {"tests": [{"test_id": "X", "recipe": "cf4_velocity", "params": {}}]}):
            body = {**value, **change}
            with tempfile.TemporaryDirectory() as tmp:
                altered = Path(tmp) / "fixture.json"
                altered.write_text(json.dumps(body))
                with self.assertRaises(ValueError):
                    read_package(altered, CANARY_ID, fixture=True)

    def test_workflow_plan_prepare_execute_receipt_numeric_canary_offline(self):
        workflow = (REPO / ".github/workflows/nexo-test-battery.yml").read_text()
        def code_at(step):
            section = workflow.split(step, 1)[1]
            return textwrap.dedent(section.split("python3 - <<'PY'\n", 1)[1].split("\n          PY", 1)[0])
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            (base / "runtime-base").symlink_to(REPO, target_is_directory=True)
            job = base / "job"
            job.mkdir()
            output = base / "outputs"
            env = {**os.environ, "BID": CANARY_ID, "NEXO_BATTERY_ID": CANARY_ID, "NEXO_CI_FIXTURE": "true",
                   "NEXO_CANONICAL_PACKAGE": "false", "GITHUB_OUTPUT": str(output), "GITHUB_SHA": "a" * 40}
            plan = subprocess.run([sys.executable, "-c", code_at("- id: m")], cwd=base, env=env, capture_output=True, text=True)
            self.assertEqual(plan.returncode, 0, plan.stderr)
            outputs = dict(line.split("=", 1) for line in output.read_text().splitlines())
            matrix = json.loads(outputs["matrix"])["include"]
            test = matrix[0]
            env.update(IDX=str(test["index"]), MATRIX_TEST_ID=test["test_id"], NEXO_PACKAGE_SHA256=outputs["package_sha256"])
            prepared = subprocess.run([sys.executable, "-c", code_at("- name: Prepare frozen test").replace("/tmp/job", str(job))],
                                      cwd=base, env=env, capture_output=True, text=True)
            self.assertEqual(prepared.returncode, 0, prepared.stderr)
            execute = subprocess.run([sys.executable, str(job / "test.py")], cwd=job,
                      env={**env, "PARAMS_PATH": str(job / "params.json"), "INPUTS_PATH": str(job / "inputs.json"),
                           "RESULT_PATH": str(job / "result.json")}, capture_output=True, text=True)
            self.assertEqual(execute.returncode, 0, execute.stderr)
            (job / "exit-code.txt").write_text("0")
            receipt = subprocess.run([sys.executable, "-c", code_at("- name: Build shard receipt").replace("/tmp/job", str(job))],
                      cwd=base, env={**env, "PREP_OUTCOME": "success", "DEPS_OUTCOME": "success", "EXEC_OUTCOME": "success"},
                      capture_output=True, text=True)
            self.assertEqual(receipt.returncode, 0, receipt.stderr)
            value = json.loads((job / "out.json").read_text())
            self.assertTrue(value["ok"], value)
            self.assertEqual(value["result"]["decision"], "RUNNER_OK")
            self.assertEqual(value["recipe_sha256"], hashlib.sha256((RUNTIME / "recipes/runner_numeric_canary.py").read_bytes()).hexdigest())
            # A changed plan payload cannot execute even a fixture shard.
            env["NEXO_PACKAGE_SHA256"] = "f" * 64
            rejected = subprocess.run([sys.executable, "-c", code_at("- name: Prepare frozen test").replace("/tmp/job", str(job))],
                                      cwd=base, env=env, capture_output=True, text=True)
            self.assertNotEqual(rejected.returncode, 0)
            self.assertIn("PACKAGE_CHANGED_AFTER_PLAN", rejected.stderr)


if __name__ == "__main__":
    unittest.main()
