// Normalização de domínio compartilhada (sem Three.js, para não puxar a cena para o bundle das páginas).
export const normDomain = (d: string) => {
  const u = (d || 'SCIENCE').toUpperCase().replace(/[^A-Z0-9_]/g, '_');
  return u === 'NEXO' || u === 'ARTIFACT' || u === 'GPT_PERFORMANCE' ? 'ENGINEERING' : u;
};
