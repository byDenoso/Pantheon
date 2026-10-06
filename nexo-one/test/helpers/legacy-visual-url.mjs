// Component fixture entry only. The public app and authenticated frame have
// separate browser coverage; these legacy layout checks must not reopen them.
export function legacyVisualUrl(base, hash, historicalBaseline = false) {
  const url = new URL(base);
  if (url.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
    throw new Error('Legacy visual fixtures require an explicit loopback dev server');
  }
  url.pathname = historicalBaseline ? '/' : '/test/fixtures/legacy-visual.html';
  // The shipped private renderer does not mount the retired whole-page mirror.
  url.search = historicalBaseline ? '' : '?svgMirror=0';
  url.hash = hash;
  return url.href;
}
