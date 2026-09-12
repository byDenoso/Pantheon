import type { Uncertainty } from './api/types';

export function formatNumber(value: number | undefined, digits = 2): string {
  if (value === undefined || !Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: digits, minimumFractionDigits: 0 }).format(value);
}

export function formatUncertainty(value: Uncertainty | undefined, digits = 2): string {
  if (value === undefined) return '';
  if (typeof value === 'number') return `± ${formatNumber(value, digits)}`;
  return `+${formatNumber(value.plus, digits)} / −${formatNumber(value.minus, digits)}`;
}

export function formatEstimate(value: number | undefined, error?: Uncertainty, digits = 2): string {
  const main = formatNumber(value, digits);
  return error === undefined ? main : `${main} ${formatUncertainty(error, digits)}`;
}

export function formatInterval(interval: [number, number] | undefined, digits = 2): string {
  return interval ? `[${formatNumber(interval[0], digits)}, ${formatNumber(interval[1], digits)}]` : '—';
}

export function formatDate(value: string | undefined): string {
  if (!value) return 'Data não publicada';
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return value;
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

