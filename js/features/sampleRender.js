import { appState } from '../state.js';
import { queryAll } from '../db/query.js';
import { ensureSelectHasValue } from '../utils/select.js';
import { setActiveTab } from './tabs.js';

export function isArchivedStatus(status) {
  if (!status) return false;

  const s = String(status).toLowerCase();
  return (
    s === 'archived' ||
    s === 'retired' ||
    s === 'discarded' ||
    s === 'consumed'
  );
}

export function renderSamples({
  makeDbDirty,
  refreshAllViews,
  loadSampleToForm,
} = {}) {
  const tbody = document.querySelector('#samples-table tbody');
  if (!tbody) return;

  tbody.innerHTML = '';
  if (!appState.db) return;

  const search = document
    .getElementById('search-input')
    .value.trim()
    .toLowerCase();

  const statusFilter = document.getElementById('status-filter').value;

  const rows = queryAll(`
    SELECT s.id, 
           s.sample_id,
           s.date, 
           s.experiment_label,
           s.species_genotype, 
           s.model, 
           s.tissue, 
           s.sample_type,
           s.processing,
           s.notes,
           s.project, 
           s.status,
           b.storage_temperature, 
           b.freezer_no, 
           b.rack, 
           b.box_label
    FROM samples s
    LEFT JOIN boxes b ON s.box_id = b.id
    ORDER BY s.date ASC, s.sample_id ASC;
  `);

  const filtered = rows.filter(row => {
    if (isArchivedStatus(row.status)) return false;

    const text = [
      row.sample_id || '',
      row.tissue || '',
      row.model || '',
      row.project || '',
      row.processing || '',
      row.species_genotype || '',
      row.experiment_label || '',
    ]
      .join(' ')
      .toLowerCase();

    if (search && !text.includes(search)) return false;

    if (statusFilter) {
      if (!row.status) return false;
      if (String(row.status).toLowerCase() !== statusFilter.toLowerCase()) {
        return false;
      }
    }

    return true;
  });

  filtered.forEach(row => {
    const tr = document.createElement('tr');

    const storageParts = [];
    if (row.storage_temperature) storageParts.push(row.storage_temperature);
    if (row.freezer_no) storageParts.push(row.freezer_no);
    if (row.rack) storageParts.push(row.rack);
    if (row.box_label) storageParts.push(row.box_label);

    const storageStr = storageParts.join(' / ');

    let statusHtml = '';
    if (row.status) {
      let cls = 'tag';
      const s = String(row.status).toLowerCase();

      if (s.startsWith('available')) {
        cls += ' tag-available';
      } else if (s.startsWith('low')) {
        cls += ' tag-low';
      }

      statusHtml = `<span class="${cls}">${row.status}</span>`;
    }

    tr.innerHTML = `
      <td><input type="checkbox" class="sample-select" data-id="${row.id}"></td>
      <td>${row.sample_id || ''}</td>
      <td>${row.date || ''}</td>
      <td>${row.experiment_label || ''}</td>
      <td>${row.species_genotype || ''}</td>
      <td>${row.model || ''}</td>
      <td>${row.tissue || ''}</td>
      <td>${row.sample_type || ''}</td>
      <td>${row.processing || ''}</td>
      <td>${row.notes || ''}</td>
      <td>${row.project || ''}</td>
      <td>${statusHtml}</td>
      <td>${storageStr}</td>
      <td>
        <button data-id="${row.id}" class="btn-edit">Edit</button>
        <button
          data-id="${row.id}"
          data-sample-id="${row.sample_id || ''}"
          class="btn-archive"
        >
          Archive
        </button>
        <button
          data-id="${row.id}"
          data-sample-id="${row.sample_id || ''}"
          class="btn-delete"
        >
          Delete
        </button>
      </td>
    `;

    tbody.appendChild(tr);
  });

  bindRowActionButtons({
    makeDbDirty,
    refreshAllViews,
    loadSampleToForm,
  });

  const selectAll = document.getElementById('select-all-samples');
  if (selectAll) {
    selectAll.checked = false;
  }
}

function bindRowActionButtons({
  makeDbDirty,
  refreshAllViews,
  loadSampleToForm,
} = {}) {
    document.querySelectorAll('.btn-edit').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = parseInt(btn.getAttribute('data-id'), 10);

      if (typeof loadSampleToForm === 'function') {
        loadSampleToForm(id);
      }

      setActiveTab('form');
    });
  });

  document.querySelectorAll('.btn-archive').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = parseInt(btn.getAttribute('data-id'), 10);
      const sid = btn.getAttribute('data-sample-id') || '';
      const label = sid ? `sample ${sid}` : `ID ${id}`;

      if (!confirm(`Archive ${label}? It will be moved to the Archived tab.`)) {
        return;
      }

      if (!appState.db) return;

      const stmt = appState.db.prepare(
        'UPDATE samples SET status = ? WHERE id = ?'
      );
      stmt.run(['archived', id]);
      stmt.free();

      if (typeof makeDbDirty === 'function') {
        makeDbDirty();
      }

      if (typeof refreshAllViews === 'function') {
        refreshAllViews();
      }
    });
  });

  document.querySelectorAll('.btn-delete').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = parseInt(btn.getAttribute('data-id'), 10);
      const sid = btn.getAttribute('data-sample-id') || '';
      const label = sid ? `sample ${sid}` : `ID ${id}`;

      if (
        !confirm(
          `Permanently DELETE ${label}? Use this only for erroneous entries. This cannot be undone.`
        )
      ) {
        return;
      }

      if (!appState.db) return;

      const stmt = appState.db.prepare('DELETE FROM samples WHERE id = ?');
      stmt.run([id]);
      stmt.free();

      if (typeof makeDbDirty === 'function') {
        makeDbDirty();
      }

      if (typeof refreshAllViews === 'function') {
        refreshAllViews();
      }
    });
  });
}

export function renderArchivedSamples() {
  const tbody = document.querySelector('#archived-table tbody');
  if (!tbody) return;

  tbody.innerHTML = '';
  if (!appState.db) return;

  const search = document
    .getElementById('archived-search-input')
    .value.trim()
    .toLowerCase();

  const rows = queryAll(`
    SELECT s.id, 
           s.sample_id,
           s.date, 
           s.experiment_label,
           s.species_genotype, 
           s.model, 
           s.tissue, 
           s.sample_type,
           s.processing,
           s.notes,
           s.project, 
           s.status,
           b.storage_temperature, 
           b.freezer_no, 
           b.rack, 
           b.box_label
    FROM samples s
    LEFT JOIN boxes b ON s.box_id = b.id
    ORDER BY s.date ASC, s.sample_id ASC;
  `);

  const filtered = rows.filter(row => {
    if (!isArchivedStatus(row.status)) return false;

    const text = [
      row.sample_id || '',
      row.tissue || '',
      row.model || '',
      row.project || '',
      row.processing || '',
      row.species_genotype || '',
      row.experiment_label || '',
    ]
      .join(' ')
      .toLowerCase();

    if (search && !text.includes(search)) return false;
    return true;
  });

  filtered.forEach(row => {
    const tr = document.createElement('tr');

    const storageParts = [];
    if (row.storage_temperature) storageParts.push(row.storage_temperature);
    if (row.freezer_no) storageParts.push(row.freezer_no);
    if (row.rack) storageParts.push(row.rack);
    if (row.box_label) storageParts.push(row.box_label);

    const storageStr = storageParts.join(' / ');

    let statusHtml = '';
    if (row.status) {
      let cls = 'tag';
      const s = String(row.status).toLowerCase();

      if (s.startsWith('available')) {
        cls += ' tag-available';
      } else if (s.startsWith('low')) {
        cls += ' tag-low';
      }

      statusHtml = `<span class="${cls}">${row.status}</span>`;
    }

    tr.innerHTML = `
      <td><input type="checkbox" class="archived-select" data-id="${row.id}"></td>
      <td>${row.sample_id || ''}</td>
      <td>${row.date || ''}</td>
      <td>${row.experiment_label || ''}</td>
      <td>${row.species_genotype || ''}</td>
      <td>${row.model || ''}</td>
      <td>${row.tissue || ''}</td>
      <td>${row.sample_type || ''}</td>
      <td>${row.processing || ''}</td>
      <td>${row.notes || ''}</td>
      <td>${row.project || ''}</td>
      <td>${statusHtml}</td>
      <td>${storageStr}</td>
    `;

    tbody.appendChild(tr);
  });

  const selectAll = document.getElementById('select-all-archived');
  if (selectAll) {
    selectAll.checked = false;
  }
}

export function loadSampleToForm(id, { refreshFreezerMenus } = {}) {
  if (!appState.db) return;

  const rows = queryAll(
    `
    SELECT s.*, b.storage_temperature, b.freezer_no, b.rack, b.box_label
    FROM samples s
    LEFT JOIN boxes b ON s.box_id = b.id
    WHERE s.id = ?
    LIMIT 1;
    `,
    [id]
  );

  if (rows.length === 0) return;

  const s = rows[0];

  document.getElementById('internal_sample_row_id').value = s.id;
  document.getElementById('sample_id').value = s.sample_id || '';
  document.getElementById('date').value = s.date || '';
  document.getElementById('experiment_label').value = s.experiment_label || '';
  document.getElementById('species_genotype').value = s.species_genotype || '';
  document.getElementById('model').value = s.model || '';
  document.getElementById('tissue').value = s.tissue || '';
  const sampleTypeSelect = document.getElementById('sample_type');
  ensureSelectHasValue(sampleTypeSelect, s.sample_type || '');
  document.getElementById('notes').value = s.notes || '';
  document.getElementById('processing').value = s.processing || '';
  document.getElementById('parent_sample_id').value = s.parent_sample_id || '';
  document.getElementById('amount').value = s.amount || '';
  document.getElementById('project').value = s.project || '';
  document.getElementById('status').value = s.status || 'available';
  document.getElementById('storage_temperature').value =
    s.storage_temperature || '';

  if (typeof refreshFreezerMenus === 'function') {
    refreshFreezerMenus();
  }

  document.getElementById('freezer_no').value = s.freezer_no || '';
  document.getElementById('rack').value = s.rack || '';
  document.getElementById('box_label').value = s.box_label || '';
}