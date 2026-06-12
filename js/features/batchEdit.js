import { appState } from '../state.js';
import { recordSampleEvent } from '../db/audit.js';
import { queryAll, withTransaction } from '../db/query.js';
import { getOrCreateBoxId } from '../db/boxes.js';
import { getBatchFreezerNoFromUI } from './freezerSelect.js';

export function bindBatchEditEvents({
  refreshAllViews,
  refreshFreezerMenus,
  makeDbDirty,
} = {}) {
  const batchBackdrop = document.getElementById('batch-edit-backdrop');
  if (!batchBackdrop) return;

  bindOpenBatchEdit(batchBackdrop, {
    refreshFreezerMenus,
  });

  bindCloseBatchEdit(batchBackdrop);
  bindAdvancedToggle();

  bindApplyBatchEdit(batchBackdrop, {
    refreshAllViews,
    makeDbDirty,
  });
}

function closeBatchEdit(batchBackdrop) {
  if (!batchBackdrop) return;
  batchBackdrop.classList.add('hidden');
  batchBackdrop.style.display = 'none';
}

function bindOpenBatchEdit(batchBackdrop, { refreshFreezerMenus } = {}) {
  const btnBatchEdit = document.getElementById('btn-batch-edit');
  if (!btnBatchEdit) return;

  btnBatchEdit.addEventListener('click', () => {
    if (!appState.db) {
      alert('Database not ready.');
      return;
    }

    const checked = Array.from(document.querySelectorAll('.sample-select:checked'));
    if (checked.length === 0) {
      alert('No samples selected.');
      return;
    }

    const countSpan = document.getElementById('batch-edit-count');
    if (countSpan) countSpan.textContent = String(checked.length);

    [
      'batch-project',
      'batch-notes',
      'batch-processing',
      'batch-storage-temperature',
      'batch-freezer-no',
      'batch-rack',
      'batch-box-label',
      'batch-species-genotype',
      'batch-model',
      'batch-tissue',
      'batch-sample-type',
    ].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });

    const stSel = document.getElementById('batch-status');
    if (stSel) stSel.value = '';

    const advSec = document.getElementById('batch-advanced-section');
    if (advSec) advSec.style.display = 'none';

    if (typeof refreshFreezerMenus === 'function') {
      refreshFreezerMenus();
    }

    const bNew = document.getElementById('batch-freezer-no-new');
    if (bNew) bNew.value = '';

    const bWrap = document.getElementById('batch-freezer-no-add-wrap');
    if (bWrap) bWrap.classList.add('hidden');

    batchBackdrop.classList.remove('hidden');
    batchBackdrop.style.display = 'flex';
  });
}

function bindCloseBatchEdit(batchBackdrop) {
  const btnBatchCancel = document.getElementById('batch-edit-cancel');
  if (btnBatchCancel) {
    btnBatchCancel.addEventListener('click', () => {
      closeBatchEdit(batchBackdrop);
    });
  }

  const btnBatchClose = document.getElementById('batch-edit-close');
  if (btnBatchClose) {
    btnBatchClose.addEventListener('click', () => {
      closeBatchEdit(batchBackdrop);
    });
  }
}

function bindAdvancedToggle() {
  const advToggle = document.getElementById('batch-adv-toggle');
  if (!advToggle) return;

  advToggle.addEventListener('click', () => {
    const sec = document.getElementById('batch-advanced-section');
    if (!sec) return;

    sec.style.display =
      sec.style.display === 'none' || !sec.style.display
        ? 'block'
        : 'none';
  });
}

function bindApplyBatchEdit(
  batchBackdrop,
  { refreshAllViews, makeDbDirty } = {}
) {
  const btnBatchApply = document.getElementById('batch-edit-apply');
  if (!btnBatchApply) return;

  btnBatchApply.addEventListener('click', () => {
    if (!appState.db) return;

    const checked = Array.from(document.querySelectorAll('.sample-select:checked'));
    if (checked.length === 0) {
      alert('No samples selected.');
      closeBatchEdit(batchBackdrop);
      return;
    }

    const projValRaw = (document.getElementById('batch-project').value || '').trim();
    const notesValRaw = (document.getElementById('batch-notes').value || '').trim();
    const procValRaw = (document.getElementById('batch-processing').value || '').trim();
    const statusRaw = document.getElementById('batch-status').value || '';

    const tempRaw = (document.getElementById('batch-storage-temperature').value || '').trim();
    const freezerRaw = (getBatchFreezerNoFromUI() || '').trim();
    const rackRaw = (document.getElementById('batch-rack').value || '').trim();
    const boxLabelRaw = (document.getElementById('batch-box-label').value || '').trim();

    const speciesRaw = (document.getElementById('batch-species-genotype').value || '').trim();
    const modelRaw = (document.getElementById('batch-model').value || '').trim();
    const tissueRaw = (document.getElementById('batch-tissue').value || '').trim();
    const typeRaw = (document.getElementById('batch-sample-type').value || '').trim();

    const projVal = projValRaw || null;
    const notesVal = notesValRaw || null;
    const procVal = procValRaw || null;
    const statusVal = statusRaw || null;
    const speciesVal = speciesRaw || null;
    const modelVal = modelRaw || null;
    const tissueVal = tissueRaw || null;
    const typeVal = typeRaw || null;

    const hasAnyChange =
      projVal || notesVal || procVal || statusVal ||
      tempRaw || freezerRaw || rackRaw || boxLabelRaw ||
      speciesVal || modelVal || tissueVal || typeVal;

    if (!hasAnyChange) {
      alert('No new values provided.');
      return;
    }

    const wantStoragePatch = !!(tempRaw || freezerRaw || rackRaw || boxLabelRaw);

    try {
      withTransaction(() => {
        const stmt = appState.db.prepare(`
          UPDATE samples SET
              project          = COALESCE(?, project),
              notes            = COALESCE(?, notes),
              processing       = COALESCE(?, processing),
              status           = COALESCE(?, status),
              species_genotype = COALESCE(?, species_genotype),
              model            = COALESCE(?, model),
              tissue           = COALESCE(?, tissue),
              sample_type      = COALESCE(?, sample_type),
              updated_at       = datetime('now')
          WHERE id = ?;
        `);

        try {
          checked.forEach(cb => {
            const id = parseInt(cb.getAttribute('data-id'), 10);
            if (!Number.isFinite(id)) return;
            const sample = queryAll('SELECT sample_id FROM samples WHERE id = ? LIMIT 1;', [id])[0] || {};

            stmt.run([
              projVal,
              notesVal,
              procVal,
              statusVal,
              speciesVal,
              modelVal,
              tissueVal,
              typeVal,
              id,
            ]);

            recordSampleEvent({
              sampleRowId: id,
              sampleId: sample.sample_id,
              action: 'batch_edit',
              details: {
                source: 'batch_edit_modal',
                fields: {
                  project: !!projVal,
                  notes: !!notesVal,
                  processing: !!procVal,
                  status: !!statusVal,
                  species_genotype: !!speciesVal,
                  model: !!modelVal,
                  tissue: !!tissueVal,
                  sample_type: !!typeVal,
                  storage: wantStoragePatch,
                },
              },
            });
          });
        } finally {
          stmt.free();
        }

        if (!wantStoragePatch) return;

        const updBox = appState.db.prepare(`
          UPDATE samples
          SET box_id = ?, updated_at = datetime('now')
          WHERE id = ?;
        `);

        try {
          checked.forEach(cb => {
            const id = parseInt(cb.getAttribute('data-id'), 10);
            if (!Number.isFinite(id)) return;

            const cur = queryAll(`
              SELECT b.storage_temperature, b.freezer_no, b.rack, b.box_label
              FROM samples s
              LEFT JOIN boxes b ON s.box_id = b.id
              WHERE s.id = ?
              LIMIT 1;
            `, [id])[0] || {};

            const curTemp = (cur.storage_temperature || '').trim();
            const curFreezer = (cur.freezer_no || '').trim();
            const curRack = (cur.rack || '').trim();
            const curLabel = (cur.box_label || '').trim();

            const newTemp = tempRaw || curTemp;
            const newFreezer = freezerRaw || curFreezer;
            const newRack = rackRaw || curRack;
            const newLabel = boxLabelRaw || curLabel;

            if (!(newTemp || newFreezer || newRack || newLabel)) return;

            const boxId = getOrCreateBoxId({
              storage_temperature: newTemp,
              freezer_no: newFreezer,
              rack: newRack,
              box_label: newLabel,
            });

            updBox.run([boxId, id]);
          });
        } finally {
          updBox.free();
        }
      });
    } catch (err) {
      console.error('Batch edit failed, rolled back.', err);
      alert('Batch edit failed. No changes were saved; please check console for details.');
      return;
    }

    if (typeof makeDbDirty === 'function') {
      makeDbDirty();
    }

    closeBatchEdit(batchBackdrop);

    if (typeof refreshAllViews === 'function') {
      refreshAllViews();
    }
  });
}
