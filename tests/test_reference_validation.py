from pantheon_residuals.reference import validate_reference

def test_reference_validation_passes():
    assert validate_reference()==[]
