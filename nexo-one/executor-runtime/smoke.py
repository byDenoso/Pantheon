from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import requests
import scipy
from scipy.linalg import solve


def require_command(name: str) -> str:
    path = shutil.which(name)
    if not path:
        raise RuntimeError(f"missing_command:{name}")
    return path


def main() -> int:
    commands = {name: require_command(name) for name in ("git", "tar", "curl", "timeout")}

    matrix = np.array([[3.0, 1.0], [1.0, 2.0]])
    vector = np.array([9.0, 8.0])
    solution = solve(matrix, vector)
    if not np.allclose(solution, np.array([2.0, 3.0]), atol=1e-10):
        raise RuntimeError("scipy_numeric_check_failed")

    import camb  # pip CAMB (Recfast); the exact CosmoRec build is runtime/portable_camb
    res = camb.get_results(camb.set_params(H0=67.4, ombh2=0.0224, omch2=0.12, As=2.1e-9, ns=0.965))
    if abs(res.get_derived_params()["thetastar"] - 1.0412) > 0.001:
        raise RuntimeError("camb_thetastar_check_failed")

    frame = pd.DataFrame({"x": np.arange(5, dtype=float)})
    if float(frame["x"].mean()) != 2.0:
        raise RuntimeError("pandas_check_failed")

    headers = {"User-Agent": "nexo-actions-runtime-smoke"}
    token = os.environ.get("GH_TOKEN", "").strip()
    if token:
        headers["Authorization"] = "Bearer " + token
    response = requests.get(
        "https://api.github.com/repos/byDenoso/TCC",
        headers=headers,
        timeout=20,
    )
    response.raise_for_status()
    if response.json().get("full_name") != "byDenoso/TCC":
        raise RuntimeError("network_readback_mismatch")

    with Path("/tmp/nexo-actions-smoke.txt").open("w", encoding="utf-8") as handle:
        handle.write("PASS\n")
    if Path("/tmp/nexo-actions-smoke.txt").read_text(encoding="utf-8") != "PASS\n":
        raise RuntimeError("filesystem_readback_failed")

    tar = subprocess.run(
        [commands["tar"], "--help"],
        check=True,
        capture_output=True,
        text=True,
    )
    if "zstd" not in (tar.stdout + tar.stderr).lower():
        raise RuntimeError("tar_zstd_support_missing")

    print(json.dumps({
        "status": "PASS",
        "python": sys.version.split()[0],
        "numpy": np.__version__,
        "scipy": scipy.__version__,
        "pandas": pd.__version__,
        "requests": requests.__version__,
        "network": "PASS",
        "filesystem": "PASS",
        "tar_zstd": "PASS",
        "commands": sorted(commands),
    }, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
