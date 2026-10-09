"""Prepare a sanitized public derivative from a verified private Writer readback.

The private projector input lives only in a temporary directory and is removed.
No deployment, domain update, Tower write, or autonomy activation occurs here.
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path


def prepare_public_campaigns(*, tower: Path | None = None, root: Path | None = None,
                             tcc_root: Path, output: Path, node: str = "node") -> dict:
    if bool(tower) == bool(root):
        raise ValueError("EXACTLY_ONE_CANONICAL_SOURCE_REQUIRED")
    tcc_root = tcc_root.resolve()
    if not (tcc_root / "runtime/nexo_agent_api/public_campaigns.py").is_file():
        raise ValueError("PUBLIC_CAMPAIGN_RUNTIME_UNAVAILABLE")
    script = Path(__file__).with_name("build-public-campaigns.mjs")
    env = dict(os.environ)
    env["PYTHONPATH"] = str(tcc_root) + os.pathsep + env.get("PYTHONPATH", "")
    with tempfile.TemporaryDirectory(prefix="nexo-public-writer-") as temporary:
        private_input = Path(temporary) / "writer-input.private.json"
        command = [sys.executable, "-m", "runtime.nexo_agent_api.public_campaigns",
                   "--tower" if tower else "--root", str((tower or root).resolve()),
                   "--output", str(private_input)]
        exported = subprocess.run(command, cwd=tcc_root, env=env, capture_output=True, timeout=120)
        if exported.returncode:
            raise ValueError("PUBLIC_CAMPAIGN_CANONICAL_EXPORT_FAILED")
        if private_input.stat().st_size > 64 * 1024 * 1024:
            raise ValueError("PUBLIC_WRITER_PACKAGE_TOO_LARGE")
        prepared = subprocess.run([node, str(script), "--input", str(private_input),
                                   "--output", str(output.resolve())], capture_output=True, timeout=120)
        if prepared.returncode:
            raise ValueError("PUBLIC_CAMPAIGN_COMMITMENT_OR_POLICY_FAILED")
        receipt = json.loads(prepared.stdout)
        if receipt.get("status") not in {"PUBLIC_CAMPAIGNS_PREPARED", "PUBLIC_CAMPAIGNS_PENDING"}:
            raise ValueError("PUBLIC_CAMPAIGN_PREPARATION_RECEIPT_INVALID")
        return receipt


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--tower", type=Path)
    source.add_argument("--root", type=Path)
    parser.add_argument("--tcc-root", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--node", default="node")
    args = parser.parse_args(argv)
    try:
        receipt = prepare_public_campaigns(tower=args.tower, root=args.root,
                                          tcc_root=args.tcc_root, output=args.output, node=args.node)
    except (OSError, subprocess.SubprocessError, ValueError) as error:
        # Raw private process output is deliberately excluded from workflow logs.
        reason = str(error) if isinstance(error, ValueError) else type(error).__name__
        print(json.dumps({"status": "PUBLIC_CAMPAIGNS_FAILED", "reason": reason,
                          "previousPreserved": True}))
        return 1
    print(json.dumps(receipt))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
