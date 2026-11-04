# CAMB transfer-reuse recipe (draft)

This is an opt-in scalar CMB utility, not a replacement for frozen solvers or
likelihoods. It does not dispatch jobs, change nested settings, or upload files.

## Usage

Install official `camb==1.6.6` and numpy in Python 3.12. Put the recipes directory
on `PYTHONPATH`. Always use a main guard because workers use spawn:

```python
from camb_fast import evaluate

if __name__ == '__main__':
    cls = evaluate(
        {'H0': 67.5, 'ombh2': .022, 'omch2': .122, 'tau': .06},
        [{'primordial': {'As': 2.1e-9, 'ns': .965}},
         {'primordial': {'As': 2.2e-9, 'ns': .970}},
         {'background': {'H0': 68.0}, 'primordial': {'ns': .970}}],
        profile='standard', cache_dir='/private/cache/camb', workers=2,
        threads=1)
    # Return/persist to the approved private destination. Do not print cls.
```

Arrays are raw C_ell in microkelvin squared; columns TT, EE, BB, TE, including
ell 0 and 1. These are total (lensed scalar) spectra, not D_ell. No tensors are
supported. Every varying non-primordial parameter belongs in `background`.
CAMB validates keys and domains. EDE or other custom background models must be
expressible through the installed CAMB `set_params`; unsupported models fail,
not silently fall back to LCDM. Caller-owned custom Fortran objects are outside
this JSON-compatible API.

Primordial power is represented with `SplinedInitialPower`, including power
laws sampled on 8192 log-spaced k nodes. Custom scalar features use `k` and `pk`
lists together (no As/ns in that variant), with positive increasing k,
nonnegative finite power and coverage 1e-7 to 100 Mpc^-1. Resolution of sharp
features requires a separate convergence check; this interface does not assert
that every arbitrary feature is resolved.

## Profiles

| Profile | lmax | lens_potential_accuracy | AccuracyBoost |
|---|---:|---:|---:|
| fast | 512 | 0 | 1 |
| standard | 3000 | 0 | 1 |
| high | 3000 | 1 | 2 |

These are numerical presets, not scientific accuracy guarantees. `standard`
uses linear lensing settings from CAMB at lens_potential_accuracy=0. CAMB may
turn nonlinear lensing on for high. In that case we reuse time sources
(`only_time_sources=True`) rather than frozen nonlinear transfer functions,
so nonlinear corrections are recomputed for each primordial spectrum. Explicit
CAMB NonLinear settings and all input background keys participate in identity.

## Cache and processes

Within each background group, one worker computes transfers once, then calls
`power_spectra_from_transfer` for each primordial spectrum. Different backgrounds
(including H0/densities/EDE) cannot share transfer state. Groups are processed
with `ProcessPoolExecutor(spawn)`, with OMP/BLAS thread counts set before imports.
`workers * threads` cannot exceed the process CPU affinity. A single background
group uses one worker by design; splitting it would duplicate transfer work.

Disk caching is **spectrum caching**, not serialization of CAMB's Fortran
transfer state. CAMBdata cannot safely be restored from a pickle. A fresh process
with a new primordial variant rebuilds transfers even if the background cache
directory exists. This is an explicit remaining limitation relative to a true
persistent transfer-state cache; no unsafe pickle/repr/eval restore is attempted.
The parent key hashes background inputs, complete profile, schema, CAMB version,
and actual CAMB shared-library SHA-256. Entries add the primordial hash and
store raw spectra in NPZ with `allow_pickle=False`, atomic replacement and private
file modes. Nonfinite or malformed records are recomputed. Use a trusted private
cache directory, never a shared untrusted cache or public Actions artifact.
Concurrent writers may duplicate computation but cannot expose partial records.

## Verification

```
python -m unittest discover -s nexo-one/executor-runtime/recipes/tests -p test_camb_fast.py
python nexo-one/executor-runtime/recipes/tests/benchmark_camb_fast.py --output /private/new-benchmark.json
```

The second command performs 20 full calculations and 20 transfer-reuse variants,
without disk hits, using standard and one thread; process/setup time is included.
It checks TT/TE/EE for ell 2 through 3000. Relative error is literally
abs(delta C_ell / reference C_ell), with no floor concealing TE zero crossings;
exact reference zero requires exact agreement. The output includes the largest
error, timings, and pass/fail. It prints only STATUS, and fails if speedup <5 or
relative error >1e-4. Never upload its numerical output to public logs/artifacts.
Speedup is hardware-dependent; the target is a measured gate, not a guarantee.
Both paths use the same spline: this isolates transfer reuse, not spline-vs-
analytic or feature-resolution error. Those require separate controls.

CI executes only the synthetic/public-fixture fast smoke under a 180-second
timeout. It never uploads logs or numbers; failed raw diagnostics remain only
in the runner temporary directory. CI does not run the expensive benchmark.

Sources: https://camb.readthedocs.io/en/latest/results.html#camb.results.CAMBdata.power_spectra_from_transfer
and https://camb.readthedocs.io/en/latest/initialpower.html . Consult the installed
version source when API or nonlinear behavior differs. No observational data or
scientific results from the private campaign are embedded in this change.
