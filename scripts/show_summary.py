import json
from pathlib import Path

root = Path(__file__).resolve().parents[1]
main = json.loads((root / "results/reference_metrics.json").read_text())
robust = json.loads((root / "results/robustness_metrics.json").read_text())

print("Primary analyses")
for name, result in main["checks"].items():
    print(f"  {name}: {result.get('status', 'n/a')}")
print("\nAdditional robustness checks")
for name, result in robust["checks"].items():
    print(f"  {name}: {result.get('status', 'n/a')}")
