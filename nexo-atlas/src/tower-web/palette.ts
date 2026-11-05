// Neutral Tower surfaces with a muted blue accent. Historical BLUE token names
// remain for compatibility with the renderer and its Canvas fallback.
export type Theme = 'light' | 'dark';
export interface Tokens {bg: string; surface: string; text: string; secondary: string; /** interface highlight */ blue: string; /** colour of filaments and nodes */ mark: string; /** brightest light of dense knots (dark) / deepest ink (light) */ hot: string; /** selection ring / focus */ ring: string; line: string; /** blue that is legible as text on this theme */ accentText: string}
/** Blue for text and controls on white. */
export const BLUE = '#003087';
/** Accessible light blue for text and controls on dark surfaces. */
export const BLUE_LIT = '#a9c5ff';
export const WEB_BLUE = '#6592df';
export const WEB_LIGHT = '#d9e6ff';
export const TOKENS: Record<Theme, Tokens> = {
  light: {bg: '#FFFFFF', surface: '#f6f7f9', text: '#161b25', secondary: '#465161', blue: BLUE, mark: BLUE, hot: '#001e58', ring: '#161b25', line: '#cbd0d8', accentText: BLUE},
  dark: {bg: '#000000', surface: '#111318', text: '#f4f6f9', secondary: '#c6cdd9', blue: BLUE_LIT, mark: WEB_BLUE, hot: WEB_LIGHT, ring: '#f4f6f9', line: '#525e70', accentText: BLUE_LIT},
};
export const rgb = (hex: string): [number, number, number] => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
export const rgba = (hex: string, a: number) => { const [r, g, b] = rgb(hex); return `rgba(${r},${g},${b},${a})`; };
/** WCAG 2.x relative luminance and contrast ratio */
export function luminance(hex: string): number { const [r, g, b] = rgb(hex).map(v => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }) as [number, number, number]; return 0.2126 * r + 0.7152 * g + 0.0722 * b; }
export function contrast(a: string, b: string): number { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
