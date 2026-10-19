import test from 'node:test';
import assert from 'node:assert/strict';
import {parseCsv,tableFromCsv,readShadowBoard,readShadowBoardSafe,ROADMAP_COLUMNS,MURAL_COLUMNS,SHADOW_ID} from '../server/atlas/shadow-board.mjs';

const roadmapCsv='item,titulo,status,dono,prio,proximo_teste,depende_de,atualizado,nota\nR1-1.1,"w0wa, offsets ""SN""",PARTIAL,S1,5,"Ajuste, sem CMB",,2026-10-19,\nR1-1.2,Varredura,OPEN,S1,4,Varrer,R1-1.1,2026-10-19,nota\n';
const muralCsv='data,de,para,texto,link\n2026-10-19,I,S1,"ACHADO: busca omite",PseudoMCP v3.0\n';
const transport=({fail=false,badId=false}={})=>async url=>{
  const href=String(url);
  if(fail)return {ok:false};
  if(href.includes('/drive/v3/files/'))return {ok:true,json:async()=>({id:badId?'outro':SHADOW_ID,modifiedTime:'2026-10-19T12:50:29.635Z'})};
  if(href.includes('sheet=ROADMAP'))return {ok:true,text:async()=>roadmapCsv};
  if(href.includes('sheet=MURAL'))return {ok:true,text:async()=>muralCsv};
  return {ok:false};
};

test('parseCsv respeita aspas, vírgulas e aspas duplas',()=>{
  const rows=parseCsv(roadmapCsv);
  assert.equal(rows.length,3);
  assert.equal(rows[1][1],'w0wa, offsets "SN"');
  assert.equal(rows[1][5],'Ajuste, sem CMB');
});

test('tableFromCsv exige o cabeçalho e ignora linhas vazias',()=>{
  const table=tableFromCsv(roadmapCsv+'\n,,,,,,,,\n',ROADMAP_COLUMNS);
  assert.equal(table.length,2);
  assert.equal(table[1].depende_de,'R1-1.1');
  assert.throws(()=>tableFromCsv('a,b\n1,2\n',MURAL_COLUMNS),/SHADOW_HEADER_INVALID/);
});

test('readShadowBoard devolve roadmap, mural e contagens',async()=>{
  const board=await readShadowBoard({token:'t',fetchImpl:transport()});
  assert.equal(board.contract,'NEXO_SHADOW_BOARD_V1');
  assert.equal(board.access,'PRIVATE');
  assert.deepEqual(board.counts,{roadmap:2,mural:1});
  assert.equal(board.modified_at,'2026-10-19T12:50:29.635Z');
  assert.equal(board.mural[0].de,'I');
});

test('falhas viram quadro indisponível, nunca exceção',async()=>{
  const failed=await readShadowBoardSafe({token:'t',fetchImpl:transport({fail:true})});
  assert.equal(failed.unavailable,'SHADOW_METADATA_UNAVAILABLE');
  assert.deepEqual(failed.roadmap,[]);
  const wrongId=await readShadowBoardSafe({token:'t',fetchImpl:transport({badId:true})});
  assert.equal(wrongId.unavailable,'SHADOW_METADATA_INVALID');
  const noToken=await readShadowBoardSafe({token:'',fetchImpl:transport()});
  assert.equal(noToken.unavailable,'EXISTING_GOOGLE_AUTH_REQUIRED');
});

test('se o gviz falhar, a API Sheets (drive.readonly) leva o quadro',async()=>{
  const fetchImpl=async url=>{
    const href=String(url);
    if(href.includes('/drive/v3/files/'))return {ok:true,json:async()=>({id:SHADOW_ID,modifiedTime:'2026-10-19T12:50:29.635Z'})};
    if(href.includes('gviz'))return {ok:false};
    if(href.includes('ROADMAP'))return {ok:true,json:async()=>({values:[[...ROADMAP_COLUMNS],['R1-1.1','t','OPEN','S1','5','p','','2026-10-19','']]})};
    if(href.includes('MURAL'))return {ok:true,json:async()=>({values:[[...MURAL_COLUMNS],['2026-10-19','I','S1','x','l']]})};
    return {ok:false};
  };
  const board=await readShadowBoard({token:'t',fetchImpl});
  assert.deepEqual(board.counts,{roadmap:1,mural:1});
  assert.equal(board.roadmap[0].item,'R1-1.1');
});
