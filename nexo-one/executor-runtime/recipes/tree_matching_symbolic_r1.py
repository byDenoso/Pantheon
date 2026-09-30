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
    scale = frac(params.get("field_scale", 1))
    mass = frac(params.get("mass_scale", 1))
    if scale <= 0 or mass <= 0:
        raise ValueError("field_scale e mass_scale devem ser positivos")

    m4 = mass ** 4
    coeff_x2 = Fraction(1, 1) / (scale ** 4 * m4)
    coeff_x = Fraction(-2, 1) / (scale ** 2)
    coeff_0 = Fraction(0, 1)

    m2 = scale ** 2 * m4
    lam = scale ** 4 * m4
    v0 = m4
    target_x2 = Fraction(1, 1) / lam
    target_x = Fraction(-2, 1) * m2 / lam
    target_0 = m2 * m2 / lam - v0
    ratio = lam * v0 / (m2 * m2)

    exact = (coeff_x2, coeff_x, coeff_0) == (target_x2, target_x, target_0)
    if exact and ratio == 1:
        verdict = "PROMOTED"
        decision = "SURVIVED_R1_IDENTITY"
        meaning = "A eliminação radial reproduz exatamente a forma alvo e R=1 sob a reparametrização declarada, sem coeficiente livre adicional."
    elif exact:
        verdict = "REJECTED"
        decision = "R_NOT_ONE"
        meaning = "A forma alvo reaparece, mas R difere de 1; o ataque refuta a identidade R=1."
    else:
        verdict = "REJECTED"
        decision = "EXTRA_COEFFICIENT_REQUIRED"
        meaning = "Os coeficientes não fecham termo a termo na forma alvo; seria necessário um coeficiente independente."

    return {
        "verdict": verdict,
        "decision": decision,
        "summary": f"Matching simbólico exato: R={fstr(ratio)}; coeficientes {'fecham' if exact else 'não fecham'} termo a termo.",
        "statistics": {
            "field_scale": fstr(scale),
            "mass_scale": fstr(mass),
            "p_coefficients": {"x2": fstr(coeff_x2), "x": fstr(coeff_x), "constant": fstr(coeff_0)},
            "target_parameters": {"m2": fstr(m2), "lambda": fstr(lam), "v0": fstr(v0)},
            "target_coefficients": {"x2": fstr(target_x2), "x": fstr(target_x), "constant": fstr(target_0)},
            "r": fstr(ratio),
            "exact_termwise_match": exact,
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
                "result_meaning": "O matching não pôde ser avaliado com os parâmetros declarados: " + str(error),
                "verdict_plain": "Inconclusivo"
            }
        }
    with open(os.environ["RESULT_PATH"], "w", encoding="utf-8") as result:
        json.dump(payload, result, ensure_ascii=False, allow_nan=False)
    print(payload["summary"])
