"""Final source-only wiring for the authorized NEXO release branch."""
from pathlib import Path

def replace(text,old,new):
    if text.count(old)!=1:raise RuntimeError('SOURCE_DRIFT:'+old[:80])
    return text.replace(old,new,1)

p=Path('nexo-one/server/inbox-gateway.mjs');s=p.read_text()
s=replace(s,'async function isRobot(req) {','export async function isRobot(req) {')
p.write_text(s,encoding='utf-8',newline='\n')
p=Path('scripts/nexo_operational_package.py');s=p.read_text()
s=replace(s,"    config=tower['files'].get('contracts/OPERATIONAL_RUNTIME_V1.json',{}).get('value',{})", """    entry=tower['files'].get('entities/artifact/OPERATIONAL-CONTROL-RUNTIME-V1.json',{}).get('value',{})
    require(not entry or entry.get('kind')=='NEXO_OPERATIONAL_RUNTIME_V1','CANONICAL_CONFIG_IDENTITY_INVALID')
    config=entry.get('payload') if entry else tower['files'].get('contracts/OPERATIONAL_RUNTIME_V1.json',{}).get('value',{})""")
p.write_text(s,encoding='utf-8',newline='\n')
print('Reused existing Writer OIDC verifier; canonical runtime configuration resolved.')
