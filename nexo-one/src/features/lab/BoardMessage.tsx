import { useId, useLayoutEffect, useRef, useState } from 'react';
import { ago, humanId, type Lab } from './model.ts';
import { boardMeta, boardConversation, boardThreadReplies, type BoardRecord } from './presentation.ts';
import { labHref } from './routes.ts';

/** Keep the literal text in the DOM. The fold changes layout, never the recorded message. */
export function BoardMessage({ post, lab, from, to, records, focus = false }: {
  post: BoardRecord; lab: Lab; from: string; to: string; records: BoardRecord[]; focus?: boolean;
}) {
  const textId = useId();
  const textRef = useRef<HTMLParagraphElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [expandable, setExpandable] = useState(false);
  useLayoutEffect(() => {
    const element = textRef.current;
    if (!element || expanded) return;
    if (typeof ResizeObserver === 'undefined') { setExpandable(false); setExpanded(true); return; }
    const measure = () => setExpandable(element.scrollHeight > element.clientHeight + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [post.text, expanded]);
  const meta = boardMeta(post, Date.now(), records);
  const conversation = boardConversation(post, records);
  const replies = boardThreadReplies(post, records);
  const references = [...new Set(post.refs ?? [])];
  return <article className={`board-message${focus ? ' board-message-focus' : ''}`} aria-label={`Recado de ${from} para ${to}`}>
    <p className="board-route"><span><small>De</small><b>{from}</b></span><i aria-hidden="true">→</i><span><small>Para</small><b>{to}</b></span></p>
    <div className="board-receipt"><span className="feed-kind" title={conversation.typeDeclared ? 'Tipo declarado na mensagem' : 'Conteúdo; tipo não declarado pelo autor'}>Mural · original · {conversation.kind}</span><time dateTime={post.at} title={post.at}>{ago(post.at)}</time></div>
    <p ref={textRef} id={textId} className="board-text" data-collapsed={!expanded}>{post.text}</p>
    {expandable && <button type="button" className="board-expand" aria-expanded={expanded} aria-controls={textId} onClick={() => setExpanded(value => !value)}>{expanded ? 'Recolher recado' : 'Ler recado inteiro'}<span aria-hidden="true"> {expanded ? '↑' : '↓'}</span></button>}
    <p className="board-state">{conversation.archived && !conversation.answered && !conversation.selfNote ? 'Sem resposta registrada' : conversation.status}{conversation.archived && ` · ${meta.status}`}</p>
    {conversation.audienceUnknown && conversation.replies.length > 0 && <p className="hud-note">Há respostas vinculadas. O recado para todos permanece aberto; os destinatários exigidos não foram publicados.</p>}
    {replies.length > 0 && <details className="board-replies"><summary>Ver {replies.length === 1 ? 'resposta' : `${replies.length} respostas`}</summary>{replies.map(reply => <blockquote key={reply.id}>
      <p><b>{reply.from} → {reply.to}</b> · <time dateTime={reply.at}>{ago(reply.at)}</time></p><p>{reply.text}</p>
    </blockquote>)}</details>}
    {references.length > 0 && <details className="board-evidence"><summary>Referências do recado ({references.length})</summary><ul>{references.map(id => {
      const test = lab.tests.get(id), hypothesis = lab.hypotheses.get(id), roadmap = lab.roadmaps.get(id);
      const label = test?.name ?? hypothesis?.statement ?? roadmap?.title ?? humanId(id);
      return <li key={id}>{test || hypothesis || roadmap
        ? <a href={labHref(roadmap ? 'roadmap' : 'entidade', id)}>{label}<span aria-hidden="true"> ↗</span></a>
        : <span title="Referência publicada, sem ficha neste recorte">{id} · ficha ausente no recorte</span>}</li>;
    })}</ul></details>}
    <details className="board-provenance"><summary>Ver registro e horário</summary><dl>
      <div><dt>Recado</dt><dd>{post.id}</dd></div><div><dt>Autor → destino</dt><dd>{post.from} → {post.to}</dd></div>
      <div><dt>Horário publicado</dt><dd>{post.at}</dd></div>{post.reply_to && <div><dt>Resposta vinculada a</dt><dd>{post.reply_to}</dd></div>}
      <div><dt>Prioridade declarada</dt><dd>{meta.priority}</dd></div>
    </dl>{meta.nextAction && !post.text.includes(meta.nextAction) && <p className="board-next"><b>Próxima ação declarada:</b> {meta.nextAction}</p>}{!references.length && <p>Este recado veio sem referências vinculadas.</p>}</details>
  </article>;
}
