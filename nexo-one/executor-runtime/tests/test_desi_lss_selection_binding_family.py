"""Offline contract tests for the DESI DR1 selection-preserving 3D null."""

from io import BytesIO
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import runpy
import tempfile
import unittest
from unittest.mock import patch

import numpy as np


ROOT = Path(__file__).resolve().parents[1]
RECIPE_PATH = ROOT / "recipes" / "desi_lss_selection_binding_family.py"
MANIFEST_PATH = ROOT / "recipes" / "manifests" / "desi_dr1_lss_iron_lsscats_v1.5_t01_selection.json"
SPEC = importlib.util.spec_from_file_location("desi_lss_selection_binding_family", RECIPE_PATH)
recipe = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(recipe)


def binding(name: str, raw: bytes = b"x") -> dict:
    return {"name": name, "url": f"https://example.org/{name}", "version": "frozen-v1",
            "sha256": hashlib.sha256(raw).hexdigest()}


def frozen_params() -> dict:
    return {
        "mode": "window_rotation_null",
        "test_id": recipe.TEST_ID,
        "prereg_hash": recipe.PREREG_HASH,
        "null_method": "selection_stratified_permutation",
        "null_count": 100,
        "seed": 731,
        "statistics": [{"name": "largest_abs_excursion_component", "abs_delta_gte": 0.5, "connectivity": 1}],
        "criterion": dict(recipe.FROZEN_CRITERION),
    }


def product_bytes(manifest_sha256: str) -> bytes:
    shape = (3, 3, 2)
    delta = np.linspace(-1.5, 1.5, num=np.prod(shape)).reshape(shape)
    valid = np.ones(shape, dtype=bool)
    radial_bins = np.indices(shape)[2].astype(np.int64)
    angular_bins = np.indices(shape)[0].astype(np.int64)
    strata = radial_bins + 2 * angular_bins
    role_bindings = {
        role: [binding(f"{role}_binding")]
        for role in sorted(recipe.REQUIRED_PROVENANCE_ROLES)
    }
    metadata = {
        "schema": recipe.PRODUCT_SCHEMA,
        "source_manifest_sha256": manifest_sha256,
        "grid_shape": list(shape),
        "selection": {"tracers": recipe.EXPECTED_TRACERS, "regions": recipe.EXPECTED_REGIONS,
                      "randoms_per_tracer_region": 18, "includes_official_n_z": True},
        "null_strata": {"preserves": ["n_z", "footprint", "selection"],
                        "definition": "radial shell x angular completeness bin"},
        "coordinate_frame": {"name": "ICRS Cartesian", "distance_unit": "Mpc/h",
                             "cosmology": {"name": "frozen-test"}},
        "voxelization": {"origin": [0.0, 0.0, 0.0], "cell_size": [10.0, 10.0, 10.0],
                         "assignment": "cloud-in-cell"},
        "provenance_bindings": role_bindings,
    }
    stream = BytesIO()
    np.savez(stream, delta=delta, valid_mask=valid, selection_stratum=strata,
             radial_bin=radial_bins, angular_selection_bin=angular_bins,
             metadata_json=np.array(json.dumps(metadata)))
    return stream.getvalue()


class DesiSelectionNullContract(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.manifest_raw = MANIFEST_PATH.read_bytes()
        cls.manifest_sha256 = hashlib.sha256(cls.manifest_raw).hexdigest()

    def test_checked_manifest_is_complete_and_pending_materialization(self):
        manifest = recipe.validate_source_manifest(self.manifest_raw)
        self.assertEqual(self.manifest_sha256, "6ce284a355085679eb528517746b247fa2c48902c6158ca556ae9c197b34c65a")
        self.assertEqual(manifest["summary"]["file_count"], 160)
        self.assertEqual(manifest["summary"]["role_counts"], {"catalog": 8, "random": 144, "n_z": 8})
        self.assertEqual(manifest["summary"]["total_bytes"], 139526840064)
        self.assertEqual(manifest["materialization"]["status"], "INPUT_PENDING_MATERIALIZATION")
        self.assertFalse(manifest["materialization"]["all_local_bytes_verified"])

    def test_manifest_summary_and_official_source_receipt_fail_closed(self):
        manifest = json.loads(self.manifest_raw)
        manifest["summary"]["total_bytes"] += 1
        with self.assertRaisesRegex(recipe.InputUnavailable, "summary"):
            recipe.validate_source_manifest(json.dumps(manifest).encode())
        manifest = json.loads(self.manifest_raw)
        manifest["source_receipt"]["checksum_sha256"] = "0" * 64
        with self.assertRaisesRegex(recipe.InputUnavailable, "source receipt"):
            recipe.validate_source_manifest(json.dumps(manifest).encode())

    def test_manifest_requires_exact_official_filenames_and_urls(self):
        manifest = json.loads(self.manifest_raw)
        manifest["files"][0]["url"] = "https://example.org/substitute.fits"
        with self.assertRaisesRegex(recipe.InputUnavailable, "official DESI release URL"):
            recipe.validate_source_manifest(json.dumps(manifest).encode())
        manifest = json.loads(self.manifest_raw)
        manifest["files"][-1]["name"] = manifest["files"][0]["name"]
        with self.assertRaisesRegex(recipe.InputUnavailable, "duplicate filename"):
            recipe.validate_source_manifest(json.dumps(manifest).encode())

    def test_params_preserve_recorded_identity_and_thresholds(self):
        self.assertEqual(recipe.validate_params(frozen_params())["prereg_hash"], recipe.PREREG_HASH)
        changed = frozen_params()
        changed["criterion"]["bh_q"] = 0.2
        with self.assertRaisesRegex(ValueError, "criterion"):
            recipe.validate_params(changed)
        changed = frozen_params()
        changed["null_count"] = 99
        with self.assertRaisesRegex(ValueError, ">=100"):
            recipe.validate_params(changed)
        changed = frozen_params()
        changed["statistics"][0]["connectivity"] = True
        with self.assertRaisesRegex(ValueError, "connectivity"):
            recipe.validate_params(changed)

    def test_permutation_preserves_each_selection_stratum_and_footprint(self):
        delta = np.arange(24, dtype=float).reshape(3, 4, 2)
        valid = np.ones(delta.shape, dtype=bool)
        valid[0, 0, 0] = False
        strata = np.indices(delta.shape)[2]
        actual = recipe.selection_preserving_permutation(delta, valid, strata, np.random.default_rng(9))
        self.assertEqual(actual[0, 0, 0], 0.0)
        for value in (0, 1):
            expected_values = sorted(delta[valid & (strata == value)].tolist())
            actual_values = sorted(actual[valid & (strata == value)].tolist())
            self.assertEqual(actual_values, expected_values)

    def test_recorded_decision_rules_are_exact(self):
        promoted = recipe.frozen_decision({"a": 1 / 101, "b": 0.7})
        self.assertEqual(promoted[:2], ("PROMOTED", "EXTREME_SURVIVES_SELECTION_NULL"))
        self.assertEqual(promoted[2], "Pelo menos uma estatística extrema congelada teve p_emp<=0,01 e passou pela correção BH com q=0,1. O extremo não foi reproduzido pelos nulos que preservam a seleção.")
        rejected = recipe.frozen_decision({"a": 0.1, "b": 0.8})
        self.assertEqual(rejected[:2], ("REJECTED", "EXTREMES_REPRODUCED_BY_SELECTION_NULL"))
        self.assertEqual(rejected[2], "Todas as estatísticas congeladas tiveram p_emp>=0,1. Os extremos foram reproduzidos pelos nulos que preservam a seleção.")
        intermediate = recipe.frozen_decision({"a": 0.05, "b": 0.8})
        self.assertEqual(intermediate[:2], ("INCONCLUSIVE", "INTERMEDIATE_SELECTION_NULL"))
        self.assertEqual(intermediate[2], "Os valores p congelados ficaram entre os critérios de sucesso e descarte. O teste não decide entre estrutura real e efeito da seleção.")

    def test_product_requires_all_reviewed_provenance_roles(self):
        raw = product_bytes(self.manifest_sha256)
        delta, valid, strata, metadata = recipe.validate_product(raw, self.manifest_sha256)
        self.assertEqual(delta.shape, valid.shape)
        self.assertEqual(delta.shape, strata.shape)
        self.assertEqual(set(metadata["provenance_bindings"]), recipe.REQUIRED_PROVENANCE_ROLES)

        with np.load(BytesIO(raw), allow_pickle=False) as archive:
            metadata = json.loads(archive["metadata_json"].item())
            del metadata["provenance_bindings"]["covariance"]
            stream = BytesIO()
            np.savez(stream, delta=archive["delta"], valid_mask=archive["valid_mask"],
                     selection_stratum=archive["selection_stratum"], radial_bin=archive["radial_bin"],
                     angular_selection_bin=archive["angular_selection_bin"],
                     metadata_json=np.array(json.dumps(metadata)))
        with self.assertRaisesRegex(recipe.InputUnavailable, "catalog/covariance"):
            recipe.validate_product(stream.getvalue(), self.manifest_sha256)

    def test_product_strata_cannot_cross_radial_or_angular_bins(self):
        raw = product_bytes(self.manifest_sha256)
        with np.load(BytesIO(raw), allow_pickle=False) as archive:
            stream = BytesIO()
            np.savez(stream, delta=archive["delta"], valid_mask=archive["valid_mask"],
                     selection_stratum=np.zeros_like(archive["selection_stratum"]),
                     radial_bin=archive["radial_bin"], angular_selection_bin=archive["angular_selection_bin"],
                     metadata_json=archive["metadata_json"])
        with self.assertRaisesRegex(recipe.InputUnavailable, "one radial"):
            recipe.validate_product(stream.getvalue(), self.manifest_sha256)

    def test_product_dtypes_and_voxelization_fail_closed(self):
        raw = product_bytes(self.manifest_sha256)
        with np.load(BytesIO(raw), allow_pickle=False) as archive:
            stream = BytesIO()
            np.savez(stream, delta=archive["delta"], valid_mask=archive["valid_mask"].astype(np.int8),
                     selection_stratum=archive["selection_stratum"], radial_bin=archive["radial_bin"],
                     angular_selection_bin=archive["angular_selection_bin"], metadata_json=archive["metadata_json"])
        with self.assertRaisesRegex(recipe.InputUnavailable, "boolean dtype"):
            recipe.validate_product(stream.getvalue(), self.manifest_sha256)

        with np.load(BytesIO(raw), allow_pickle=False) as archive:
            metadata = json.loads(archive["metadata_json"].item())
            del metadata["voxelization"]
            stream = BytesIO()
            np.savez(stream, delta=archive["delta"], valid_mask=archive["valid_mask"],
                     selection_stratum=archive["selection_stratum"], radial_bin=archive["radial_bin"],
                     angular_selection_bin=archive["angular_selection_bin"],
                     metadata_json=np.array(json.dumps(metadata)))
        with self.assertRaisesRegex(recipe.InputUnavailable, "voxel assignment"):
            recipe.validate_product(stream.getvalue(), self.manifest_sha256)

    def test_production_core_runs_only_with_two_frozen_inputs(self):
        product_raw = product_bytes(self.manifest_sha256)
        inputs = {
            "desi_dr1_lss_selection_manifest": binding("desi_dr1_lss_selection_manifest", self.manifest_raw),
            "desi_dr1_lss_3d_map_product": binding("desi_dr1_lss_3d_map_product", product_raw),
        }
        def fetch(item):
            return self.manifest_raw if item["name"] == "desi_dr1_lss_selection_manifest" else product_raw
        with patch.object(recipe, "frozen_inputs", return_value=inputs), patch.object(recipe, "verified_bytes", side_effect=fetch):
            result = recipe.production_run(frozen_params())
        self.assertIn(result["verdict"], {"PROMOTED", "REJECTED", "INCONCLUSIVE"})
        self.assertEqual(result["statistics"]["null_count"], 100)
        self.assertEqual(result["statistics"]["input_provenance"]["scope"], "FROZEN_INPUT_BYTES_VERIFIED")
        self.assertIn(result["semantic"]["verdict_plain"], recipe.VERDICT_PLAIN.values())
        self.assertGreaterEqual(result["semantic"]["result_meaning"].count("."), 2)

    def test_missing_inputs_are_an_operational_failure_not_inconclusive(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            params_path = root / "params.json"
            result_path = root / "result.json"
            params_path.write_text(json.dumps(frozen_params()), encoding="utf-8")
            env = {"PARAMS_PATH": str(params_path), "RESULT_PATH": str(result_path), "NEXO_REQUIRE_FROZEN_INPUTS": "1"}
            with patch.dict(os.environ, env, clear=True), self.assertRaises(SystemExit) as stopped:
                runpy.run_path(str(RECIPE_PATH), run_name="__main__")
            self.assertEqual(stopped.exception.code, 1)
            payload = json.loads(result_path.read_text(encoding="utf-8"))
            self.assertEqual(payload["execution_status"], "INPUT_OR_FIT_UNAVAILABLE")
            self.assertNotIn("verdict", payload)

    def test_smoke_semantics_are_simple_portuguese_and_non_scientific(self):
        checksum = f"{recipe.SMOKE_NZ_SHA256}  {recipe.SMOKE_NZ_NAME}\n".encode()
        with patch.dict(os.environ, {}, clear=True), patch.object(
                recipe, "verified_bytes", side_effect=[checksum, b"# z n(z)\n0.1 1.0\n"]):
            result = recipe.provenance_smoke()
        self.assertEqual(result["semantic"]["verdict_plain"], "Inconclusivo")
        self.assertEqual(
            result["semantic"]["result_meaning"],
            "A lista oficial de hashes e um arquivo n(z) passaram na verificação de bytes. "
            "Foi apenas um teste de preparação; não houve resultado científico e o teste continua bloqueado.")
        self.assertFalse(result["statistics"]["scientific_result_eligible"])
        self.assertTrue(result["summary"].startswith("A lista oficial de hashes"))

    def test_smoke_cannot_run_in_production(self):
        with patch.dict(os.environ, {"NEXO_REQUIRE_FROZEN_INPUTS": "1"}, clear=True):
            with self.assertRaisesRegex(recipe.InputUnavailable, "forbidden"):
                recipe.provenance_smoke()


if __name__ == "__main__":
    unittest.main()
