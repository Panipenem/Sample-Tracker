const DATA_ENTRY_SAMPLE_TYPES_KEY = 'LIMS_DATA_ENTRY_SAMPLE_TYPES';
const SECONDARY_SAMPLE_PRESETS_KEY = 'LIMS_SECONDARY_SAMPLE_PRESETS';
const SECONDARY_TYPE_SHORT_KEY = 'LIMS_SECONDARY_TYPE_SHORT';
const SECONDARY_DEFAULT_PROCESSING_KEY = 'LIMS_SECONDARY_DEFAULT_PROCESSING';

export const DEFAULT_DATA_ENTRY_SAMPLE_TYPES = [
  'Tissue',
  'Cell pellet',
  'RNA',
  'DNA',
  'Protein',
  'Protein lysate',
  'Serum',
  'Plasma',
  'PBMC',
  'Whole blood',
  'Supernatant',
  'Cell suspension',
  'cDNA library',
  'Other',
];

export const DEFAULT_SECONDARY_SAMPLE_PRESETS = [
  'RNA',
  'DNA',
  'Protein lysate',
  'cDNA library',
  'Cell suspension',
];

export const DEFAULT_SECONDARY_TYPE_SHORT = {
  RNA: 'RNA',
  DNA: 'DNA',
  'Protein lysate': 'Pr',
  Protein: 'Pr',
  'Protein extract': 'Pr',
  'cDNA library': 'cDNA',
  cDNA: 'cDNA',
  'Cell suspension': 'Cell',
  PBMC: 'PBMC',
  Nuclei: 'Nuc',
  'ATAC nuclei': 'Nuc',
  'Metabolite extract': 'Met',
  'Lipid extract': 'Lip',
};

export const DEFAULT_SECONDARY_DEFAULT_PROCESSING = {
  RNA: ['+TRIzol', '+TRIzol LS', '+RNase-free water'],
  DNA: ['+Column kit', '+Phenol-chloroform', '+Magnetic bead purification'],
  'Protein lysate': ['+RIPA buffer (+protease inhibitors)', '+NP40 lysis', '+SDS lysis', '+loading buffer'],
  Protein: ['+RIPA buffer (+protease inhibitors)', '+NP40 lysis', '+SDS lysis', '+loading buffer'],
  'cDNA library': ['+Reverse transcription', '+RT kit', 'Other'],
  cDNA: ['+Reverse transcription', '+RT kit', 'Other'],
  'Cell suspension': ['+PBS wash', '+0.04% BSA in PBS', '+RPMI + 10% FBS'],
};

export function getDataEntrySampleTypes() {
  return readStringList(DATA_ENTRY_SAMPLE_TYPES_KEY, DEFAULT_DATA_ENTRY_SAMPLE_TYPES);
}

export function setDataEntrySampleTypes(values) {
  localStorage.setItem(DATA_ENTRY_SAMPLE_TYPES_KEY, JSON.stringify(cleanStringList(values)));
}

export function getSecondarySamplePresets() {
  return readStringList(SECONDARY_SAMPLE_PRESETS_KEY, DEFAULT_SECONDARY_SAMPLE_PRESETS);
}

export function setSecondarySamplePresets(values) {
  localStorage.setItem(SECONDARY_SAMPLE_PRESETS_KEY, JSON.stringify(cleanStringList(values)));
}

export function getSecondaryTypeShort() {
  return readObject(SECONDARY_TYPE_SHORT_KEY, DEFAULT_SECONDARY_TYPE_SHORT);
}

export function setSecondaryTypeShort(value) {
  localStorage.setItem(SECONDARY_TYPE_SHORT_KEY, JSON.stringify(value || {}));
}

export function getSecondaryDefaultProcessing() {
  return readObject(SECONDARY_DEFAULT_PROCESSING_KEY, DEFAULT_SECONDARY_DEFAULT_PROCESSING);
}

export function setSecondaryDefaultProcessing(value) {
  localStorage.setItem(SECONDARY_DEFAULT_PROCESSING_KEY, JSON.stringify(value || {}));
}

export function resetPresetSettings() {
  [
    DATA_ENTRY_SAMPLE_TYPES_KEY,
    SECONDARY_SAMPLE_PRESETS_KEY,
    SECONDARY_TYPE_SHORT_KEY,
    SECONDARY_DEFAULT_PROCESSING_KEY,
  ].forEach(key => localStorage.removeItem(key));
}

function readStringList(key, fallback) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || 'null');
    if (Array.isArray(parsed)) {
      const cleaned = cleanStringList(parsed);
      if (cleaned.length > 0) return cleaned;
    }
  } catch (_) {
    // Ignore invalid user settings.
  }

  return fallback.slice();
}

function readObject(key, fallback) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || 'null');
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed;
    }
  } catch (_) {
    // Ignore invalid user settings.
  }

  return { ...fallback };
}

function cleanStringList(values) {
  const seen = new Set();
  return (values || [])
    .map(value => String(value || '').trim())
    .filter(Boolean)
    .filter(value => {
      const key = value.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}
