import {useEffect, useRef, useState} from 'react';
import {fetchAutonomyStatus, reviewActivationReceipt, submitAutonomy, type AutonomyAction, type AutonomyActionName, type AutonomyView} from '../autonomyControl.ts';

export default function AutonomyControlPanel({locale = 'pt-BR', legacy = false}: {locale?: 'pt-BR' | 'en'; legacy?: boolean}) {
  const en = locale === 'en';
  const buttonClass = legacy ? 'primary-button' : 'atlas-btn';
  const [view, setView] = useState<AutonomyView | null>(null);
  const [busy, setBusy] = useState(false), [notice, setNotice] = useState('');
  const [confirmed, setConfirmed] = useState<AutonomyActionName | null>(null);
  const [receiptText, setReceiptText] = useState(''), [reviewedReceipt, setReviewedReceipt] = useState<AutonomyAction | null>(null);
  const generation = useRef(0), flight = useRef(false);
  const read = async (token: number, signal?: AbortSignal) => {
    const fresh = await fetchAutonomyStatus(fetch, signal);
    if (token === generation.current) {setView(fresh); setConfirmed(null); setReviewedReceipt(null); setReceiptText('');}
  };
  useEffect(() => {
    const token = ++generation.current, controller = new AbortController();
    setBusy(true);
    void read(token, controller.signal).catch(() => {
      if (token === generation.current) setNotice(en ? 'Current mandate could not be verified.' : 'Não foi possível conferir o mandato atual.');
    }).finally(() => {if (token === generation.current) setBusy(false);});
    return () => {generation.current++; controller.abort();};
  }, []);
  const refresh = async () => {
    if (flight.current) return;
    const token = ++generation.current; flight.current = true; setBusy(true); setConfirmed(null); setView(null); setNotice('');
    try {await read(token);} catch {if (token === generation.current) setNotice(en ? 'Current mandate could not be verified.' : 'Não foi possível conferir o mandato atual.');}
    finally {flight.current = false; if (token === generation.current) setBusy(false);}
  };
  const submit = async (name: AutonomyActionName) => {
    const action = name === 'approve' && reviewedReceipt ? reviewedReceipt : view?.actions[name];
    if (flight.current || confirmed !== name || !action?.available) return;
    const token = ++generation.current;
    flight.current = true; setBusy(true); setConfirmed(null); setNotice('');
    try {
      const result = await submitAutonomy(fetch, action);
      if (token !== generation.current) return;
      setNotice(result.kind === 'delivered'
        ? en ? 'Sent to the Writer. Waiting for canonical confirmation.' : 'Enviado ao Writer. Aguardando confirmação na Tower.'
        : result.kind === 'uncertain'
          ? en ? 'Delivery is unconfirmed. Check current state before another action.' : 'O envio ficou incerto. Confira o estado atual antes de outra ação.'
          : en ? 'The action was refused. Read the current proposal again.' : 'A ação foi recusada. Releia a proposta atual.');
      setView(null);
      // One readback only. Unknown POST outcomes are never retried automatically.
      try {await read(token);} catch {if (token === generation.current) setNotice(previous => previous + (en ? ' Canonical readback is unavailable.' : ' A leitura da Tower está indisponível.'));}
    } finally {flight.current = false; if (token === generation.current) setBusy(false);}
  };
  const reviewReceipt = async () => {
    if (!view || flight.current) return;
    const token = generation.current; flight.current = true; setBusy(true); setConfirmed(null); setReviewedReceipt(null); setNotice('');
    try {
      const action = await reviewActivationReceipt(receiptText, view);
      if (token === generation.current) {setReviewedReceipt(action); setReceiptText('');}
    } catch {if (token === generation.current) setNotice(en ? 'The receipt does not match the required proof, digest or current Tower state.' : 'O recibo não corresponde às provas exigidas, ao hash ou ao estado atual da Tower.');}
    finally {flight.current = false; if (token === generation.current) setBusy(false);}
  };
  const state = view?.mandate?.status;
  return <section className={legacy ? 'next-action' : 'atlas-item'} aria-labelledby="autonomy-heading">
    <div className={legacy ? 'section-head' : 'atlas-row'}><h2 id="autonomy-heading">{en ? 'Research autonomy' : 'Autonomia da pesquisa'}</h2>
      <button type="button" className={buttonClass} onClick={() => void refresh()} disabled={busy}>{en ? 'Check current state' : 'Conferir estado atual'}</button></div>
    <p>{state === 'ACTIVE' ? en ? 'The Tower records an active mandate.' : 'A Tower registra um mandato ativo.'
      : state === 'REVOKED' ? en ? 'The Tower records a revoked mandate.' : 'A Tower registra um mandato revogado.'
        : view ? en ? 'The expansion has no verified active mandate.' : 'A ampliação não tem mandato ativo verificado.'
          : busy ? en ? 'Reading the current mandate…' : 'Consultando o mandato atual…'
            : en ? 'The current mandate has not been verified.' : 'O mandato atual ainda não foi verificado.'}</p>
    {notice && <p role="status" className="atlas-warn">{notice}</p>}
    {view && <>
      <p className="atlas-note">{en ? 'Verified at' : 'Conferido em'} {new Date(view.observed_at).toLocaleString(en ? 'en' : 'pt-BR')}</p>
      <p>{en ? 'Scope: observational cosmology, public data and no additional cost. Existing contracts, credentials, schedules and protected tasks remain preserved. Articles and external submissions require Dener’s decision.'
        : 'Escopo: cosmologia observacional, dados públicos e nenhum custo adicional. Contratos iniciados, credenciais, agendas e tarefas protegidas permanecem preservados. Artigos e submissões externas dependem da decisão de Dener.'}</p>
      {state !== 'ACTIVE' && <details className="atlas-tech"><summary>{en ? 'Review an activation receipt' : 'Revisar recibo de ativação'}</summary>
        <p>{en ? 'Paste the exact JSON returned by the activation task after it verified all required evidence. Local review does not send or approve it.' : 'Cole o JSON exato devolvido pela tarefa de ativação após conferir todas as provas obrigatórias. A revisão local não envia nem aprova o recibo.'}</p>
        <label>{en ? 'Prepared receipt JSON' : 'JSON do recibo preparado'}<textarea value={receiptText} rows={6} maxLength={32768} disabled={busy}
          style={{width: '100%', background: 'var(--bg)', color: 'inherit'}} onChange={e => {setReceiptText(e.target.value); setReviewedReceipt(null); setConfirmed(null);}}/></label>
        <p><button type="button" className={buttonClass} disabled={busy || !receiptText.trim()} onClick={() => void reviewReceipt()}>{en ? 'Review exact receipt' : 'Conferir recibo exato'}</button></p>
        {reviewedReceipt && <p role="status">{en ? 'Receipt matches the current state. Review the proposal below before authorizing it.' : 'O recibo corresponde ao estado atual. Revise a proposta abaixo antes de autorizá-la.'}</p>}
      </details>}
      {(['approve', 'revoke'] as const).map(name => {
        const action = name === 'approve' && reviewedReceipt ? reviewedReceipt : view.actions[name], envelope = action.envelope;
        return <details className="atlas-tech" key={name}>
          <summary>{name === 'approve' ? en ? 'Approve the prepared mandate' : 'Aprovar o mandato preparado' : en ? 'Revoke the current mandate' : 'Revogar o mandato atual'}</summary>
          {!action.available ? <><p>{en ? 'This action is unavailable.' : 'Esta ação está indisponível.'}</p><ul>{action.blockers.map((reason, i) => <li key={i}>{reason}</li>)}</ul></>
            : envelope && <>
              <p>{name === 'approve'
                ? en ? 'The continuous mandate lasts until revocation. Start with one standard public GitHub runner; increases require verified stability and free capacity.' : 'O mandato contínuo vale até revogação. Começa com uma execução em runner padrão público do GitHub; ampliações exigem estabilidade e capacidade gratuita verificadas.'
                : en ? 'Revocation prevents new admissions and promotions. Existing results and protected runs are preserved.' : 'A revogação impede novas admissões e promoções. Resultados existentes e execuções protegidas são preservados.'}</p>
              {name === 'approve' && <p>{en ? 'The prepared receipt includes verification of transport, Writer, public projection, prompts and free quota. Review the exact evidence below.' : 'O recibo preparado contém verificações de transporte, Writer, projeção pública, prompts e cota gratuita. Confira as provas exatas abaixo.'}</p>}
              {name === 'approve' && <dl className="atlas-data">
                {(en ? ['Authenticated transport', 'Writer and receipts', 'Approved public projection', 'Five task prompts', 'Free quota']
                  : ['Transporte autenticado', 'Writer e recibos', 'Projeção pública autorizada', 'Prompts das cinco tarefas', 'Cota gratuita']).map(label =>
                  <div key={label}><dt>{label}</dt><dd>{en ? 'Checked in the task receipt' : 'Conferido no recibo da tarefa'}</dd></div>)}
              </dl>}
              <details><summary>{en ? 'Exact proposal and verification details' : 'Proposta exata e detalhes da verificação'}</summary>
                <pre style={{whiteSpace: 'pre-wrap', overflowWrap: 'anywhere'}}>{JSON.stringify(envelope, null, 2)}</pre>
                <p style={{overflowWrap: 'anywhere'}}>{en ? 'Proposal digest' : 'Hash da proposta'}: {action.proposal_sha256}</p></details>
              <label><input type="checkbox" checked={confirmed === name} disabled={busy} onChange={e => setConfirmed(e.target.checked ? name : null)}/>{' '}
                {name === 'approve' ? en ? 'I reviewed this exact proposal and authorize this mandate.' : 'Revisei esta proposta exata e autorizo este mandato.' : en ? 'I reviewed this exact proposal and revoke this mandate.' : 'Revisei esta proposta exata e revogo este mandato.'}</label>
              <p><button type="button" className={buttonClass} disabled={busy || confirmed !== name} onClick={() => void submit(name)}>
                {name === 'approve' ? en ? 'Approve mandate' : 'Aprovar mandato' : en ? 'Revoke mandate' : 'Revogar mandato'}</button></p>
            </>}
        </details>;
      })}
      <details className="atlas-tech"><summary>{en ? 'Current state details' : 'Detalhes do estado atual'}</summary>
        <p style={{overflowWrap: 'anywhere'}}>{view.tower_fingerprint}</p>{view.mandate && <p>{view.mandate.id} · {en ? 'revision' : 'revisão'} {view.mandate.revision}</p>}
      </details>
    </>}
  </section>;
}
