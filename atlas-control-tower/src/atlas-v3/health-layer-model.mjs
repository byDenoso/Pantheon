export function buildHealthLayerModel(snapshot) {
  const sync = snapshot?.health?.olympusSync || {};
  const status = String(sync.state || 'UNKNOWN').toUpperCase();
  return {
    status,
    sourceVersion: sync.sourceVersion || snapshot?.health?.sourceVersion || '—',
    publicEntityCount: Number.isFinite(Number(sync.publicEntityCount)) ? Number(sync.publicEntityCount) : 0,
    privateDataExcluded: sync.privateDataExcluded !== false,
    label: status === 'SYNCED' ? 'Olympus sincronizado' : 'Olympus sem leitura publicada'
  };
}
