import {useMemo, useState} from 'react';
import type {SystemState} from '../contracts/system.ts';
import type {Lang} from '../i18n/state-language.ts';
import {agentBoard, filterBoard, postStatus, type BoardStatus} from './agent-board.ts';
import {WORKSPACE_COPY} from './copy.ts';
import {DateText} from './Value.tsx';
import {testHref} from './model.ts';
import './agent-board.css';

export default function AgentBoardView({state, lang}: {state: SystemState; lang: Lang}) {
  const m = WORKSPACE_COPY[lang], board = useMemo(()=>agentBoard(state),[state]);
  const [query,setQuery] = useState(''), [role,setRole] = useState(''), [status,setStatus] = useState<BoardStatus|'all'>('all'), [limit,setLimit] = useState(40);
  const roles = useMemo(()=>[...new Set(board.posts.flatMap(post=>[post.from,post.to]))].sort(),[board]);
  const rows = useMemo(()=>filterBoard(board,{query,role,status}),[board,query,role,status]);
  const tests = new Set(state.graph.nodes.filter(node=>node.type==='TEST').map(node=>node.id.replace(/^test:/,'')));
  const labels: Record<BoardStatus,string> = {open:m.boardOpen,answered:m.boardAnswered,resolved:m.boardResolved,expired:m.boardExpired,note:m.boardNote};
  return <main className="pw-page pw-board">
    <header className="pw-page-title"><p className="pw-trail">{m.private}</p><h1 data-private-heading tabIndex={-1}>{m.boardTitle}</h1><p className="pw-lead">{m.boardLead}</p></header>
    {board.availability === 'unavailable' ? <p className="pw-empty" role="status">{m.boardUnavailable}</p> : <>
      <p className="pw-quiet pw-board-summary">{board.posts.length} {m.boardMessages} · {m.boardAsOf} <DateText value={board.observedAt} lang={lang}/></p>
      {board.availability === 'partial' && <p className="pw-coverage" role="status">{m.boardPartial} ({board.invalidCount})</p>}
      <div className="pw-tools pw-board-filters">
        <label className="pw-search">{m.search}<input type="search" value={query} onChange={event=>{setQuery(event.target.value);setLimit(40);}}/></label>
        <label>{m.boardAgent}<select value={role} onChange={event=>{setRole(event.target.value);setLimit(40);}}><option value="">{m.boardAllAgents}</option>{roles.map(item=><option key={item} value={item}>{item}</option>)}</select></label>
        <label>{m.status}<select value={status} onChange={event=>{setStatus(event.target.value as BoardStatus|'all');setLimit(40);}}><option value="all">{m.all}</option>{Object.entries(labels).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
      </div>
      <p className="pw-quiet" role="status">{rows.length ? `${m.showing} ${Math.min(rows.length,limit)} ${m.of} ${rows.length}` : board.posts.length ? m.noneQuery : m.boardEmpty}</p>
      <ol className="pw-rows pw-board-posts">{rows.slice(0,limit).map(post=>{
        const replies=board.posts.filter(reply=>reply.reply_to===post.id&&reply.id!==post.id);
        return <li className="pw-board-post" key={`${post.id}:${post.sourceIndex}`} data-post-id={post.id}>
          <div className="pw-board-route"><h2>{post.from} <span aria-label={m.boardTo}>→</span> {post.to}</h2><span className="pw-state">{labels[postStatus(post,board.posts,board.observedAt)]}</span></div>
          <p className="pw-quiet"><DateText value={post.at} lang={lang}/></p>
          {post.reply_to && <p className="pw-board-reply pw-quiet">{m.boardReplyTo} <button type="button" className="pw-button" onClick={()=>{setQuery(post.reply_to!);setRole('');setStatus('all');setLimit(40);}}>{post.reply_to}</button></p>}
          <p className="pw-board-text">{post.text}</p>
          {!!post.refs?.length && <ul className="pw-list pw-board-refs" aria-label={m.boardRefs}>{post.refs.map((ref,i)=>{
            const id=ref.replace(/^test:/,''); return <li key={`${i}:${ref}`}>{tests.has(id) ? <a href={testHref(id)}>{ref}</a> : <span className="pw-code">{ref}</span>}</li>;
          })}</ul>}
          {replies.length > 0 && <button type="button" className="pw-button" onClick={()=>{setQuery(post.id);setRole('');setStatus('all');setLimit(40);}}>{m.boardConversation} ({replies.length})</button>}
          <details className="pw-technical"><summary>{m.technical}</summary><dl className="pw-pairs">
            <div><dt>{m.id}</dt><dd className="pw-code">{post.id}</dd></div>
            <div><dt>{m.source}</dt><dd className="pw-code">{board.sourcePath}#/posts/{post.sourceIndex}</dd></div>
            <div><dt>{m.boardRevision}</dt><dd className="pw-code">{board.sourceRevision}</dd></div>
            {post.expires_at && <div><dt>{m.boardExpires}</dt><dd><DateText value={post.expires_at} lang={lang}/></dd></div>}
            {post.resolved_at && <div><dt>{m.boardResolved}</dt><dd><DateText value={post.resolved_at} lang={lang}/></dd></div>}
          </dl></details>
        </li>;
      })}</ol>
      {rows.length > limit && <button type="button" className="pw-button" onClick={()=>setLimit(value=>value+40)}>{m.more} ({Math.min(40,rows.length-limit)})</button>}
    </>}
  </main>;
}
