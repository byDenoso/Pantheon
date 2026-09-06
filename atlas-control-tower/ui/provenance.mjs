/** Source and freshness pill. A fallback is never silent: the badge always says
 *  which reader answered and how fresh the answer is. Snapshot science is never
 *  presented as live. */
import {$, esc, age} from './dom.mjs';

const TONE = {
 LIVE:'ok', STAGING:'warn', SNAPSHOT:'muted', STALE:'warn', FALLBACK:'bad'
};
const EXPLAIN = {
 LIVE:'Leitura ao vivo de science_v1.',
 STAGING:'science_v1 em ambiente de staging.',
 SNAPSHOT:'Snapshot privado embutido. Não é leitura ao vivo.',
 STALE:'Dados servidos, porém marcados como envelhecidos pela fonte.',
 FALLBACK:'science_v1 foi solicitado e não respondeu; servindo snapshot legacy.'
};

export function renderProvenance(provenance = {}, {onClick} = {}) {
 const el = $('#provenance');
 if (!el) return;
 const {label = 'LEGACY SNAPSHOT', freshness = 'SNAPSHOT', sourceVersion = '', cache = ''} = provenance;
 el.dataset.tone = TONE[freshness] || 'muted';
 el.innerHTML = `<i></i><span>${esc(label)}</span>${sourceVersion ? `<small>${esc(age(sourceVersion))}</small>` : ''}`;
 el.title = `${EXPLAIN[freshness] || ''}${sourceVersion ? ' Observado em ' + age(sourceVersion) + '.' : ''}${cache ? ' Cache: ' + cache + '.' : ''}`;
 if (onClick) el.onclick = onClick;
}

/** Loud, dismissable note when the reader had to fall back. */
export function renderFallbackNotice(issues = []) {
 const fallback = issues.find(i => i.type === 'DATASOURCE_FALLBACK');
 const host = $('#source-status');
 if (!host) return;
 host.querySelector('.fallback-note')?.remove();
 if (!fallback) return;
 const note = document.createElement('div');
 note.className = 'fallback-note';
 note.innerHTML = `<b>FALLBACK</b> <span>${esc(fallback.detail || fallback.reason || '')}</span>`;
 host.prepend(note);
}
