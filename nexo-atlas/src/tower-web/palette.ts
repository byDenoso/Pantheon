// Neutral Tower surfaces with a muted green accent. Historical BLUE token names
// remain for compatibility with the renderer and its Canvas fallback.
export type Theme = 'light' | 'dark';
export interface Tokens {bg: string; surface: string; text: string; secondary: string; /** interface highlight */ blue: string; /** colour of filaments and nodes */ mark: string; /** brightest light of dense knots (dark) / deepest ink (light) */ hot: string; /** selection ring / focus */ ring: string; line: string; /** blue that is legible as text on this theme */ accentText: string}
/** Green for text and controls on white. */
export const BLUE = '#245B3B';
/** Accessible light green for text and controls on dark surfaces. */
export const BLUE_LIT = '#B0D5B8';
export const WEB_BLUE = '#87B89A';
export const WEB_LIGHT = '#D1E6D6';
export const TOKENS: Record<Theme, Tokens> = {
  light: {bg: '#FFFFFF', surface: '#F5F8F5', text: '#1B2520', secondary: '#45534A', blue: BLUE, mark: BLUE, hot: '#19442C', ring: '#1B2520', line: '#CAD4CC', accentText: BLUE},
  dark: {bg: '#151B18', surface: '#1D2520', text: '#F0F4F0', secondary: '#C6D3C8', blue: BLUE_LIT, mark: WEB_BLUE, hot: WEB_LIGHT, ring: '#F0F4F0', line: '#526358', accentText: BLUE_LIT},
};
export const rgb = (hex: string): [number, number, number] => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
export const rgba = (hex: string, a: number) => { const [r, g, b] = rgb(hex); return `rgba(${r},${g},${b},${a})`; };
/** WCAG 2.x relative luminance and contrast ratio */
export function luminance(hex: string): number { const [r, g, b] = rgb(hex).map(v => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }) as [number, number, number]; return 0.2126 * r + 0.7152 * g + 0.0722 * b; }
export function contrast(a: string, b: string): number { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
