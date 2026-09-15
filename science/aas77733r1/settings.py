BATTERY_ID = "AAS77733-R1-PUB"
SEED = 77733
DEFAULT_MOCKS = 10000
MOCK_POLICY = {"base": 10000, "tail_trigger_p": 0.01, "tail": 100000}
PRIMARY_ZMIN = 0.0233
ZMIN_SWEEP = [0.01, 0.0233, 0.024, 0.03, 0.05, 0.10]
CALIBRATION_BRANCHES = ["official_all", "calibrator_only", "non_calibrator"]
TEMPLATE_FAMILIES = ["hard_step", "tanh_step", "gaussian_bump", "piecewise_linear"]
BLIND_SCAN = {"z_step": 0.01, "min_side_count": 100, "min_z": 0.01, "max_z": 1.50}
HISTORICAL_SCAN = {"z_min": 0.25, "z_max": 0.60, "z_step": 0.01}
OMEGA_GRID = {"min": 0.15, "max": 0.50, "step": 0.005}
PANTHEON_LIKELIHOOD = {"commit": "c447f0fea703fcd0fff57de5000947b5ca81286b", "git_blob_sha1": "07d4ae5f24ae97b3416e12b17c666904b117156f"}
THRESHOLDS = {
    "global_alpha": 0.05,
    "nuisance_min_delta_fraction": 0.50,
    "survey_max_leave_one_out_drop_fraction": 0.50,
    "survey_max_abs_score_fraction": 0.75,
    "pivot_localization_halfwidth": 0.03,
    "minimum_localization_fraction": 0.68,
    "max_pivot_p16_p84_width": 0.10,
    "minimum_injection_detection_power": 0.68,
    "false_positive_fail_probability": 0.50,
    "false_positive_fail_offset_mag": 0.02,
    "des_replication_max_pivot_shift": 0.05,
    "des_replication_global_alpha": 0.05,
}
GATE_NAMES = ["priority_state_of_art","official_likelihood_reproduction","covariance_adjudication","data_vector_audit","calibrator_branches","zmin_sweep","feature_existence","blind_global_pivot_scan","look_elsewhere","template_invariance","cosmology_nuisance_profiling","structured_null_hierarchy","survey_attribution","nuisance_absorption","pivot_stability","injection_recovery","false_positive_injection","external_replication","physical_context_nulls","claim_closure"]
