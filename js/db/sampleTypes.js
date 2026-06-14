import { appState } from '../state.js';
import { getMeta, setMeta } from './meta.js';

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
  writeSetting(DATA_ENTRY_SAMPLE_TYPES_KEY, cleanStringList(values));
}

export function getSecondarySamplePresets() {
  return readStringList(SECONDARY_SAMPLE_PRESETS_KEY, DEFAULT_SECONDARY_SAMPLE_PRESETS);
}

export function setSecondarySamplePresets(values) {
  writeSetting(SECONDARY_SAMPLE_PRESETS_KEY, cleanStringList(values));
}

export function getSecondaryTypeShort() {
  return readObject(SECONDARY_TYPE_SHORT_KEY, DEFAULT_SECONDARY_TYPE_SHORT);
}

export function setSecondaryTypeShort(value) {
  writeSetting(SECONDARY_TYPE_SHORT_KEY, value || {});
}

export function getSecondaryDefaultProcessing() {
  return readObject(SECONDARY_DEFAULT_PROCESSING_KEY, DEFAULT_SECONDARY_DEFAULT_PROCESSING);
}

export function setSecondaryDefaultProcessing(value) {
  writeSetting(SECONDARY_DEFAULT_PROCESSING_KEY, value || {});
}

export function resetPresetSettings() {
  writeSetting(DATA_ENTRY_SAMPLE_TYPES_KEY, DEFAULT_DATA_ENTRY_SAMPLE_TYPES);
  writeSetting(SECONDARY_SAMPLE_PRESETS_KEY, DEFAULT_SECONDARY_SAMPLE_PRESETS);
  writeSetting(SECONDARY_TYPE_SHORT_KEY, DEFAULT_SECONDARY_TYPE_SHORT);
  writeSetting(SECONDARY_DEFAULT_PROCESSING_KEY, DEFAULT_SECONDARY_DEFAULT_PROCESSING);
}

function readStringList(key, fallback) {
  try {
    const parsed = readSetting(key);
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
    const parsed = readSetting(key);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed;
    }
  } catch (_) {
    // Ignore invalid user settings.
  }

  return { ...fallback };
}

function readSetting(key) {
  const dbValue = appState.db ? getMeta(key, null) : null;
  const raw = dbValue ?? localStorage.getItem(key);
  return raw ? JSON.parse(raw) : null;
}

function writeSetting(key, value) {
  const json = JSON.stringify(value);
  localStorage.setItem(key, json);

  if (appState.db) {
    setMeta(key, json);
  }
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
