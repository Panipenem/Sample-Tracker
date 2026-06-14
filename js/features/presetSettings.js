import {
  getDataEntrySampleTypes,
  setDataEntrySampleTypes,
  getSecondarySamplePresets,
  setSecondarySamplePresets,
  getSecondaryTypeShort,
  setSecondaryTypeShort,
  getSecondaryDefaultProcessing,
  setSecondaryDefaultProcessing,
  resetPresetSettings,
} from '../db/sampleTypes.js';
import { queryAll } from '../db/query.js';

export function bindPresetSettingsEvents({
  refreshSampleTypeSelect,
  makeDbDirty,
} = {}) {
  renderPresetSettings();

  const save = document.getElementById('btn-save-preset-settings');
  if (save) {
    save.addEventListener('click', () => {
      if (!savePresetSettings()) return;
      if (typeof refreshSampleTypeSelect === 'function') {
        refreshSampleTypeSelect();
      }
      if (typeof makeDbDirty === 'function') {
        makeDbDirty();
      }
      alert('Preset settings saved in this database.');
    });
  }

  const reset = document.getElementById('btn-reset-preset-settings');
  if (reset) {
    reset.addEventListener('click', () => {
      if (!confirm('Reset preset settings to source defaults?')) return;
      resetPresetSettings();
      renderPresetSettings();
      if (typeof refreshSampleTypeSelect === 'function') {
        refreshSampleTypeSelect();
      }
      if (typeof makeDbDirty === 'function') {
        makeDbDirty();
      }
    });
  }
}

export function refreshPresetSettingsPanel() {
  renderPresetSettings();
}

function renderPresetSettings() {
  setValue('settings-data-entry-types', getDataEntrySampleTypes().join('\n'));
  setValue('settings-secondary-presets', getSecondarySamplePresets().join('\n'));
  setValue('settings-secondary-short', JSON.stringify(getSecondaryTypeShort(), null, 2));
  setValue('settings-secondary-processing', JSON.stringify(getSecondaryDefaultProcessing(), null, 2));
}

function savePresetSettings() {
  try {
    const sampleTypes = parseLines(getValue('settings-data-entry-types'));
    const secondaryPresets = parseLines(getValue('settings-secondary-presets'));
    const typeShort = parseJsonObject(getValue('settings-secondary-short'), 'Secondary type abbreviation');
    const processing = parseProcessingObject(getValue('settings-secondary-processing'));

    if (sampleTypes.length === 0) {
      alert('Data Entry sample types cannot be empty.');
      return false;
    }

    if (secondaryPresets.length === 0) {
      alert('Secondary wizard presets cannot be empty.');
      return false;
    }

    if (!confirmRemovedActiveSampleTypes(sampleTypes)) {
      return false;
    }

    setDataEntrySampleTypes(sampleTypes);
    setSecondarySamplePresets(secondaryPresets);
    setSecondaryTypeShort(typeShort);
    setSecondaryDefaultProcessing(processing);
    renderPresetSettings();
    return true;
  } catch (err) {
    alert(err.message || String(err));
    return false;
  }
}

function confirmRemovedActiveSampleTypes(nextSampleTypes) {
  const previous = getDataEntrySampleTypes();
  const nextKeys = new Set(nextSampleTypes.map(type => type.toLowerCase()));
  const removed = previous.filter(type => !nextKeys.has(type.toLowerCase()));
  if (removed.length === 0) return true;

  const placeholders = removed.map(() => '?').join(',');
  const rows = queryAll(`
    SELECT sample_type, COUNT(*) AS count
    FROM samples
    WHERE sample_type IN (${placeholders})
      AND (status IS NULL OR LOWER(status) NOT IN ('archived','retired','discarded','consumed','deleted'))
    GROUP BY sample_type
    ORDER BY sample_type ASC;
  `, removed);

  if (rows.length === 0) return true;

  const detail = rows
    .map(row => `${row.sample_type}: ${row.count} active sample(s)`)
    .join('\n');

  return confirm(
    `Some removed sample type presets are still used by active samples:\n\n${detail}\n\nRemove these presets anyway? Existing samples will keep their current sample_type values.`
  );
}

function parseLines(value) {
  const seen = new Set();
  return String(value || '')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .filter(line => {
      const key = line.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function parseJsonObject(value, label) {
  const parsed = JSON.parse(value || '{}');
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${label} must be a JSON object.`);
  }
  return parsed;
}

function parseProcessingObject(value) {
  const parsed = parseJsonObject(value, 'Secondary processing presets');

  Object.entries(parsed).forEach(([key, list]) => {
    if (!Array.isArray(list)) {
      throw new Error(`Processing presets for "${key}" must be an array.`);
    }
    parsed[key] = list.map(item => String(item || '').trim()).filter(Boolean);
  });

  return parsed;
}

function setValue(id, value) {
  const el = document.getElementById(id);
  if (el) el.value = value;
}

function getValue(id) {
  return document.getElementById(id)?.value || '';
}
