import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {validAutonomyView, type AutonomyView as View} from '../autonomy.ts';

type Props = {
  loadStatus: (signal: AbortSignal) => Promise<unknown>;
  locale: 'pt' | 'en';
  onBack: () => void;
};

export default function ResearchAutonomyPanel(
  {
    loadStatus,
    locale,
    onBack,
  }: Props,
) {
  const [state, setState] =
    useState<View | null>(null);

  const [loading, setLoading] =
    useState(false);

  const [unknownError, setUnknownError] =
    useState(false);

  const seq =
    useRef(0);

  const pt =
    locale === "pt";


  const labels = pt ? {
    PREPARED_INACTIVE: 'Autonomia ainda não ativada',
    UNKNOWN: 'Não foi possível verificar a autonomia',
    ACTIVE_UNVERIFIED: 'Ativação declarada; confirmação pendente',
    REVOKED: 'Autonomia revogada na fonte',
  } : {
    PREPARED_INACTIVE: 'Autonomy has not been activated',
    UNKNOWN: 'Autonomy could not be verified',
    ACTIVE_UNVERIFIED: 'Activation recorded; confirmation pending',
    REVOKED: 'Autonomy revoked in the source',
  };

  const active = useRef<AbortController | null>(null);

  const execute = useCallback(async () => {
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    const current =
      ++seq.current;

    setLoading(true);
    setState(null);
    setUnknownError(false);

    try {
      const response =
        await loadStatus(
          controller.signal,
        );

      if (
        controller.signal.aborted ||
        current !== seq.current
      ) {
        return;
      }

      if (!validAutonomyView(response)) {
        throw new Error(
          "INVALID_VIEW",
        );
      }

      setState(response);
    } catch {
      if (
        !controller.signal.aborted &&
        current === seq.current
      ) {
        setState(null);
        setUnknownError(true);
      }
    } finally {
      if (
        !controller.signal.aborted &&
        current === seq.current
      ) {
        setLoading(false);
      }
    }
  }, [loadStatus]);


  useEffect(() => {
    void execute();
    return () => { active.current?.abort(); seq.current++; };
  }, [execute]);

  return (
    <section
      className="research-autonomy"
    >
      <button
        type="button"
        className="atlas-btn"
        onClick={onBack}
      >
        {pt ? "Voltar" : "Back"}
      </button>

      <h2>
        {pt
          ? "Autonomia da pesquisa"
          : "Research autonomy"}
      </h2>

      <button
        type="button"
        className="atlas-btn"
        disabled={loading}
        onClick={() => void execute()}
      >
        {pt
          ? "Atualizar"
          : "Refresh"}
      </button>


      {loading && (
        <p role="status">
          {pt
            ? "Consultando estado..."
            : "Loading state..."}
        </p>
      )}


      {unknownError && (
        <p role="alert">
          {pt
            ? "Fonte indisponível. Estado desconhecido; isso não significa inativo."
            : "Source unavailable. Unknown state does not mean inactive."}
        </p>
      )}


      {state && (
        <article>
          <p>
            {pt ? "Estado na última leitura" : "State at last read"}: <strong>{labels[state.status]}</strong>
          </p>

          {(
            <p>
              {pt
                ? "O envio seguro da sua aprovação ao serviço que aplica o mandato ainda não está disponível neste Atlas."
                : "Secure submission of your approval to the service that applies the mandate is not yet available in this Atlas."}
            </p>
          )}

          {state.status === 'ACTIVE_UNVERIFIED' && <p className="atlas-warn">{pt ? 'A fonte registra uma ativação, mas esta tela ainda não verificou o recibo e a aprovação que a autorizam. Isso não confirma que a autonomia esteja ativa.' : 'The source records an activation, but this screen has not verified its receipt and approval. This does not confirm active autonomy.'}</p>}
          {state.mandate && (
            <>
              <p>
                ID: {state.mandate.id}
              </p>

              <p>
                {pt ? "Revisão" : "Revision"}: {state.mandate.revision}
              </p>
            </>
          )}
          <dl className="research-autonomy-proof">
            <dt>{pt ? 'Consulta' : 'Read time'}</dt><dd><time dateTime={state.observed_at}>{new Date(state.observed_at).toLocaleString(locale)}</time></dd>
            <dt>{pt ? 'Fonte atualizada' : 'Source updated'}</dt><dd><time dateTime={state.source_updated_at}>{new Date(state.source_updated_at).toLocaleString(locale)}</time></dd>
            <dt>{pt ? 'Identificador da versão' : 'Version fingerprint'}</dt><dd><code>{state.tower_fingerprint}</code></dd>
          </dl>
          <p>{pt ? 'A ativação exige provas verificadas e confirmação humana da proposta exata. Esta tela apenas consulta a fonte oficial.' : 'Activation requires verified evidence and human confirmation of the exact proposal. This screen only reads the authoritative source.'}</p>
        </article>
      )}
    </section>
  );
}
