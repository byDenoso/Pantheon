/** Shared DOM helpers. Presentation only; no API or scientific logic. */
export const $ = s => document.querySelector(s);
export const $$ = s => [...document.querySelectorAll(s)];
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const num = n => new Intl.NumberFormat('pt-BR').format(n || 0);
export function age(value) {
 if (!value) return 'sem data';
 const d = new Date(value);
 return Number.isNaN(d.valueOf()) ? String(value) : d.toLocaleString('pt-BR', {day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit'});
}
export function toast(message) {
 const el = $('#toast');
 if (!el) return;
 el.textContent = message;
 el.classList.add('show');
 clearTimeout(toast.timer);
 toast.timer = setTimeout(() => el.classList.remove('show'), 5500);
}
/** Confidence is shown only when the source published one. */
export const confidenceLabel = value => (value == null || !Number.isFinite(Number(value))) ? 'sem confiança registrada' : `confiança ${Number(value).toFixed(2)}`;
