"""Run the production Writer suite in the existing scripts/tests CI discovery."""
import importlib.util
from pathlib import Path


def load_tests(loader, tests, pattern):
    path = Path(__file__).resolve().parents[2] / "test" / "test_nexo_shadow_writer.py"
    spec = importlib.util.spec_from_file_location("shadow_writer_regression", path)
    if spec is None or spec.loader is None:
        raise RuntimeError("WRITER_TEST_MODULE_UNAVAILABLE")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return loader.loadTestsFromModule(module)
