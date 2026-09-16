import json
from pantheon_residuals.reference import ROOT
def test_primary_result_contract():
    d=json.loads((ROOT/"results/reference_metrics.json").read_text())
    scan=d["checks"]["residual_feature_scan"]
    sig=d["checks"]["global_scan_significance"]
    assert scan["n"]==1365
    assert scan["best_z"]==0.03
    assert abs(scan["delta_chi2"]-2.2244629118594608)<1e-12
    assert sig["mocks"]==10000
    assert abs(sig["p_global"]-0.8378162183781622)<1e-12
def test_des_replication_contract():
    d=json.loads((ROOT/"results/reference_metrics.json").read_text())
    des=d["checks"]["des_external_replication"]
    assert des["best_z"]==0.58
    assert des["consistent_replication"] is False
