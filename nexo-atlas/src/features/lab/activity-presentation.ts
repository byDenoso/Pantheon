import type { ActivityEvent } from './model.ts';
import { publishedAgeMs } from '../../viewmodels/published-time.ts';

/** Keep the original export intact; only valid observed dates can be presented as deliveries. */
export const observedActivity = (events: ActivityEvent[], now = Date.now()): ActivityEvent[] => events.filter(event => publishedAgeMs(event.at, now) !== null);

/** The public activity export is bounded. A received zero is not proof of inactivity. */
export function activityWindow(events: ActivityEvent[], hours: number, now = Date.now()) {
  const start = now - hours * 3_600_000;
  const recent = events.filter(event => {
    const at = Date.parse(event.at);
    return Number.isFinite(at) && at >= start && at <= now;
  }).sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  return { recent, count: recent.length, first: recent[0]?.at ?? null, last: recent.at(-1)?.at ?? null,
    partial: true as const,
    label: `${recent.length} eventos recebidos no recorte de até ${hours} h · cobertura parcial`,
  };
}

export const activityRange = (window: ReturnType<typeof activityWindow>): string => window.first && window.last
  ? `Eventos recebidos: ${new Date(window.first).toLocaleString('pt-BR')} a ${new Date(window.last).toLocaleString('pt-BR')}. A fonte recebida não atesta a janela completa.`
  : 'Nenhum evento na janela do recorte recebido. A ausência neste recorte não comprova ausência de atividade.';
