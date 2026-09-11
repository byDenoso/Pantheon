import test from 'node:test';
import assert from 'node:assert/strict';
import {buildDomainNavigatorModel} from '../src/components/DomainNavigator/domain-model.mjs';

const graph={
  nodes:[
    {id:'system:SCIENCE',type:'SYSTEM',label:'Ciência',status:'active'},
    {id:'domain:D1',type:'DOMAIN',domain:'D1',label:'Expansion',status:'ACTIVE',summary:'H0'},
    {id:'domain:D3',type:'DOMAIN',domain:'D3',label:'Dark Energy',status:'ACTIVE',summary:'DE'},
    {id:'domain:D7',type:'DOMAIN',domain:'D7',label:'CMB',status:'ACTIVE'},
  ],
  domainLinks:[
    {a:'D3',b:'D7',tests:30},
    {a:'D1',b:'D3',tests:4},
    {a:'D3',b:'DX',tests:99},
  ],
};

test('domain navigator uses only published domains and declared links',()=>{
  const model=buildDomainNavigatorModel('science',graph);
  assert.deepEqual(model.domains.map(d=>d.id),['D1','D3','D7']);
  assert.equal(model.relations.length,2);
  assert.ok(model.relations.every(r=>r.declared===true));
  assert.equal(model.relations.some(r=>r.target==='DX'||r.source==='DX'),false);
});

test('domain navigator layout is deterministic and finite',()=>{
  const a=buildDomainNavigatorModel('science',graph);const b=buildDomainNavigatorModel('science',graph);
  assert.deepEqual(a.domains.map(d=>d.position),b.domains.map(d=>d.position));
  for(const domain of a.domains){assert.ok(Number.isFinite(domain.position.x));assert.ok(Number.isFinite(domain.position.y));assert.ok(Number.isFinite(domain.position.z))}
});

test('relation strength uses published shared-test count without inventing it',()=>{
  const model=buildDomainNavigatorModel('science',graph);
  const relation=model.relations.find(r=>r.source==='D3'&&r.target==='D7');
  assert.equal(relation?.strength,30);
  assert.equal(model.domains.find(d=>d.id==='D3')?.relationCount,2);
});
