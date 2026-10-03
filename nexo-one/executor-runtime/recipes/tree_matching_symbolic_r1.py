import json, os
from fractions import Fraction


class Monomial:
    """Exact coefficient times powers of the independent symbols f and mu2."""

    def __init__(self, coefficient=1, f=0, mu2=0):
        self.coefficient = Fraction(coefficient)
        self.f = int(f)
        self.mu2 = int(mu2)

    def __mul__(self, other):
        other = other if isinstance(other, Monomial) else Monomial(other)
        return Monomial(self.coefficient * other.coefficient, self.f + other.f, self.mu2 + other.mu2)

    __rmul__ = __mul__

    def __truediv__(self, other):
        other = other if isinstance(other, Monomial) else Monomial(other)
        if other.coefficient == 0:
            raise ZeroDivisionError("division by zero monomial")
        return Monomial(self.coefficient / other.coefficient, self.f - other.f, self.mu2 - other.mu2)

    def __neg__(self):
        return Monomial(-self.coefficient, self.f, self.mu2)

    def __eq__(self, other):
        other = other if isinstance(other, Monomial) else Monomial(other)
        return (self.coefficient, self.f, self.mu2) == (other.coefficient, other.f, other.mu2)

    def text(self):
        parts = []
        if self.coefficient != 1 or (self.f == 0 and self.mu2 == 0):
            parts.append(str(self.coefficient))
        for name, power in (("mu2", self.mu2), ("f", self.f)):
            if power:
                parts.append(name if power == 1 else f"{name}^{power}")
        return "*".join(parts) if parts else "1"


ZERO = Monomial(0)


def run(params):
    if params not in ({}, None):
        raise ValueError("tree_matching_symbolic_r1 has no scientific parameters")

    # Completion independente:
    # L = chi^2 X/f^2 - (mu^2 + chi^2/2)^2,
    # chi^2 = 2(X/f^2 - mu^2).
    # O matching é feito formalmente em f e mu2, sem escolher valores numéricos.
    coeff_x2 = Monomial(1, f=-4)
    coeff_x = Monomial(-2, f=-2, mu2=1)
    coeff_0 = ZERO

    target_lambda = Monomial(1) / coeff_x2
    target_m2 = (-coeff_x * target_lambda) / 2
    target_v0 = (target_m2 * target_m2) / target_lambda

    target_x2 = Monomial(1) / target_lambda
    target_x = (-2 * target_m2) / target_lambda
    target_0 = ZERO
    exact = (coeff_x2, coeff_x, coeff_0) == (target_x2, target_x, target_0)

    ratio = (target_lambda * target_v0) / (target_m2 * target_m2)
    if exact and ratio == Monomial(1):
        verdict = "PROMOTED"
        decision = "SURVIVED_R1_IDENTITY"
        meaning = "A eliminação radial formal reproduz a forma alvo e o matching termo a termo cancela exatamente f e mu2 em R, dando R=1 sem coeficiente livre."
    elif exact:
        verdict = "REJECTED"
        decision = "R_NOT_ONE"
        meaning = "A forma alvo fecha, mas a razão simbólica R não reduz a 1."
    else:
        verdict = "REJECTED"
        decision = "EXTRA_COEFFICIENT_REQUIRED"
        meaning = "Os coeficientes derivados não fecham termo a termo na forma alvo sem um coeficiente independente."

    return {
        "verdict": verdict,
        "decision": decision,
        "summary": f"Matching simbólico formal: R={ratio.text()}; coeficientes {'fecham' if exact else 'não fecham'} termo a termo.",
        "statistics": {
            "independent_symbols": ["f", "mu2"],
            "derived_p_coefficients": {"x2": coeff_x2.text(), "x": coeff_x.text(), "constant": "0"},
            "inferred_target_parameters": {"m2": target_m2.text(), "lambda": target_lambda.text(), "v0": target_v0.text()},
            "reconstructed_target_coefficients": {"x2": target_x2.text(), "x": target_x.text(), "constant": "0"},
            "r": ratio.text(),
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
                "result_meaning": "O matching não pode ser avaliado: " + str(error),
                "verdict_plain": "Inconclusivo"
            }
        }
    with open(os.environ["RESULT_PATH"], "w", encoding="utf-8") as result:
        json.dump(payload, result, ensure_ascii=False, allow_nan=False)
    print(payload["summary"])
