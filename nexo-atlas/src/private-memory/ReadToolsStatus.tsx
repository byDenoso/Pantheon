import {useEffect,useState} from 'react';
import McpGrantPanel from './McpGrantPanel.tsx';
import type {Lang} from '../i18n/state-language.ts';

/** Reports only the actual session adapter mode; it contains no source data. */
export default function ReadToolsStatus({lang}:{lang:Lang}) {
  const [mode,setMode]=useState(()=>document.documentElement.dataset.nexoReadTools || 'INITIALIZING');
  useEffect(()=>{
    const observer=new MutationObserver(()=>setMode(document.documentElement.dataset.nexoReadTools || 'DISABLED'));
    observer.observe(document.documentElement,{attributes:true,attributeFilter:['data-nexo-read-tools']});
    return()=>observer.disconnect();
  },[]);
  const en=lang==='en';
  const message=mode==='DOCUMENT_WEBMCP'
    ? en?'WebMCP is active for read-only searches in this private session.':'WebMCP ativo para consultas somente leitura nesta sessão privada.'
    : mode==='INITIALIZING'
      ? en?'Preparing private read tools…':'Preparando as ferramentas de leitura privada…'
      : en?'Use the search controls on this page. WebMCP is not available in this session.':'Use os controles de busca desta página. WebMCP não está disponível nesta sessão.';
  return <><p className="pw-quiet" role="status">{message}</p><McpGrantPanel lang={lang}/></>;
}
