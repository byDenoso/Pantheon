"""Pure decision adapters for frozen NEXO H0 contracts.

These adapters never choose data, priors, samples, holdouts, or scientific
thresholds. They consume an upstream, hash-addressed analysis artifact and
apply the already-frozen TEST decision contract. Structural tags prevent a
nearby-but-non-equivalent estimator from being accepted silently.
"""
from __future__ import annotations

import json
import math
import os

PREREG = {
    "T-H0LCDM26-004-R2-ANCHOR-LOO": "sha256:2c537e5393cc60e5255ce61db635d9bfa57aabb2cccb26c9696675dca302b178",
    "T-H0LCDM26-005-R2-CEPH-ABLATION": "sha256:b5bf6e4d72e3244bbc941abc9b3e8de377f3d7de9bfd8ec7311c3edaba935cd0",
    "T-H0LCDM26-006-R2-JWST-CROWDING": "sha256:1d35ff2297dabac6e13790d85d1a9482f15eb58d472e54d76d4ee9a40eedb207",
    "T-H0LCDM26-006-R3-JWST-EIV": "sha256:3ad7e122cfe0f59b6117661b582bd9f47092d979b215134a8838de646e4e364f",
    "T-H0LCDM26-008-R2-MULTIRUNG-COV": "sha256:c10c02dac664ac63385f37eba8c51b63cad690ae529e5833ba96b376588857d0",
    "T-H0LCDM26-010-R2-NEFF-REACH": "sha256:65ffe2e245ec8360bcad135c114af495c1c76855ee6548cb4dcd3d7a119ced47",
}


class ContractInputError(ValueError):
    pass


def finite(x, name):
    try:
        y = float(x)
    except (TypeError, ValueError) as exc:
        raise ContractInputError(f"{name} precisa ser numérico") from exc
    if not math.isfinite(y):
        raise ContractInputError(f"{name} precisa ser finito")
    return y


def require(condition, message):
    if not condition:
        raise ContractInputError(message)


def sign(x):
    return 1 if x > 0 else -1 if x < 0 else 0


def base_validate(test_id, params):
    require(test_id in PREREG, "TEST sem contrato conhecido")
    require(params.get("test_id") == test_id, "test_id não corresponde ao adapter")
    require(params.get("prereg_hash") == PREREG[test_id], "prereg_hash diverge do contrato congelado")
    analysis = params.get("analysis")
    require(isinstance(analysis, dict), "analysis ausente")
    prov = analysis.get("provenance")
    require(isinstance(prov, dict), "proveniência do artefato upstream ausente")
    h = prov.get("upstream_artifact_sha256", "")
    require(isinstance(h, str) and h.startswith("sha256:") and len(h) == 71,
            "upstream_artifact_sha256 inválido")
    require(prov.get("contract_prereg_hash") == PREREG[test_id],
            "artefato upstream não está vinculado ao preregistro deste TEST")
    return analysis


def result(verdict, decision, meaning, stats):
    return {
        "verdict": verdict,
        "decision": decision,
        "summary": meaning,
        "statistics": stats,
        "semantic": {"result_meaning": meaning},
    }


def anchor_loo(a):
    require(a.get("estimator_tag") == "SH0ES_GAUSSIAN_YLC_ANCHOR_LOO",
            "estimador não corresponde ao likelihood y/L/C congelado")
    require(a.get("predictive_residual_definition") == "conditional_full_covariance",
            "resíduo preditivo precisa ser condicional e usar a covariância completa")
    rows = a.get("anchors")
    require(isinstance(rows, list) and len(rows) == 3, "são exigidas exatamente três remoções de âncora")
    vals = []
    for row in rows:
        require(row.get("anchor") in {"MW", "LMC", "NGC4258"}, "âncora inválida")
        vals.append({
            "anchor": row["anchor"],
            "delta_h0": finite(row.get("delta_h0"), "delta_h0"),
            "predictive_residual_sigma": finite(row.get("predictive_residual_sigma"), "predictive_residual_sigma"),
            "equivalent_parametrization_same_sign": bool(row.get("equivalent_parametrization_same_sign")),
        })
    require({v["anchor"] for v in vals} == {"MW", "LMC", "NGC4258"}, "as três âncoras devem aparecer uma vez")
    promoted = [v for v in vals if abs(v["delta_h0"]) >= 3.0 and abs(v["predictive_residual_sigma"]) >= 3.0 and v["equivalent_parametrization_same_sign"]]
    if promoted:
        m = max(promoted, key=lambda x: abs(x["delta_h0"]))
        return result("PROMOTED", "PROMOTED_SYSTEMATIC_ANCHOR",
                      f"A remoção de {m['anchor']} satisfaz o critério congelado de dominância de âncora.", {"anchors": vals})
    if all(abs(v["delta_h0"]) < 1.5 and abs(v["predictive_residual_sigma"]) < 2.0 for v in vals):
        return result("REJECTED", "REJECTED_ANCHOR_DOMINANCE",
                      "As três remoções ficam abaixo dos limites congelados de deslocamento de H0 e resíduo preditivo.", {"anchors": vals})
    return result("INCONCLUSIVE", "MIXED_ANCHOR_RESPONSE",
                  "Os dados ainda não permitem concluir: as remoções caem entre os critérios congelados de promoção e rejeição.", {"anchors": vals})


def cepheid_ablation(a):
    require(a.get("estimator_tag") == "SH0ES_PUBLISHED_CEPHEID_VARIANTS_YLC",
            "adapter aceita somente variantes publicadas mapeadas ao y/L/C congelado")
    variants = a.get("variants")
    require(isinstance(variants, list) and variants, "lista de variantes publicada ausente")
    executable = []
    for v in variants:
        if not v.get("executable", False):
            continue
        require(v.get("published_variant_id"), "variante executável sem id publicado")
        d = finite(v.get("delta_h0"), "delta_h0")
        daic = finite(v.get("delta_aic"), "delta_aic")
        loo = v.get("leave_one_anchor_out_delta_h0", [])
        require(isinstance(loo, list) and len(loo) == 3, "variante executável exige três leave-one-anchor-out")
        loo = [finite(x, "leave_one_anchor_out_delta_h0") for x in loo]
        executable.append({"published_variant_id": v["published_variant_id"], "delta_h0": d, "delta_aic": daic, "loo": loo})
    require(executable, "nenhuma variante publicada executável")
    promoted = [v for v in executable if v["delta_h0"] <= -6.09 and v["delta_aic"] <= 2 and all(x < 0 for x in v["loo"])]
    if promoted:
        v = min(promoted, key=lambda x: x["delta_h0"])
        return result("PROMOTED", "PROMOTED_CEPHEID_SYSTEMATIC",
                      f"A variante publicada {v['published_variant_id']} satisfaz o deslocamento, AIC e robustez por âncora congelados.", {"variants": executable})
    all_small = all(abs(v["delta_h0"]) < 2.0 for v in executable)
    large = [v for v in executable if abs(v["delta_h0"]) >= 3.0]
    all_large_penalized = bool(large) and all(v["delta_aic"] >= 10 for v in large)
    if all_small or all_large_penalized:
        return result("REJECTED", "REJECTED_CEPHEID_FULL_EXPLANATION",
                      "As variantes publicadas executáveis não satisfazem o critério congelado para explicar toda a discrepância.", {"variants": executable})
    return result("INCONCLUSIVE", "MIXED_CEPHEID_VARIANTS",
                  "Os dados ainda não permitem concluir: as variantes publicadas ficam entre os critérios congelados de promoção e rejeição.", {"variants": executable})


def jwst_crowding(a, eiv=False):
    expected = "EIV_LATENT_DISTANCE_FULL_COV" if eiv else "GLS_SHARED_ANCHOR"
    require(a.get("estimator_tag") == expected, "estimador JWST-HST não corresponde ao contrato congelado")
    require(a.get("primary_sample") == "NGC4258_PLUS_5_SN_HOSTS_8_SNIA",
            "amostra primária JWST-HST divergente")
    pred = finite(a.get("delta_mu_31p7"), "delta_mu_31p7")
    ci = a.get("delta_mu_31p7_ci95")
    require(isinstance(ci, list) and len(ci) == 2, "IC95 de delta_mu ausente")
    lo, hi = map(lambda x: finite(x, "ci95"), ci)
    require(lo <= pred <= hi, "estimativa fora do IC95 informado")
    dbic = finite(a.get("delta_bic_free_vs_b0"), "delta_bic_free_vs_b0")
    slopes = a.get("leave_one_host_out_slopes")
    require(isinstance(slopes, list) and len(slopes) == 5, "são exigidos exatamente cinco leave-one-host-out")
    slopes = [finite(x, "leave_one_host_out_slope") for x in slopes]
    if pred >= 0.18 and lo > 0 and dbic <= -6 and sum(x > 0 for x in slopes) >= 4:
        return result("PROMOTED", "PROMOTED_CROWDING_EXPLANATION",
                      "A tendência JWST-HST satisfaz magnitude, intervalo, BIC e robustez congelados.", {"delta_mu_31p7": pred, "ci95": [lo, hi], "delta_bic": dbic, "loo_slopes": slopes})
    if hi < 0.09 and dbic >= 2:
        return result("REJECTED", "REJECTED_CROWDING_FULL_EXPLANATION",
                      "O limite superior de 95% fica abaixo de +0,09 mag e o BIC favorece inclinação nula.", {"delta_mu_31p7": pred, "ci95": [lo, hi], "delta_bic": dbic, "loo_slopes": slopes})
    return result("INCONCLUSIVE", "MIXED_CROWDING_SIGNAL",
                  "Os dados ainda não permitem concluir: a regressão JWST-HST fica entre os critérios congelados.", {"delta_mu_31p7": pred, "ci95": [lo, hi], "delta_bic": dbic, "loo_slopes": slopes})


def multirung(a):
    require(a.get("estimator_tag") == "JWST_MULTIRUNG_GLS_SHARED_COVARIANCE",
            "estimador multirung não corresponde ao GLS/hierárquico congelado")
    require(a.get("route_reference_constraint") == "delta_Cepheid=0",
            "a escala dos offsets precisa fixar explicitamente delta_Cepheid=0")
    require(a.get("joint_non_cepheid_contrast_frozen") is True,
            "o contraste conjunto TRGB+JAGB precisa estar congelado antes do gate")
    if a.get("covariance_identifiable") is not True:
        return result("INCONCLUSIVE", "COVARIANCE_UNIDENTIFIABLE",
                      "Os dados ainda não permitem concluir: o grafo de covariância compartilhada não é identificável.", {"covariance_identifiable": False})
    trgb = finite(a.get("delta_h0_trgb_vs_cepheid"), "delta_h0_trgb_vs_cepheid")
    jagb = finite(a.get("delta_h0_jagb_vs_cepheid"), "delta_h0_jagb_vs_cepheid")
    joint = finite(a.get("delta_h0_joint_non_cepheid"), "delta_h0_joint_non_cepheid")
    z = finite(a.get("joint_z"), "joint_z")
    dbic = finite(a.get("delta_bic_offsets_vs_common"), "delta_bic_offsets_vs_common")
    survival = finite(a.get("loo_same_sign_fraction"), "loo_same_sign_fraction")
    require(0 <= survival <= 1, "fração LOO fora de [0,1]")
    same = sign(trgb) != 0 and sign(trgb) == sign(jagb)
    stats = {"delta_h0_trgb_vs_cepheid": trgb, "delta_h0_jagb_vs_cepheid": jagb, "delta_h0_joint_non_cepheid": joint, "joint_z": z, "delta_bic": dbic, "loo_same_sign_fraction": survival}
    if same and abs(joint) >= 2.0 and abs(z) >= 2.0 and dbic <= -6 and survival >= 0.8:
        return result("PROMOTED", "PROMOTED_ROUTE_OFFSET",
                      "TRGB e JAGB apontam para o mesmo lado e o contraste conjunto satisfaz amplitude, significância, BIC e LOO congelados.", stats)
    if sign(trgb) != 0 and sign(jagb) != 0 and sign(trgb) != sign(jagb):
        return result("INCONCLUSIVE", "ROUTE_SIGN_REVERSAL",
                      "Os dados ainda não permitem concluir: TRGB e JAGB têm sinais opostos em relação às Cefeidas.", stats)
    if abs(joint) < 1.0 and abs(z) < 1.0 and dbic >= 2:
        return result("REJECTED", "REJECTED_ROUTE_OFFSET",
                      "O contraste conjunto é pequeno, pouco significativo e o BIC favorece H0 comum.", stats)
    return result("INCONCLUSIVE", "MIXED_ROUTE_OFFSET",
                  "Os dados ainda não permitem concluir: os indicadores ficam entre os critérios congelados.", stats)


def neff(a):
    require(a.get("estimator_tag") == "PLANCK_PR4_DESI_DR2_LCDM_NEFF_PAIR",
            "execução não corresponde ao par LCDM/LCDM+N_eff congelado")
    require(a.get("dataset_signature") == "PLANCK_PR4_LOLLIPOP_LOW_E+HILLIPOP_TTTEEE_V4.3+PR4_LENSING+DESI_DR2_BAO",
            "combinação de likelihoods divergente")
    require(a.get("forbidden_local_h0_or_sne_input") is False,
            "SH0ES, SNe ou prior local de H0 são proibidos neste TEST")
    require(a.get("neff_prior") == [2, 5], "prior de N_eff precisa ser U[2,5]")
    require(abs(finite(a.get("sum_mnu_ev"), "sum_mnu_ev") - 0.06) < 1e-12, "sum mnu precisa ser 0,06 eV")
    require(a.get("bbn_consistency_yp") is True and a.get("flat") is True and a.get("running") is False,
            "BBN/curvatura/running divergem do contrato")
    dh = finite(a.get("delta_mean_h0"), "delta_mean_h0")
    hi = finite(a.get("h0_upper95"), "h0_upper95")
    dc = finite(a.get("delta_chi2_best"), "delta_chi2_best")
    edge = finite(a.get("neff_distance_from_nearest_prior_edge"), "neff_distance_from_nearest_prior_edge")
    stats = {"delta_mean_h0": dh, "h0_upper95": hi, "delta_chi2_best": dc, "neff_distance_from_nearest_prior_edge": edge}
    if dh >= 2.0 and hi >= 72.0 and dc <= 2 and edge >= 0.2:
        return result("PROMOTED", "PROMOTED_EARLY_REACH",
                      "Liberar somente N_eff satisfaz alcance de H0, qualidade de ajuste e distância das bordas do prior congelados.", stats)
    if dh < 1.0 or hi < 70.5 or dc >= 6:
        return result("REJECTED", "REJECTED_NEFF_REACH",
                      "A extensão N_eff não alcança os limites congelados de H0 ou degrada demais o melhor ajuste.", stats)
    return result("INCONCLUSIVE", "MIXED_NEFF_REACH",
                  "Os dados ainda não permitem concluir: o alcance de N_eff fica entre os critérios congelados.", stats)


DISPATCH = {
    "T-H0LCDM26-004-R2-ANCHOR-LOO": anchor_loo,
    "T-H0LCDM26-005-R2-CEPH-ABLATION": cepheid_ablation,
    "T-H0LCDM26-006-R2-JWST-CROWDING": lambda a: jwst_crowding(a, eiv=False),
    "T-H0LCDM26-006-R3-JWST-EIV": lambda a: jwst_crowding(a, eiv=True),
    "T-H0LCDM26-008-R2-MULTIRUNG-COV": multirung,
    "T-H0LCDM26-010-R2-NEFF-REACH": neff,
}


def run(test_id, params):
    try:
        analysis = base_validate(test_id, params)
        out = DISPATCH[test_id](analysis)
        out["statistics"]["technical_adapter"] = {
            "test_id": test_id,
            "prereg_hash": PREREG[test_id],
            "upstream_artifact_sha256": analysis["provenance"]["upstream_artifact_sha256"],
            "scope": "frozen_decision_contract_only",
        }
        return out
    except (ContractInputError, KeyError, TypeError) as exc:
        meaning = "Os dados ainda não permitem concluir: o artefato upstream não satisfaz o contrato técnico congelado: " + str(exc)
        return result("INCONCLUSIVE", "INPUT_CONTRACT_MISMATCH", meaning, {"test_id": test_id})


def main():
    with open(os.environ["PARAMS_PATH"], encoding="utf-8") as source:
        params = json.load(source)
    test_id = params.get("test_id")
    out = run(test_id, params)
    with open(os.environ["RESULT_PATH"], "w", encoding="utf-8") as target:
        json.dump(out, target, ensure_ascii=False, allow_nan=False, sort_keys=True)
    print(out["summary"])


if __name__ == "__main__":
    main()
