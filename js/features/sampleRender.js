import { appState } from '../state.js';
import { recordSampleEvent } from '../db/audit.js';
import { queryAll, withTransaction } from '../db/query.js';
import { ensureSelectHasValue } from '../utils/select.js';
import { escapeHtml } from '../utils/string.js';
import { setActiveTab } from './tabs.js';

const PAGE_SIZE = 100;

const tableState = {
  samplesPage: 1,
  archivedPage: 1,
  deletedPage: 1,
};

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

export function resetSamplePagination() {
  tableState.samplesPage = 1;
}

export function resetArchivedPagination() {
  tableState.archivedPage = 1;
}

export function resetDeletedPagination() {
  tableState.deletedPage = 1;
}

function buildSearchWhere(search, fields) {
  if (!search) {
    return { clause: '', params: [] };
  }

  const like = `%${search.toLowerCase()}%`;
  const parts = fields.map(field => `LOWER(COALESCE(${field}, '')) LIKE ?`);

  return {
    clause: ` AND (${parts.join(' OR ')})`,
    params: fields.map(() => like),
  };
}

function getSampleSelectSql(whereClause = '') {
  return `
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
    WHERE ${whereClause}
    ORDER BY s.date ASC, s.sample_id ASC
    LIMIT ? OFFSET ?;
  `;
}

function renderPager({
  infoId,
  prevId,
  nextId,
  page,
  total,
  onPrev,
  onNext,
}) {
  const info = document.getElementById(infoId);
  const prev = document.getElementById(prevId);
  const next = document.getElementById(nextId);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  if (info) {
    const start = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
    const end = Math.min(total, page * PAGE_SIZE);
    info.textContent = `Showing ${start}-${end} / ${total} · page ${page}/${totalPages} · ${PAGE_SIZE} per page`;
  }

  if (prev) {
    prev.style.display = totalPages > 1 ? 'inline-block' : 'none';
    prev.disabled = page <= 1;
    prev.onclick = onPrev;
  }

  if (next) {
    next.style.display = totalPages > 1 ? 'inline-block' : 'none';
    next.disabled = page >= totalPages;
    next.onclick = onNext;
  }
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

  const searchWhere = buildSearchWhere(search, [
    's.sample_id',
    's.tissue',
    's.model',
    's.project',
    's.processing',
    's.species_genotype',
    's.experiment_label',
  ]);

  const whereParts = [
    `(s.status IS NULL OR s.status NOT IN ('archived','retired','discarded','consumed','deleted'))`,
  ];
  const params = [];

  if (statusFilter) {
    whereParts.push('LOWER(COALESCE(s.status, \'\')) = ?');
    params.push(statusFilter.toLowerCase());
  }

  const whereClause = whereParts.join(' AND ') + searchWhere.clause;
  const whereParams = params.concat(searchWhere.params);
  const totalRow = queryAll(
    `SELECT COUNT(*) AS c
     FROM samples s
     LEFT JOIN boxes b ON s.box_id = b.id
     WHERE ${whereClause};`,
    whereParams
  )[0] || { c: 0 };
  const total = Number(totalRow.c) || 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  tableState.samplesPage = Math.min(tableState.samplesPage, totalPages);
  const offset = (tableState.samplesPage - 1) * PAGE_SIZE;
  const filtered = queryAll(
    getSampleSelectSql(whereClause),
    whereParams.concat([PAGE_SIZE, offset])
  );

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

      statusHtml = `<span class="${cls}">${escapeHtml(row.status)}</span>`;
    }

    const id = Number(row.id) || 0;

    tr.innerHTML = `
      <td><input type="checkbox" class="sample-select" data-id="${id}"></td>
      <td>${escapeHtml(row.sample_id)}</td>
      <td>${escapeHtml(row.date)}</td>
      <td>${escapeHtml(row.experiment_label)}</td>
      <td>${escapeHtml(row.species_genotype)}</td>
      <td>${escapeHtml(row.model)}</td>
      <td>${escapeHtml(row.tissue)}</td>
      <td>${escapeHtml(row.sample_type)}</td>
      <td>${escapeHtml(row.processing)}</td>
      <td>${escapeHtml(row.notes)}</td>
      <td>${escapeHtml(row.project)}</td>
      <td>${statusHtml}</td>
      <td>${escapeHtml(storageStr)}</td>
      <td>
        <button data-id="${id}" class="btn-details">Details</button>
        <button data-id="${id}" class="btn-edit">Edit</button>
        <button
          data-id="${id}"
          data-sample-id="${escapeHtml(row.sample_id)}"
          class="btn-archive"
        >
          Archive
        </button>
        <button
          data-id="${id}"
          data-sample-id="${escapeHtml(row.sample_id)}"
          class="btn-delete"
        >
          Soft delete
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

  renderPager({
    infoId: 'samples-page-info',
    prevId: 'samples-prev-page',
    nextId: 'samples-next-page',
    page: tableState.samplesPage,
    total,
    onPrev: () => {
      tableState.samplesPage = Math.max(1, tableState.samplesPage - 1);
      renderSamples({ makeDbDirty, refreshAllViews, loadSampleToForm });
    },
    onNext: () => {
      tableState.samplesPage = Math.min(totalPages, tableState.samplesPage + 1);
      renderSamples({ makeDbDirty, refreshAllViews, loadSampleToForm });
    },
  });
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

      withTransaction(() => {
        const stmt = appState.db.prepare(
          'UPDATE samples SET status = ?, deleted_at = NULL, updated_at = datetime(\'now\') WHERE id = ?'
        );

        try {
          stmt.run(['archived', id]);
        } finally {
          stmt.free();
        }

        recordSampleEvent({
          sampleRowId: id,
          sampleId: sid,
          action: 'archive',
          details: { source: 'row_button' },
        });
      });

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
          `Soft delete ${label}? It will move to the Deleted tab and remain recoverable.`
        )
      ) {
        return;
      }

      if (!appState.db) return;

      withTransaction(() => {
        const stmt = appState.db.prepare(
          'UPDATE samples SET status = ?, deleted_at = datetime(\'now\'), updated_at = datetime(\'now\') WHERE id = ?'
        );

        try {
          stmt.run(['deleted', id]);
        } finally {
          stmt.free();
        }

        recordSampleEvent({
          sampleRowId: id,
          sampleId: sid,
          action: 'delete',
          details: { source: 'row_button', mode: 'soft_delete' },
        });
      });

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

  const searchWhere = buildSearchWhere(search, [
    's.sample_id',
    's.tissue',
    's.model',
    's.project',
    's.processing',
    's.species_genotype',
    's.experiment_label',
  ]);
  const whereClause =
    `(s.status IN ('archived','retired','discarded','consumed'))` +
    searchWhere.clause;
  const whereParams = searchWhere.params;
  const totalRow = queryAll(
    `SELECT COUNT(*) AS c
     FROM samples s
     LEFT JOIN boxes b ON s.box_id = b.id
     WHERE ${whereClause};`,
    whereParams
  )[0] || { c: 0 };
  const total = Number(totalRow.c) || 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  tableState.archivedPage = Math.min(tableState.archivedPage, totalPages);
  const offset = (tableState.archivedPage - 1) * PAGE_SIZE;
  const filtered = queryAll(
    getSampleSelectSql(whereClause),
    whereParams.concat([PAGE_SIZE, offset])
  );

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

      statusHtml = `<span class="${cls}">${escapeHtml(row.status)}</span>`;
    }

    const id = Number(row.id) || 0;

    tr.innerHTML = `
      <td><input type="checkbox" class="archived-select" data-id="${id}"></td>
      <td>${escapeHtml(row.sample_id)}</td>
      <td>${escapeHtml(row.date)}</td>
      <td>${escapeHtml(row.experiment_label)}</td>
      <td>${escapeHtml(row.species_genotype)}</td>
      <td>${escapeHtml(row.model)}</td>
      <td>${escapeHtml(row.tissue)}</td>
      <td>${escapeHtml(row.sample_type)}</td>
      <td>${escapeHtml(row.processing)}</td>
      <td>${escapeHtml(row.notes)}</td>
      <td>${escapeHtml(row.project)}</td>
      <td>${statusHtml}</td>
      <td>${escapeHtml(storageStr)}</td>
    `;

    tbody.appendChild(tr);
  });

  const selectAll = document.getElementById('select-all-archived');
  if (selectAll) {
    selectAll.checked = false;
  }

  renderPager({
    infoId: 'archived-page-info',
    prevId: 'archived-prev-page',
    nextId: 'archived-next-page',
    page: tableState.archivedPage,
    total,
    onPrev: () => {
      tableState.archivedPage = Math.max(1, tableState.archivedPage - 1);
      renderArchivedSamples();
    },
    onNext: () => {
      tableState.archivedPage = Math.min(totalPages, tableState.archivedPage + 1);
      renderArchivedSamples();
    },
  });
}

export function renderDeletedSamples() {
  const tbody = document.querySelector('#deleted-table tbody');
  if (!tbody) return;

  tbody.innerHTML = '';
  if (!appState.db) return;

  const search = document
    .getElementById('deleted-search-input')
    .value.trim()
    .toLowerCase();

  const searchWhere = buildSearchWhere(search, [
    's.sample_id',
    's.tissue',
    's.model',
    's.project',
    's.processing',
    's.species_genotype',
    's.experiment_label',
  ]);
  const whereClause = `(s.status = 'deleted')` + searchWhere.clause;
  const whereParams = searchWhere.params;
  const totalRow = queryAll(
    `SELECT COUNT(*) AS c
     FROM samples s
     LEFT JOIN boxes b ON s.box_id = b.id
     WHERE ${whereClause};`,
    whereParams
  )[0] || { c: 0 };
  const total = Number(totalRow.c) || 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  tableState.deletedPage = Math.min(tableState.deletedPage, totalPages);
  const offset = (tableState.deletedPage - 1) * PAGE_SIZE;
  const rows = queryAll(
    getSampleSelectSql(whereClause),
    whereParams.concat([PAGE_SIZE, offset])
  );

  rows.forEach(row => {
    const tr = document.createElement('tr');
    const storageParts = [];
    if (row.storage_temperature) storageParts.push(row.storage_temperature);
    if (row.freezer_no) storageParts.push(row.freezer_no);
    if (row.rack) storageParts.push(row.rack);
    if (row.box_label) storageParts.push(row.box_label);

    const statusHtml = row.status
      ? `<span class="tag">${escapeHtml(row.status)}</span>`
      : '';
    const id = Number(row.id) || 0;

    tr.innerHTML = `
      <td><input type="checkbox" class="deleted-select" data-id="${id}"></td>
      <td>${escapeHtml(row.sample_id)}</td>
      <td>${escapeHtml(row.date)}</td>
      <td>${escapeHtml(row.experiment_label)}</td>
      <td>${escapeHtml(row.species_genotype)}</td>
      <td>${escapeHtml(row.model)}</td>
      <td>${escapeHtml(row.tissue)}</td>
      <td>${escapeHtml(row.sample_type)}</td>
      <td>${escapeHtml(row.processing)}</td>
      <td>${escapeHtml(row.notes)}</td>
      <td>${escapeHtml(row.project)}</td>
      <td>${statusHtml}</td>
      <td>${escapeHtml(storageParts.join(' / '))}</td>
    `;

    tbody.appendChild(tr);
  });

  const selectAll = document.getElementById('select-all-deleted');
  if (selectAll) {
    selectAll.checked = false;
  }

  renderPager({
    infoId: 'deleted-page-info',
    prevId: 'deleted-prev-page',
    nextId: 'deleted-next-page',
    page: tableState.deletedPage,
    total,
    onPrev: () => {
      tableState.deletedPage = Math.max(1, tableState.deletedPage - 1);
      renderDeletedSamples();
    },
    onNext: () => {
      tableState.deletedPage = Math.min(totalPages, tableState.deletedPage + 1);
      renderDeletedSamples();
    },
  });
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
