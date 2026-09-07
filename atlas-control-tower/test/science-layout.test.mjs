import test from 'node:test';
import assert from 'node:assert/strict';
import {clusteredPositions} from '../ui/map-data.mjs';
import {nodeDisplayLabel} from '../ui/cockpit-copy.mjs';

const edge=(source,target)=>({source,target,type:'CONTAINS'});

test('Ciência usa composição assimétrica própria em vez do fallback radial',()=>{
 const domains=['D1','D2','D3','D4','D5','D6','D7','D8','D9','D10','D11','M1'].map(id=>({id:`domain:${id}`,type:'DOMAIN',label:id}));
 const data={nodes:[{id:'system:SCIENCE',type:'SYSTEM',label:'Ciência'},...domains],edges:domains.map(n=>edge('system:SCIENCE',n.id))};
 const positions=clusteredPositions(data,'system:SCIENCE',()=>{throw Error('radial fallback should not be used')});
 assert.equal(positions.length,data.nodes.length);
 assert.ok(positions.flat().every(Number.isFinite));
 const focus=positions[0],children=positions.slice(1);
 assert.ok(focus[0] < 0,'foco deve ficar deslocado para criar composição editorial');
 assert.ok(children.filter(p=>p[0]>focus[0]).length>=9,'maioria dos subdomínios deve se abrir para um lado');
 const radii=children.map(p=>Math.round(Math.hypot(p[0]-focus[0],p[1]-focus[1])));
 assert.ok(new Set(radii).size>=5,'distâncias devem variar para evitar simetria perfeita');
});

test('ao focar um domínio científico os testes formam mini-ramos assimétricos',()=>{
 const tests=Array.from({length:20},(_,i)=>({id:`T-D1-${String(i+1).padStart(3,'0')}`,type:'TEST',label:`Teste ${i+1}`}));
 const data={nodes:[{id:'domain:D1',type:'DOMAIN',label:'Expansão'},...tests],edges:tests.map(n=>edge('domain:D1',n.id))};
 const positions=clusteredPositions(data,'domain:D1',()=>{throw Error('generic fallback should not be used')});
 assert.equal(positions.length,data.nodes.length);
 assert.ok(positions.flat().every(Number.isFinite));
 const focus=positions[0],children=positions.slice(1);
 assert.ok(focus[0] < 0);
 const bands=new Set(children.map(p=>Math.round(p[1]/70)));
 assert.ok(bands.size>=4,'testes devem ocupar vários mini-ramos');
 assert.ok(children.some(p=>p[0]>180),'ramos devem se expandir para longe do foco');
});

test('subdomínios científicos ganham rótulos curtos e legíveis no mapa',()=>{
 assert.equal(nodeDisplayLabel({id:'domain:D1',label:'Expansion, H0 & Acoustic Geometry',type:'DOMAIN'}),'Expansão');
 assert.equal(nodeDisplayLabel({id:'domain:D7',label:'CMB, Recombination, Primordial Signatures & Systematics',type:'DOMAIN'}),'CMB');
 assert.equal(nodeDisplayLabel({id:'domain:D11',label:'Cosmic Megastructures, Homogeneity & Extreme-Structure Discovery',type:'DOMAIN'}),'Megastructures');
});
