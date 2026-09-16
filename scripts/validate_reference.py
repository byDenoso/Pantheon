from pantheon_residuals.reference import validate_reference
errors=validate_reference()
if errors:
    [print(f"FAIL: {e}") for e in errors]
    raise SystemExit(1)
print("PASS: frozen publication reference is internally consistent")
