import test from 'node:test';
import assert from 'node:assert/strict';
import {buildGraphMode} from '../src/viewmodels/graph-modes.ts';

const fresh={state:'LIVE',observed_at:'2026-09-16T20:00:00Z',ttl_seconds:900};
const state={contract_version:'1',generated_at:'2026-09-16T20:00:00Z',actions:[],runs:[],capabilities:[],filaments:[],providers:[],findings:[],graph:{nodes:[{id:'domain:nexo',type:'DOMAIN',label:'NEXO',domain:'NEXO',state:'LIVE',authority_class:'TRUTH_OWNER',source_ref:'nexo',source_revision:'1',fingerprint:'root',freshness:fresh,checked_at:'2026-09-16T20:00:00Z',summary:'root'}],edges:[]}};
const world={version:'1',fingerprint:'world-private',generatedAt:'2026-09-16T20:00:00Z',access:'PRIVATE',providers:[{id:'gmail',label:'Gmail',status:'AVAILABLE',lastSuccessAt:'2026-09-16T20:00:00Z',checkedAt:'2026-09-16T20:00:00Z',revision:'gm1',message:'Conta privada conectada',partial:false,count:1}],items:[{id:'mail-1',kind:'MESSAGE',title:'Assunto privado de teste',summary:'private-message-body',source:'gmail',sourceRef:'gmail:mail-1',authority:'PROVIDER',freshness:{state:'LIVE',observedAt:'2026-09-16T20:00:00Z',expiresAt:'2026-09-16T21:00:00Z'},contextId:'NEXO',attention:'NOTICE',actions:[],observedAt:'2026-09-16T20:00:00Z'}],contexts:[],issues:[],truthGraph:{fingerprint:'tg',checked_at:'2026-09-16T20:00:00Z',results:[],material_conflicts:[]},diff:{previous:null,current:'world-private',added:[],updated:[],removed:[],providerChanges:[]}};

test('PRIVATE NEXO Live materializes authenticated private WorldState items',()=>{
 const graph=buildGraphMode(state,'nexo','PRIVATE',world);
 assert.ok(graph.nodes.some(node=>node.label==='Assunto privado de teste'));
 assert.ok(graph.edges.some(edge=>edge.from==='provider:gmail'&&edge.to==='world:gmail:mail-1'));
});

test('PUBLIC NEXO Live never materializes private WorldState item payload',()=>{
 const graph=buildGraphMode(state,'nexo','PUBLIC',world);
 assert.equal(graph.nodes.some(node=>node.label==='Assunto privado de teste'),false);
 assert.equal(JSON.stringify(graph).includes('private-message-body'),false);
 const gmail=graph.nodes.find(node=>node.id==='provider:gmail');
 assert.ok(gmail);
 assert.match(gmail.summary,/AUTH_REQUIRED/);
});
