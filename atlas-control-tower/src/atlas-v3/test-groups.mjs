export function isTerminalTestGroup(value) {
  return String(value?.type || value?.projectedType || '').toUpperCase() === 'TEST_GROUP';
}

export function testGroupHref(groupId) {
  return `?testGroup=${encodeURIComponent(String(groupId || ''))}`;
}

export function testsForGroup(snapshot, groupId) {
  const tests = Array.isArray(snapshot?.testing?.tests) ? snapshot.testing.tests : [];
  const id = String(groupId || '');
  return tests.filter(test => String(test?.testGroupId || '') === id);
}

export function groupForId(snapshot, groupId) {
  const groups = Array.isArray(snapshot?.testing?.groups) ? snapshot.testing.groups : [];
  const id = String(groupId || '');
  return groups.find(group => String(group?.id || '') === id) || null;
}

export function historicalRegistryHref(group, historicalRegistry) {
  const access = group?.historicalAccess || null;
  const fileId = access?.source_file_id || historicalRegistry?.sourceFileId || null;
  const sheetId = access?.source_sheet_id ?? historicalRegistry?.sourceSheetId ?? null;
  if (!fileId) return null;
  const gid = sheetId == null ? '' : `#gid=${encodeURIComponent(String(sheetId))}`;
  return `https://docs.google.com/spreadsheets/d/${encodeURIComponent(String(fileId))}/edit${gid}`;
}
