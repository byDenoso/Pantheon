from __future__ import annotations
import json
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
REQUIRED_MAIN = {
"official_likelihood_reproduction","covariance_definition_sensitivity","covariance_integrity",
"calibrator_partition_check","redshift_cut_sensitivity","residual_feature_scan",
"scan_definition_and_historical_window","global_scan_significance","template_family_robustness",
"cosmology_profile_sensitivity","structure_preserving_null_models","survey_attribution",
"survey_nuisance_absorption","localization_stability","injection_recovery",
"survey_offset_sensitivity","des_external_replication","redshift_velocity_context","scientific_classification"}
REQUIRED_ROBUSTNESS = {"official_likelihood_checkpoint","duplicate_supernova_collapse","supernova_influence",
"robust_likelihood_diagnostic","survey_composition_balance","redshift_frame_and_sky_jackknife",
"des_covariance_comparison"}
FORBIDDEN_PUBLIC_TOKENS=("NE"+"XO","To"+"wer","agent"+"/","gate"+"_"+"id")
def load_json(relative:str):
    return json.loads((ROOT/relative).read_text(encoding="utf-8"))
def validate_reference():
    errors=[]
    main=load_json("results/reference_metrics.json")
    robust=load_json("results/robustness_metrics.json")
    prov=load_json("provenance/source_mapping.json")
    if set(main.get("checks",{})) != REQUIRED_MAIN: errors.append("main analysis set mismatch")
    if set(robust.get("checks",{})) != REQUIRED_ROBUSTNESS: errors.append("robustness check set mismatch")
    if main.get("source_result_hash") != prov.get("publication_result_hash"): errors.append("publication hash mismatch")
    if robust.get("source_result_hash") != prov.get("robustness_result_hash"): errors.append("robustness hash mismatch")
    if main.get("seed") != 77733 or main.get("mocks") != 10000: errors.append("frozen run configuration mismatch")
    for rel in ("README.md","METHODS.md","config/analysis.yaml","results/reference_metrics.json","results/robustness_metrics.json"):
        text=(ROOT/rel).read_text(encoding="utf-8")
        for token in FORBIDDEN_PUBLIC_TOKENS:
            if token.lower() in text.lower(): errors.append(f"{rel} contains internal token {token!r}")
    return errors
