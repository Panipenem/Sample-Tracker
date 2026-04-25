export function normalizeFreezerName(name) {
  return String(name || '').trim();
}

export function cellToString(v) {
  if (v === undefined || v === null) return '';
  return String(v).trim();
}

export function parseSeqFromSampleId(sampleId) {
  if (!sampleId) return 0;

  const m = String(sampleId).match(/(\d{3})$/);
  return m ? parseInt(m[1], 10) : 0;
}