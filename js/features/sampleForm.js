import { appState } from '../state.js';
import { queryAll } from '../db/query.js';
import {
  addFreezerToListByTemp,
  refreshFreezerMenus,
  getFreezerNoFromUI,
} from './freezerSelect.js';
import { clearDynamicOptions } from '../utils/select.js';
import { initSampleTypeSelect } from './sampleTypeControls.js';

export function bindSampleFormEvents({
  makeDbDirty,
  refreshAllViews,
} = {}) {
  bindSampleSubmit({ makeDbDirty, refreshAllViews });
  bindResetForm();
}

export function resetForm() {
  const form = document.getElementById('sample-form');
  if (form) form.reset();

  const rowId = document.getElementById('internal_sample_row_id');
  if (rowId) rowId.value = '';

  const sampleTypeSelect = document.getElementById('sample_type');
  clearDynamicOptions(sampleTypeSelect);
  initSampleTypeSelect();
}

function bindResetForm() {
  const btn = document.getElementById('btn-reset-form');
  if (!btn) return;

  btn.addEventListener('click', () => {
    resetForm();
  });
}

function bindSampleSubmit({ makeDbDirty, refreshAllViews } = {}) {
  const form = document.getElementById('sample-form');
  if (!form) return;

  form.addEventListener('submit', ev => {
    ev.preventDefault();

    if (!appState.db) {
      alert('Database not ready.');
      return;
    }

    const sampleRowId =
      document.getElementById('internal_sample_row_id').value || null;

    const sample = {
      sample_id: document.getElementById('sample_id').value.trim(),
      date: document.getElementById('date').value || null,
      experiment_label: document.getElementById('experiment_label').value || null,
      species_genotype: document.getElementById('species_genotype').value || null,
      model: document.getElementById('model').value || null,
      tissue: document.getElementById('tissue').value || null,
      sample_type: document.getElementById('sample_type').value || null,
      notes: document.getElementById('notes').value || null,
      processing: document.getElementById('processing').value || null,
      parent_sample_id: document.getElementById('parent_sample_id').value || null,
      amount: document.getElementById('amount').value || null,
      project: document.getElementById('project').value || null,
      status: document.getElementById('status').value || 'available',
      storage_temperature: document.getElementById('storage_temperature').value || '',
      freezer_no: getFreezerNoFromUI() || '',
      rack: document.getElementById('rack').value || '',
      box_label: document.getElementById('box_label').value || '',
    };

    if (!sample.sample_id) {
      alert('Sample ID is required.');
      return;
    }

    if (sample.freezer_no && sample.storage_temperature) {
      addFreezerToListByTemp(sample.storage_temperature, sample.freezer_no);
      refreshFreezerMenus();

      const sel = document.getElementById('freezer_no');
      if (sel && sel.value === '__add__') sel.value = sample.freezer_no;

      const wrap = document.getElementById('freezer-no-add-wrap');
      if (wrap) wrap.classList.add('hidden');
    }

    appState.db.run('BEGIN TRANSACTION;');

    let boxId = null;
    const hasAnyStorage =
      sample.storage_temperature ||
      sample.freezer_no ||
      sample.rack ||
      sample.box_label;

    if (hasAnyStorage && !sample.box_label) {
      // optional warning
    }

    if (sample.box_label) {
      const existingBox = queryAll(
        `SELECT id FROM boxes
         WHERE storage_temperature = ? AND freezer_no = ? AND rack = ? AND box_label = ?
         LIMIT 1`,
        [
          sample.storage_temperature || '',
          sample.freezer_no || '',
          sample.rack || '',
          sample.box_label,
        ]
      );

      if (existingBox.length > 0) {
        boxId = existingBox[0].id;
      } else {
        const insertBoxStmt = appState.db.prepare(`
          INSERT INTO boxes (storage_temperature, freezer_no, rack, box_label)
          VALUES (?, ?, ?, ?);
        `);
        insertBoxStmt.run([
          sample.storage_temperature || '',
          sample.freezer_no || '',
          sample.rack || '',
          sample.box_label,
        ]);
        insertBoxStmt.free();

        const row = queryAll('SELECT last_insert_rowid() AS id;')[0];
        boxId = row.id;
      }
    }

    if (sampleRowId) {
      const updateStmt = appState.db.prepare(`
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

      updateStmt.run([
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
        parseInt(sampleRowId, 10),
      ]);

      updateStmt.free();
    } else {
      const insertStmt = appState.db.prepare(`
        INSERT INTO samples
          (sample_id, date, experiment_label, species_genotype, model, tissue, sample_type, notes,
           processing, parent_sample_id, amount, project, status, box_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
      `);

      insertStmt.run([
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
      ]);

      insertStmt.free();
    }

    appState.db.run('COMMIT;');

    if (typeof makeDbDirty === 'function') {
      makeDbDirty();
    }

    resetForm();

    if (typeof refreshAllViews === 'function') {
      refreshAllViews();
    }
  });
}