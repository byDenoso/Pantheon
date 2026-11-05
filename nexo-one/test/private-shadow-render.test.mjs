// Component rendering with synthetic shadow states; no authenticated source is used.
import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createServer} from 'vite';

test('private views distinguish an unread tab from a valid empty tab and omit partial charts',async()=>{
  const server=await createServer({configFile:false,root:process.cwd(),logLevel:'silent',server:{middlewareMode:true}});
  try {
    const {ShadowBoard}=await server.ssrLoadModule('/src/private-workspace/Views.tsx');
    const {default:LiveView}=await server.ssrLoadModule('/src/private-workspace/LiveView.tsx');
    const board={contract:'NEXO_SHADOW_BOARD_V1',modified_at:'2026-11-01T00:00:00Z',
      availability:{roadmap:'available',mural:'available',resumo:'unavailable',resultados:'unavailable',equipe:'available'},
      roadmap:[],mural:[],resumo:[],resultados:[],equipe:[]};
    const state={read_model:{shadow:board}};
    const render=(component)=>renderToStaticMarkup(React.createElement(component,{state,lang:'pt'}));
    const partial=render(LiveView);
    assert.match(partial,/Gráfico indisponível/);
    assert.doesNotMatch(partial,/nx-activity-chart/);
    const validEmpty=render(ShadowBoard);
    assert.match(validEmpty,/Sem itens neste recorte/);
    assert.match(validEmpty,/Resultados<span>—<\/span>/);
    board.availability.roadmap='unavailable';
    const unavailable=render(ShadowBoard);
    assert.match(unavailable,/Aba indisponível ou sem cobertura informada/);
    assert.doesNotMatch(unavailable,/Sem itens neste recorte/);
  } finally {await server.close();}
});
