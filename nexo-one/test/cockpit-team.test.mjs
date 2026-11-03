import test from 'node:test';
import assert from 'node:assert/strict';
import {parseCadence, nextRun, splitFronts, crew, tone} from '../src/cockpit/team.ts';

test('cadence text becomes a schedule only when it states one',()=>{
  assert.deepEqual(parseCadence('1h minuto 06'),{kind:'hourly',every:1,minute:6,label:'A cada hora, no minuto 06'});
  assert.deepEqual(parseCadence('a cada 3h às :10'),{kind:'hourly',every:3,minute:10,label:'A cada 3 h, no minuto 10'});
  assert.deepEqual(parseCadence('toda hora, minuto 38'),{kind:'hourly',every:1,minute:38,label:'A cada hora, no minuto 38'});
  assert.deepEqual(parseCadence('a cada 30 min'),{kind:'minutes',every:30,label:'A cada 30 min'});
  assert.deepEqual(parseCadence('diário 08:00'),{kind:'daily',hour:8,minute:0,label:'Diária, às 08:00'});
  assert.deepEqual(parseCadence('sob demanda'),{kind:'unknown',label:'sob demanda'});
  assert.deepEqual(parseCadence(''),{kind:'unknown',label:'Cadência não declarada'});
  assert.equal(parseCadence('1h minuto 75').kind,'unknown');
});

test('next run is computed only for hourly cadences with a fixed minute',()=>{
  const now=new Date(2026,10,3,10,20,0).getTime();
  assert.equal(nextRun(parseCadence('1h minuto 22'),now),new Date(2026,10,3,10,22,0).getTime());
  assert.equal(nextRun(parseCadence('1h minuto 06'),now),new Date(2026,10,3,11,6,0).getTime());
  assert.equal(nextRun(parseCadence('1h minuto 20'),now),new Date(2026,10,3,11,20,0).getTime());
  assert.equal(nextRun(parseCadence('a cada 3h às :10'),now),null);
  assert.equal(nextRun(parseCadence('diário 08:00'),now),null);
});

test('fronts split on commas and semicolons outside parentheses',()=>{
  assert.deepEqual(splitFronts('energia escura, geometria em alto z, H0 (R1, R2); testar HYP-1'),['energia escura','geometria em alto z','H0 (R1, R2)','testar HYP-1']);
  assert.deepEqual(splitFronts(''),[]);
});

test('crew joins declared roles with what each one registered, alerts first',()=>{
  const now=new Date(2026,10,3,10,20,0).getTime(),h=3_600_000;
  const equipe=[
    {papel:'S1 Expansao',task_id:'x',cadencia:'1h minuto 06',frentes:'H0, DE',estado:'ativo'},
    {papel:'S2 Estrutura',task_id:'y',cadencia:'1h minuto 22',frentes:'',estado:'ativo'},
    {papel:'S4 Refutacao',task_id:'z',cadencia:'1h minuto 38',frentes:'',estado:'pausado'},
    {papel:'S3 CMB',task_id:'w',cadencia:'1h minuto 14',frentes:'',estado:'erro de leitura'},
  ];
  const events=[
    {key:'a',kind:'mural',when:now-10*60_000,agent:'S1',title:'',body:'RESULTADO novo'},
    {key:'b',kind:'resultado',when:now-5*h,agent:'S1',title:'Teste X',body:''},
    {key:'c',kind:'resumo',when:now-60_000,agent:'S1',title:'',body:'mudança'},
    {key:'d',kind:'mural',when:now+h,agent:'S1',title:'',body:'futuro'},
  ];
  const out=crew(equipe,events,now);
  assert.deepEqual(out.map(m=>m.name),['S3','S4','S2','S1']);
  const s1=out.find(m=>m.name==='S1');
  assert.equal(s1.last,now-10*60_000);
  assert.equal(s1.lastText,'RESULTADO novo');
  assert.equal(s1.activeHours,2);
  assert.equal(s1.hours[23],1);
  assert.equal(s1.hours[18],1);
  assert.deepEqual(s1.fronts,['H0','DE']);
  assert.equal(out.find(m=>m.name==='S4').next,null);
  assert.equal(out.find(m=>m.name==='S3').next,null);
  assert.equal(out.find(m=>m.name==='S2').next,new Date(2026,10,3,10,22,0).getTime());
  assert.equal(tone('pausado'),'warn');
  assert.equal(tone('erro de leitura'),'bad');
});
