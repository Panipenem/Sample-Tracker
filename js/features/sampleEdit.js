import { appState } from '../state.js';
import { recordSampleEvent } from '../db/audit.js';
import { getOrCreateBoxId } from '../db/boxes.js';
import { queryAll, withTransaction } from '../db/query.js';
import { DATA_ENTRY_SAMPLE_TYPES } from '../db/sampleTypes.js';
import { validateSampleInput } from '../utils/validation.js';
import { addFreezerToListByTemp } from './freezerSelect.js';

export function bindSampleEditEvents({
  makeDbDirty,
  refreshAllViews,
} = {}) {
  document.addEventListener('click', event => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (!target.matches('.btn-edit')) return;

    const id = parseInt(target.getAttribute('data-id'), 10);
    if (!Number.isFinite(id)) return;

    openSampleEdit(id);
  });

  const close = document.getElementById('sample-edit-close');
  if (close) {
    close.addEventListener('click', closeSampleEdit);
  }

  const cancel = document.getElementById('sample-edit-cancel');
  if (cancel) {
    cancel.addEventListener('click', closeSampleEdit);
  }

  const backdrop = document.getElementById('sample-edit-backdrop');
  if (backdrop) {
    backdrop.addEventListener('click', event => {
      if (event.target === backdrop) closeSampleEdit();
    });
  }

  const form = document.getElementById('sample-edit-form');
  if (form) {
    form.addEventListener('submit', event => {
      event.preventDefault();
      saveSampleEdit({ makeDbDirty, refreshAllViews });
    });
  }
}

function openSampleEdit(id) {
  if (!appState.db) return;

  const sample = queryAll(`
    SELECT s.*, b.storage_temperature, b.freezer_no, b.rack, b.box_label
    FROM samples s
    LEFT JOIN boxes b ON s.box_id = b.id
    WHERE s.id = ?
    LIMIT 1;
  `, [id])[0];

  if (!sample) return;

  fillSampleTypeOptions(sample.sample_type || '');
  setField('sample-edit-row-id', sample.id);
  setField('sample-edit-sample-id', sample.sample_id);
  setField('sample-edit-date', sample.date);
  setField('sample-edit-experiment-label', sample.experiment_label);
  setField('sample-edit-species-genotype', sample.species_genotype);
  setField('sample-edit-model', sample.model);
  setField('sample-edit-tissue', sample.tissue);
  setField('sample-edit-sample-type', sample.sample_type);
  setField('sample-edit-processing', sample.processing);
  setField('sample-edit-parent-sample-id', sample.parent_sample_id);
  setField('sample-edit-amount', sample.amount);
  setField('sample-edit-project', sample.project);
  setField('sample-edit-notes', sample.notes);
  setField('sample-edit-storage-temperature', sample.storage_temperature);
  setField('sample-edit-freezer-no', sample.freezer_no);
  setField('sample-edit-rack', sample.rack);
  setField('sample-edit-box-label', sample.box_label);
  setField('sample-edit-status', sample.status || 'available');

  const title = document.getElementById('sample-edit-title');
  if (title) {
    title.textContent = `Edit sample: ${sample.sample_id || sample.id}`;
  }

  const backdrop = document.getElementById('sample-edit-backdrop');
  if (backdrop) backdrop.classList.remove('hidden');
}

function closeSampleEdit() {
  const backdrop = document.getElementById('sample-edit-backdrop');
  if (backdrop) backdrop.classList.add('hidden');
}

function saveSampleEdit({ makeDbDirty, refreshAllViews } = {}) {
  if (!appState.db) return;

  const rowId = parseInt(getField('sample-edit-row-id'), 10);
  if (!Number.isFinite(rowId)) return;

  const sample = {
    sample_id: getField('sample-edit-sample-id').trim(),
    date: getField('sample-edit-date') || null,
    experiment_label: getField('sample-edit-experiment-label') || null,
    species_genotype: getField('sample-edit-species-genotype') || null,
    model: getField('sample-edit-model') || null,
    tissue: getField('sample-edit-tissue') || null,
    sample_type: getField('sample-edit-sample-type') || null,
    notes: getField('sample-edit-notes') || null,
    processing: getField('sample-edit-processing') || null,
    parent_sample_id: getField('sample-edit-parent-sample-id') || null,
    amount: getField('sample-edit-amount') || null,
    project: getField('sample-edit-project') || null,
    status: getField('sample-edit-status') || 'available',
    storage_temperature: getField('sample-edit-storage-temperature') || '',
    freezer_no: getField('sample-edit-freezer-no') || '',
    rack: getField('sample-edit-rack') || '',
    box_label: getField('sample-edit-box-label') || '',
  };

  const validation = validateSampleInput(sample);
  if (validation.errors.length > 0) {
    alert(validation.errors.join('\n'));
    return;
  }

  if (validation.warnings.length > 0 && !confirm(validation.warnings.join('\n') + '\n\nContinue saving?')) {
    return;
  }

  try {
    withTransaction(() => {
      if (sample.freezer_no && sample.storage_temperature) {
        addFreezerToListByTemp(sample.storage_temperature, sample.freezer_no);
      }

      const boxId = sample.box_label
        ? getOrCreateBoxId(sample)
        : null;

      const stmt = appState.db.prepare(`
        UPDATE samples SET
          sample_id = ?,
          date = ?,
          experiment_label = ?,
          species_genotype = ?,
          model = ?,
          tissue = ?,
          sample_type = ?,
          notes = ?,
          processing = ?,
          parent_sample_id = ?,
          amount = ?,
          project = ?,
          status = ?,
          box_id = ?,
          updated_at = datetime('now')
        WHERE id = ?;
      `);

      try {
        stmt.run([
          sample.sample_id,
          sample.date,
          sample.experiment_label,
          sample.species_genotype,
          sample.model,
          sample.tissue,
          sample.sample_type,
          sample.notes,
          sample.processing,
          sample.parent_sample_id,
          sample.amount,
          sample.project,
          sample.status,
          boxId,
          rowId,
        ]);
      } finally {
        stmt.free();
      }

      recordSampleEvent({
        sampleRowId: rowId,
        sampleId: sample.sample_id,
        action: 'update',
        details: { source: 'sample_edit_modal' },
      });
    });
  } catch (err) {
    console.error('Failed to update sample:', err);

    if (String(err).includes('UNIQUE constraint failed: samples.sample_id')) {
      alert(`Sample ID already exists: ${sample.sample_id}`);
    } else {
      alert('Failed to update sample. Please check console for details.');
    }

    return;
  }

  if (typeof makeDbDirty === 'function') {
    makeDbDirty();
  }

  if (typeof refreshAllViews === 'function') {
    refreshAllViews();
  }

  closeSampleEdit();
}

function fillSampleTypeOptions(currentValue) {
  const select = document.getElementById('sample-edit-sample-type');
  if (!select) return;

  select.innerHTML = '';

  const empty = document.createElement('option');
  empty.value = '';
  empty.textContent = '(select)';
  select.appendChild(empty);

  const values = new Set(DATA_ENTRY_SAMPLE_TYPES);
  if (currentValue) values.add(currentValue);

  values.forEach(type => {
    const option = document.createElement('option');
    option.value = type;
    option.textContent = type;
    select.appendChild(option);
  });
}

function setField(id, value) {
  const el = document.getElementById(id);
  if (!el) return;
  el.value = value || '';
}

function getField(id) {
  return document.getElementById(id)?.value || '';
}
