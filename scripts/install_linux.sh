#!/usr/bin/env bash
# Usage: scripts/install_linux.sh s1|s2   (run from the repository root)
# s1: Python deps + Planck 2018 data (lowl TT/EE, plik-lite, lensing) -> data/packages  (~35 MB)
# s2: s1 + ACT DR6 dr6_data.fits (~0.4 GB, cobaya-install) + spt_candl_data at the pinned commit (~0.55 GB) + act_dr6_mflike example
set -euo pipefail
STACK="${1:-s1}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
mkdir -p data/packages
cat > /tmp/install_planck.yaml <<YAML
packages_path: ${ROOT}/data/packages
likelihood:
  planck_2018_lowl.TT: null
  planck_2018_lowl.EE: null
  planck_2018_highl_plik.TTTEEE_lite_native: null
  planck_2018_lensing.native: null
YAML
cobaya-install /tmp/install_planck.yaml --skip-global
if [ "$STACK" = "s2" ]; then
  cat > /tmp/install_act.yaml <<YAML
packages_path: ${ROOT}/data/packages
likelihood:
  act_dr6_mflike.ACTDR6MFLike: null
YAML
  cobaya-install /tmp/install_act.yaml --skip-global
  # SPT-3G D1 TnE: official package (needed for its custom foreground transformations) pinned to one commit, plus the same
  # commit fetched as a data checkout (cobaya template yaml). ACT checkout: only the example yaml is read.
  python -m pip install "spt_candl_data @ git+https://github.com/SouthPoleTelescope/spt_candl_data@f22611a9671d50af6135f048a2ea3f43ef4c2f62"
  if [ ! -d data/spt_candl_data/.git ]; then
    git init data/spt_candl_data
    git -C data/spt_candl_data remote add origin https://github.com/SouthPoleTelescope/spt_candl_data
    git -C data/spt_candl_data fetch --depth 1 origin f22611a9671d50af6135f048a2ea3f43ef4c2f62
    git -C data/spt_candl_data checkout FETCH_HEAD
  fi
  if [ ! -d data/act_dr6_mflike/.git ]; then
    git init data/act_dr6_mflike
    git -C data/act_dr6_mflike remote add origin https://github.com/ACTCollaboration/act_dr6_mflike
    git -C data/act_dr6_mflike fetch --depth 1 origin 4220e14efb3a995f47c9f54cb687479e558c6138
    git -C data/act_dr6_mflike checkout FETCH_HEAD
  fi
fi
python - <<'PY'
import camb, cobaya, dynesty
print('camb', camb.__version__, 'cobaya', cobaya.__version__, 'dynesty', dynesty.__version__)
PY
