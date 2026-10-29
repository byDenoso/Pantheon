// Old bookmarks resolve inside the current authenticated Atlas. No legacy app is mounted.
export function privateEntryHash(hash: string): string {
  if (hash.length > 512 || /[\r\n]/.test(hash)) return '#/teia';
  if (/^#\/teia(?:\/|\?|$)/.test(hash)) return hash;
  const [path = '', query = ''] = hash.slice(1).split('?');
  const params = new URLSearchParams(query);
  if (/^\/(?:cockpit\/(?:comando|pipeline)|agora|ciclo|saude|sistema|observatorio)(?:\/|$)/.test(path)) return '#/teia/operacao';
  if (path === '/cockpit/ciencia') return params.get('tab') === 'mural' ? '#/teia/mural' : '#/teia/testes';
  if (path === '/mural') return '#/teia/mural';
  if (/^\/(?:cockpit\/(?:prova|pessoal)|evidencia)(?:\/|$)/.test(path)) return '#/teia/memoria';
  if (/^\/e\//.test(path)) {
    try { const id = decodeURIComponent(path.slice(3)); return '#/teia/teste/' + encodeURIComponent(id.replace(/^test:/, '')); } catch { return '#/teia'; }
  }
  if (/^\/(?:universo|roadmap|roadmaps)(?:\/|$)/.test(path)) return '#/teia/dominios';
  return '#/teia';
}
