"""Public-API progress monitor (no token): python monitor.py   |   curl -s https://raw.githubusercontent.com/byDenoso/Pantheon/nested/peer-n2/code/monitor.py | python -
Shows the Actions runs of branch nested/peer-n2, the jobs of each run and the 'N2 ... progress' notice annotations
(it / ncall / logz of the checkpoint at the end of each chunk, written by the workflow)."""
import json, sys, urllib.request as u

REPO, BRANCH = 'byDenoso/Pantheon', 'nested/peer-n2'


def get(url):
    r = u.Request(url, headers={'Accept': 'application/vnd.github+json', 'User-Agent': 'n2-monitor'})
    return json.load(u.urlopen(r, timeout=30))


runs = get(f'https://api.github.com/repos/{REPO}/actions/runs?branch={BRANCH.replace("/", "%2F")}&per_page=30')['workflow_runs']
print(f'{len(runs)} runs on {BRANCH}')
for r in runs[:12]:
    print(f"RUN {r['id']} #{r['run_number']} {r['event']} {r['status']}/{r['conclusion']} {r['created_at']} {r['html_url']}")
    for j in get(r['jobs_url'] + '?per_page=50')['jobs']:
        line = f"   {j['name'][:48]:48s} {j['status']}/{j['conclusion']} start={j['started_at']} end={j['completed_at']}"
        steps = [s['name'] for s in j.get('steps', []) if s['status'] == 'in_progress']
        if steps:
            line += f' step={steps[0]}'
        print(line)
        try:
            for a in get(f"https://api.github.com/repos/{REPO}/check-runs/{j['id']}/annotations"):
                if 'N2' in (a.get('title') or ''):
                    print('      NOTICE', a['title'], '|', a['message'][:300])
        except Exception as e:
            print('      (annotations unavailable)', e)
