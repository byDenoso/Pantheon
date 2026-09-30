import json, os
from fractions import Fraction


def frac(value):
    if isinstance(value, int):
        return Fraction(value, 1)
    if isinstance(value, float):
        return Fraction(str(value))
    return Fraction(str(value))


def fstr(value):
    return str(value.numerator) if value.denominator == 1 else f"{value.numerator}/{value.denominator}"


def run(params):
    angular_scale = frac(params.get("angular_scale", 1))
    radial_mu2 = frac(params.get("radial_mu2", 1))
    if angular_scale <= 0 or radial_mu2 <= 0:
        raise ValueError("angular_scale e radial_mu2 devem ser positivos")

    # Completion independente: L = chi^2 X/f^2 - (mu^2 + chi^2/2)^2.
    # A equacao radial adiabatica da chi^2 = 2(X/f^2 - mu^2).
    # Substituimos primeiro e so depois inferimos os parametros da forma alvo.
    coeff_x2 = Fraction(1, 1) / (angular_scale ** 4)
    coeff_x = Fraction(-2, 1) * radial_mu2 / (angular_scale ** 2)
    coeff_0 = Fraction(0, 1)

    target_lambda = Fraction(1, 1) / coeff_x2
    target_m2 = -coeff_x * target_lambda / 2
    target_v0 = target_m2 * target_m2 / target_lambda - coeff_0

    target_x2 = Fraction(1, 1) / target_lambda
    target_x = Fraction(-2, 1) * target_m2 / target_lambda
    target_0 = target_m2 * target_m2 / target_lambda - target_v0
    exact = (coeff_x2, coeff_x, coeff_0) == (target_x2, target_x, target_0)

    denominator = target_m2 * target_m2
    if denominator == 0:
        raise ZeroDivisionError("m2 inferido e zero")
    ratio = target_lambda * target_v0 / denominator

    if exact and ratio == 1:
        verdict = "PROMOTED"
        decision = "SURVIVED_R1_IDENTITY"
        meaning = "A eliminacao radial independente reproduz a forma alvo e o matching termo a termo infere R=1, sem identificar a massa radial com o parametro m2 de P(X)."
    elif exact:
        verdict = "REJECTED"
        decision = "R_NOT_ONE"
        meaning = "A forma alvo reaparece no matching independente, mas o R inferido difere de 1."
    else:
        verdict = "REJECTED"
        decision = "EXTRA_COEFFICIENT_REQUIRED"
        meaning = "Os coeficientes derivados da eliminacao radial nao fecham termo a termo na forma alvo sem um coeficiente independente."

    return {
        "verdict": verdict,
        "decision": decision,
        "summary": f"Matching independente: R={fstr(ratio)}; coeficientes {'fecham' if exact else 'nao fecham'} termo a termo.",
        "statistics": {
            "angular_scale": fstr(angular_scale),
            "radial_mu2": fstr(radial_mu2),
            "derived_p_coefficients": {"x2": fstr(coeff_x2), "x": fstr(coeff_x), "constant": fstr(coeff_0)},
            "inferred_target_parameters": {"m2": fstr(target_m2), "lambda": fstr(target_lambda), "v0": fstr(target_v0)},
            "reconstructed_target_coefficients": {"x2": fstr(target_x2), "x": fstr(target_x), "constant": fstr(target_0)},
            "r": fstr(ratio),
            "exact_termwise_match": exact,
            "independent_symbol_check": target_m2 != radial_mu2,
            "data_sources": []
        },
        "semantic": {
            "result_meaning": meaning,
            "verdict_plain": "Sobreviveu ao ataque" if verdict == "PROMOTED" else "Refutado pelo ataque"
        }
    }


if __name__ == "__main__":
    try:
        params = json.load(open(os.environ["PARAMS_PATH"], encoding="utf-8"))
        payload = run(params)
    except (OSError, ValueError, KeyError, ZeroDivisionError) as error:
        payload = {
            "verdict": "INCONCLUSIVE",
            "decision": "INVALID_SYMBOLIC_INPUT",
            "summary": str(error),
            "statistics": {"data_sources": []},
            "semantic": {
                "result_meaning": "O matching nao pode ser avaliado com os parametros declarados: " + str(error),
                "verdict_plain": "Inconclusivo"
            }
        }
    with open(os.environ["RESULT_PATH"], "w", encoding="utf-8") as result:
        json.dump(payload, result, ensure_ascii=False, allow_nan=False)
    print(payload["summary"])
