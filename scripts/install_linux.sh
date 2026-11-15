#!/usr/bin/env bash
# Usage: scripts/install_linux.sh   (from the repository root). OpenMPI + Python deps + Planck 2018 data (~35 MB).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
sudo apt-get update -qq && sudo apt-get install -y -qq openmpi-bin libopenmpi-dev gfortran > /dev/null
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
python -c "import camb, cobaya, mpi4py; print('camb', camb.__version__, 'cobaya', cobaya.__version__, 'mpi4py', mpi4py.__version__)"
