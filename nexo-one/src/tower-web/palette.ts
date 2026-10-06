// Palette of the Tower web and of its interface: white + blue (light theme), black + blue (dark theme), one blue family (hue ~210-224).
//   - the web itself is lit with WEB_BLUE; where many strands overlap on black the light adds up toward WEB_LIGHT, which is the glow of the knots;
//   - interface highlights (buttons, links, icons, active borders, selection) use BLUE, the saturated blue of the rendered filaments;
//   - small text is ink, or a member of the family that is legible on that background (BLUE on white, BLUE_LIT on black). Not all text is blue.
// No other hue is used by the web, its shaders, the Canvas fallback, legends or tooltips.
export type Theme = 'light' | 'dark';
export interface Tokens {bg: string; surface: string; text: string; secondary: string; /** interface highlight */ blue: string; /** colour of filaments and nodes */ mark: string; /** brightest light of dense knots (dark) / deepest ink (light) */ hot: string; /** selection ring / focus */ ring: string; line: string; /** blue that is legible as text on this theme */ accentText: string}
/** interface blue: the saturated blue of the rendered filaments (hue 224); 5.3:1 on white */
export const BLUE = '#1E5BFF';
/** the same blue, lit, for text and thin marks on black (6.5:1 on #000000) */
export const BLUE_LIT = '#6890FF';
/** the light the web is drawn with, and the glow it adds up to */
export const WEB_BLUE = '#0285FF';
export const WEB_LIGHT = '#B9DBFF';
export const TOKENS: Record<Theme, Tokens> = {
  light: {bg: '#FFFFFF', surface: '#F4F7FE', text: '#0A1220', secondary: '#48566C', blue: BLUE, mark: BLUE, hot: '#12348F', ring: '#0A1220', line: '#C9D6EE', accentText: BLUE},
  dark: {bg: '#000000', surface: '#060B14', text: '#F2F6FD', secondary: '#98A6BC', blue: BLUE, mark: WEB_BLUE, hot: WEB_LIGHT, ring: '#F2F6FD', line: '#17243C', accentText: BLUE_LIT},
};
export const rgb = (hex: string): [number, number, number] => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
export const rgba = (hex: string, a: number) => { const [r, g, b] = rgb(hex); return `rgba(${r},${g},${b},${a})`; };
/** WCAG 2.x relative luminance and contrast ratio */
export function luminance(hex: string): number { const [r, g, b] = rgb(hex).map(v => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }) as [number, number, number]; return 0.2126 * r + 0.7152 * g + 0.0722 * b; }
export function contrast(a: string, b: string): number { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
