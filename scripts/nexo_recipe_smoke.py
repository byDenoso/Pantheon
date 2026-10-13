"""Operational recipe smoke status and an idempotent issue projection. No Tower writes."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile

TITLE = 'NEXO: receita quebrou no teste de fumaça'
START = '<!-- NEXO_RECIPE_SMOKE_V1 -->'
END = '<!-- /NEXO_RECIPE_SMOKE_V1 -->'
REQUIRED = {'verdict', 'decision', 'summary', 'statistics', 'semantic'}
RETIRED_PROBES = {'tower_native': 'SKIPPED_PUBLIC_SOURCE_RETIRED'}


def fingerprint(rows):
    identities = sorted((row['recipe'], row['state'], row['reason']) for row in rows if row['state'] != 'PASS')
    return hashlib.sha256(json.dumps(identities, separators=(',', ':')).encode()).hexdigest()


def run_smoke(recipes, output, execute=subprocess.run):
    rows = [{'recipe': name, 'state': 'SKIPPED', 'reason': reason} for name, reason in RETIRED_PROBES.items()]
    with tempfile.TemporaryDirectory(prefix='nexo-recipe-smoke-') as scratch:
        params_files = sorted((recipes / 'smoke').glob('*.json'))
        if not params_files:
            rows.append({'recipe': 'inventory', 'state': 'FAILED', 'reason': 'SMOKE_PARAMS_MISSING'})
        for params in params_files:
            name = params.stem
            # This public route was withdrawn for privacy. An expected 404 is
            # not a recipe crash, nor permission to recover old public bytes.
            if name in RETIRED_PROBES:
                continue
            else:
                result = Path(scratch) / (name + '.json')
                env = {**os.environ, 'PARAMS_PATH': str(params), 'RESULT_PATH': str(result)}
                try:
                    process = execute([sys.executable, str(recipes / (name + '.py'))], env=env,
                                      capture_output=True, text=True, timeout=1500)
                    if process.returncode:
                        tail = process.stderr.strip().splitlines()
                        reason = tail[-1] if tail else 'EXIT_' + str(process.returncode)
                        # Temporary filesystem paths do not change fault identity.
                        reason = re.sub(re.escape(scratch), '<smoke-temp>', reason)[:500]
                        rows.append({'recipe': name, 'state': 'FAILED', 'reason': reason})
                    else:
                        value = json.loads(result.read_text(encoding='utf-8'))
                        missing = REQUIRED - set(value) if isinstance(value, dict) else REQUIRED
                        rows.append({'recipe': name, 'state': 'FAILED' if missing else 'PASS',
                                     'reason': 'OUTPUT_FIELDS_MISSING:' + ','.join(sorted(missing)) if missing else 'OUTPUT_SHAPE_VALID'})
                except subprocess.TimeoutExpired:
                    rows.append({'recipe': name, 'state': 'FAILED', 'reason': 'RECIPE_TIMEOUT'})
                except (OSError, ValueError, TypeError) as error:
                    rows.append({'recipe': name, 'state': 'FAILED', 'reason': type(error).__name__})
            output.write_text(json.dumps({'rows': rows, 'fingerprint': fingerprint(rows)}, ensure_ascii=False), encoding='utf-8')
            print(name + ': ' + rows[-1]['state'] + ' ' + rows[-1]['reason'], flush=True)
        if not params_files:
            output.write_text(json.dumps({'rows': rows, 'fingerprint': fingerprint(rows)}), encoding='utf-8')
    return int(any(row['state'] == 'FAILED' for row in rows))


def issue_body(previous, report, run_url):
    rows = report['rows']
    current = fingerprint(rows)
    state = 'FAILED' if any(row['state'] == 'FAILED' for row in rows) else 'PARTIAL' if any(row['state'] == 'SKIPPED' for row in rows) else 'READY'
    marker = f'<!-- fingerprint:{current};state:{state} -->'
    if marker in previous:
        return None
    details = '\n'.join(f"- {row['recipe']}: {row['state']} — {row['reason']}" for row in rows if row['state'] != 'PASS')
    section = f'{START}\n{marker}\nProntidão técnica: {state}\n\n{details or "Todas as receitas verificadas passaram o smoke técnico."}\n\nPrimeira rodada deste estado: {run_url}\nSmoke não comprova execução científica integral nem registro canônico.\n{END}'
    if START in previous:
        if END not in previous:
            raise ValueError('SMOKE_ISSUE_MARKER_INCOMPLETE')
        before, rest = previous.split(START, 1)
        _, after = rest.split(END, 1)
        return before + section + after
    return previous.rstrip() + ('\n\n' if previous else '') + section


def notify(report, run_url, gh=subprocess.run):
    def command(args):
        result = gh(['gh', *args], check=True, capture_output=True, text=True)
        return result.stdout
    # Paginate the exact API collection; search ranking cannot choose the issue.
    repo = os.environ['GH_REPO']
    pages = json.loads(command(['api', '--paginate', '--slurp', f'repos/{repo}/issues?state=open&per_page=100']))
    matches = [item for page in pages for item in page if item.get('title') == TITLE and 'pull_request' not in item]
    if len(matches) > 1:
        raise ValueError('SMOKE_ISSUE_IDENTITY_AMBIGUOUS')
    issue = matches[0] if matches else None
    if issue is None and not any(row['state'] == 'FAILED' for row in report['rows']):
        return
    previous = issue.get('body') or '' if issue else ''
    body = issue_body(previous, report, run_url)
    if body is None:
        print('Smoke issue unchanged; no duplicate notification.')
        return
    with tempfile.TemporaryDirectory(prefix='nexo-smoke-notice-') as scratch:
        path = Path(scratch) / 'body.md'
        path.write_text(body, encoding='utf-8')
        if issue:
            number = str(issue['number'])
            command(['issue', 'edit', number, '--body-file', str(path)])
        else:
            url = command(['issue', 'create', '--title', TITLE, '--body-file', str(path)]).strip()
            number = url.rsplit('/', 1)[-1]
            if not number.isdigit():
                raise ValueError('SMOKE_ISSUE_CREATE_ID_INVALID')
        readback = json.loads(command(['issue', 'view', number, '--json', 'body']))
        if readback.get('body') != body:
            raise ValueError('SMOKE_ISSUE_READBACK_FAILED')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('action', choices=['run', 'notify'])
    parser.add_argument('--report', type=Path, required=True)
    parser.add_argument('--recipes', type=Path)
    parser.add_argument('--run-url')
    args = parser.parse_args()
    if args.action == 'run':
        sys.exit(run_smoke(args.recipes, args.report))
    report = json.loads(args.report.read_text(encoding='utf-8'))
    if not report.get('rows') or report.get('fingerprint') != fingerprint(report['rows']):
        raise ValueError('SMOKE_REPORT_INVALID')
    notify(report, args.run_url)
