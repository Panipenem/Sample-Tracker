import { appState } from '../state.js';
import { recordSampleEvent } from '../db/audit.js';
import { getOrCreateBoxId } from '../db/boxes.js';
import { queryAll, withTransaction } from '../db/query.js';
import { getDataEntrySampleTypes } from '../db/sampleTypes.js';
import { validateSampleInput } from '../utils/validation.js';
import { escapeHtml } from '../utils/string.js';
import { addFreezerToListByTemp } from './freezerSelect.js';

let currentSampleId = null;
let refreshAllViewsCallback = null;
let makeDbDirtyCallback = null;

export function bindSampleDetailEvents({
  makeDbDirty,
  refreshAllViews,
} = {}) {
  makeDbDirtyCallback = makeDbDirty;
  refreshAllViewsCallback = refreshAllViews;

  document.addEventListener('click', event => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    if (target.matches('.btn-details')) {
      const id = parseInt(target.getAttribute('data-id'), 10);
      if (Number.isFinite(id)) openSampleModal(id, 'view');
      return;
    }

    if (target.matches('.btn-edit')) {
      const id = parseInt(target.getAttribute('data-id'), 10);
      if (Number.isFinite(id)) openSampleModal(id, 'edit');
      return;
    }

    if (target.matches('#sample-detail-edit')) {
      if (Number.isFinite(currentSampleId)) openSampleModal(currentSampleId, 'edit');
      return;
    }

    if (target.matches('#sample-detail-cancel-edit')) {
      if (Number.isFinite(currentSampleId)) openSampleModal(currentSampleId, 'view');
    }
  });

  document.addEventListener('submit', event => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    if (!form.matches('#sample-detail-edit-form')) return;

    event.preventDefault();
    saveSampleEdit();
  });

  const close = document.getElementById('sample-detail-close');
  if (close) {
    close.addEventListener('click', closeSampleModal);
  }

  const backdrop = document.getElementById('sample-detail-backdrop');
  if (backdrop) {
    backdrop.addEventListener('click', event => {
      if (event.target === backdrop) closeSampleModal();
    });
  }
}

function openSampleModal(id, mode = 'view') {
  const sample = getSample(id);
  if (!sample) return;

  currentSampleId = Number(sample.id);
  renderTitle(sample, mode);

  if (mode === 'edit') {
    renderEdit(sample);
  } else {
    renderDetail(sample);
  }

  const backdrop = document.getElementById('sample-detail-backdrop');
  if (backdrop) backdrop.classList.remove('hidden');
}

function closeSampleModal() {
  const backdrop = document.getElementById('sample-detail-backdrop');
  if (backdrop) backdrop.classList.add('hidden');
  currentSampleId = null;
}

function getSample(id) {
  if (!appState.db) return null;

  return queryAll(`
    SELECT s.*, b.storage_temperature, b.freezer_no, b.rack, b.box_label
    FROM samples s
    LEFT JOIN boxes b ON s.box_id = b.id
    WHERE s.id = ?
    LIMIT 1;
  `, [id])[0] || null;
}

function renderTitle(sample, mode) {
  const title = document.getElementById('sample-detail-title');
  const actions = document.getElementById('sample-detail-actions');

  if (title) {
    title.innerHTML = `
      <span>${mode === 'edit' ? 'Edit sample' : 'Sample details'}</span>
      <span class="detail-title-id">${escapeHtml(sample.sample_id || sample.id)}</span>
      ${statusTag(sample.status)}
    `;
  }

  if (!actions) return;

  actions.innerHTML = mode === 'edit'
    ? `
      <button type="button" id="sample-detail-cancel-edit" class="btn-secondary">Cancel</button>
      <button type="submit" form="sample-detail-edit-form" class="btn-primary">Save changes</button>
    `
    : `<button type="button" id="sample-detail-edit" class="btn-secondary">Edit</button>`;
}

function renderDetail(sample) {
  const body = document.getElementById('sample-detail-body');
  if (!body) return;

  const children = queryAll(`
    SELECT DISTINCT sample_id, status
    FROM samples
    WHERE parent_sample_id = ?
    ORDER BY sample_id ASC;
  `, [sample.sample_id || '']);
  const events = queryAll(`
    SELECT created_at, action, details_json
    FROM sample_events
    WHERE sample_row_id = ? OR sample_id = ?
    ORDER BY id DESC
    LIMIT 100;
  `, [sample.id, sample.sample_id || '']);

  body.innerHTML = `
    <div class="detail-layout">
      ${detailSection('Overview', [
        detailItem('Date', sample.date),
        detailItem('Project', sample.project),
        detailItem('Species / Genotype', sample.species_genotype),
        detailItem('Model', sample.model),
        detailItem('Tissue', sample.tissue),
        detailItem('Type', sample.sample_type),
        detailItem('Processing', sample.processing),
        detailItem('Amount', sample.amount),
      ].join(''))}

      ${detailSection('Storage', [
        detailItem('Temperature', sample.storage_temperature),
        detailItem('Freezer', sample.freezer_no),
        detailItem('Rack', sample.rack),
        detailItem('Box', sample.box_label),
      ].join(''))}

      ${detailSection('Lineage', [
        detailItem('Parent Sample ID', sample.parent_sample_id),
        detailItem('Child Sample IDs', childSampleChips(children), { html: true }),
        detailItem('Deleted at', sample.deleted_at),
      ].join(''))}

      <section class="detail-panel detail-notes-panel">
        <h3>Notes</h3>
        <div class="detail-notes">${escapeHtml(sample.notes || '(none)')}</div>
      </section>

      <section class="detail-panel detail-history-panel">
        <h3>History</h3>
        <table id="sample-detail-history-table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Action</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            ${events.map(event => `
              <tr>
                <td>${escapeHtml(event.created_at)}</td>
                <td>${escapeHtml(event.action)}</td>
                <td>${escapeHtml(formatDetails(event.details_json))}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </section>
    </div>
  `;
}

function renderEdit(sample) {
  const body = document.getElementById('sample-detail-body');
  if (!body) return;

  const children = queryAll(`
    SELECT DISTINCT sample_id, status
    FROM samples
    WHERE parent_sample_id = ?
    ORDER BY sample_id ASC;
  `, [sample.sample_id || '']);
  const events = queryAll(`
    SELECT created_at, action, details_json
    FROM sample_events
    WHERE sample_row_id = ? OR sample_id = ?
    ORDER BY id DESC
    LIMIT 100;
  `, [sample.id, sample.sample_id || '']);

  body.innerHTML = `
    <form id="sample-detail-edit-form" class="detail-layout sample-inline-edit-form">
      <input type="hidden" id="sample-edit-row-id" value="${escapeHtml(sample.id)}">

      ${detailSection('Overview', [
        editableDetailItem('Date', textControl('sample-edit-date', sample.date, { maxlength: 8 })),
        editableDetailItem('Project', textControl('sample-edit-project', sample.project)),
        editableDetailItem('Species / Genotype', textControl('sample-edit-species-genotype', sample.species_genotype)),
        editableDetailItem('Model', textControl('sample-edit-model', sample.model)),
        editableDetailItem('Tissue', textControl('sample-edit-tissue', sample.tissue)),
        editableDetailItem('Type', sampleTypeSelect(sample.sample_type)),
        editableDetailItem('Processing', textControl('sample-edit-processing', sample.processing)),
        editableDetailItem('Amount', textControl('sample-edit-amount', sample.amount)),
        editableDetailItem('Sample ID', textControl('sample-edit-sample-id', sample.sample_id, { required: true })),
        editableDetailItem('Status', statusSelect(sample.status)),
      ].join(''))}

      ${detailSection('Storage', [
        editableDetailItem('Temperature', temperatureSelect(sample.storage_temperature)),
        editableDetailItem('Freezer', textControl('sample-edit-freezer-no', sample.freezer_no)),
        editableDetailItem('Rack', textControl('sample-edit-rack', sample.rack)),
        editableDetailItem('Box', textControl('sample-edit-box-label', sample.box_label)),
      ].join(''))}

      ${detailSection('Lineage', [
        editableDetailItem('Parent Sample ID', textControl('sample-edit-parent-sample-id', sample.parent_sample_id)),
        detailItem('Child Sample IDs', childSampleChips(children), { html: true }),
        detailItem('Deleted at', sample.deleted_at),
      ].join(''))}

      <section class="detail-panel detail-notes-panel">
        <h3>Notes</h3>
        <textarea id="sample-edit-notes" class="detail-notes-edit">${escapeHtml(sample.notes || '')}</textarea>
      </section>
    </form>

    <section class="detail-panel detail-history-panel">
      <h3>History</h3>
      <table id="sample-detail-history-table">
        <thead>
          <tr>
            <th>Time</th>
            <th>Action</th>
            <th>Details</th>
          </tr>
        </thead>
        <tbody>
          ${events.map(event => `
            <tr>
              <td>${escapeHtml(event.created_at)}</td>
              <td>${escapeHtml(event.action)}</td>
              <td>${escapeHtml(formatDetails(event.details_json))}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </section>
  `;
}

function saveSampleEdit() {
  if (!appState.db) return;

  const rowId = parseInt(getField('sample-edit-row-id'), 10);
  if (!Number.isFinite(rowId)) return;

  const previous = getSample(rowId);
  if (!previous) return;

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
        details: {
          source: 'sample_modal',
          changes: buildSampleChanges(previous, sample),
        },
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

  if (typeof makeDbDirtyCallback === 'function') {
    makeDbDirtyCallback();
  }

  if (typeof refreshAllViewsCallback === 'function') {
    refreshAllViewsCallback();
  }

  openSampleModal(rowId, 'view');
}

function textControl(id, value, { required = false, maxlength = '' } = {}) {
  return `
    <input
      type="text"
      id="${escapeHtml(id)}"
      value="${escapeHtml(value || '')}"
      ${required ? 'required=""' : ''}
      ${maxlength ? `maxlength="${escapeHtml(maxlength)}"` : ''}
    >
  `;
}

function sampleTypeSelect(value) {
  const values = new Set(getDataEntrySampleTypes());
  if (value) values.add(value);

  return `
    <select id="sample-edit-sample-type">
      <option value="">(select)</option>
      ${Array.from(values).map(type => `
        <option value="${escapeHtml(type)}" ${type === value ? 'selected' : ''}>
          ${escapeHtml(type)}
        </option>
      `).join('')}
    </select>
  `;
}

function statusSelect(value) {
  const statuses = [
    'available',
    'low',
    'low volume',
    'retired',
    'archived',
    'consumed',
    'discarded',
    'deleted',
  ];
  const current = value || 'available';
  if (!statuses.includes(current)) statuses.push(current);

  return `
    <select id="sample-edit-status">
      ${statuses.map(status => `
        <option value="${escapeHtml(status)}" ${status === current ? 'selected' : ''}>
          ${escapeHtml(status)}
        </option>
      `).join('')}
    </select>
  `;
}

function temperatureSelect(value) {
  const options = ['', '-80', '-40', '-20', 'LN2', '4', 'RT'];
  const current = value || '';
  if (current && !options.includes(current)) options.push(current);

  return `
    <select id="sample-edit-storage-temperature">
      ${options.map(option => `
        <option value="${escapeHtml(option)}" ${option === current ? 'selected' : ''}>
          ${escapeHtml(option)}
        </option>
      `).join('')}
    </select>
  `;
}

function getField(id) {
  return document.getElementById(id)?.value || '';
}

function buildSampleChanges(previous, next) {
  const fields = [
    'sample_id',
    'date',
    'experiment_label',
    'species_genotype',
    'model',
    'tissue',
    'sample_type',
    'processing',
    'parent_sample_id',
    'amount',
    'project',
    'status',
    'notes',
    'storage_temperature',
    'freezer_no',
    'rack',
    'box_label',
  ];
  const changes = {};

  fields.forEach(field => {
    const before = normalizeAuditValue(previous[field]);
    const after = normalizeAuditValue(next[field]);
    if (before === after) return;
    changes[field] = { from: before, to: after };
  });

  return changes;
}

function normalizeAuditValue(value) {
  return value == null ? '' : String(value);
}

function detailItem(label, value, { html = false } = {}) {
  const displayValue = html ? (value || '') : escapeHtml(value || '');

  return `
    <div class="detail-item">
      <span class="small">${escapeHtml(label)}</span>
      <strong>${displayValue}</strong>
    </div>
  `;
}

function editableDetailItem(label, controlHtml) {
  return `
    <div class="detail-item detail-item-editing">
      <label for="${extractControlId(controlHtml)}" class="small">${escapeHtml(label)}</label>
      ${controlHtml}
    </div>
  `;
}

function extractControlId(controlHtml) {
  const match = String(controlHtml).match(/\sid="([^"]+)"/);
  return match ? escapeHtml(match[1]) : '';
}

function detailSection(title, content) {
  return `
    <section class="detail-panel">
      <h3>${escapeHtml(title)}</h3>
      <div class="detail-grid">${content}</div>
    </section>
  `;
}

function childSampleChips(children) {
  if (!children || children.length === 0) return '';

  return children
    .map(child => `
      <span class="detail-chip">
        ${escapeHtml(child.sample_id)}
        ${child.status ? `<span>${escapeHtml(child.status)}</span>` : ''}
      </span>
    `)
    .join('');
}

function statusTag(status) {
  if (!status) return '';

  const normalized = String(status).toLowerCase();
  let cls = 'tag detail-status-tag';

  if (normalized.startsWith('available')) {
    cls += ' tag-available';
  } else if (normalized.startsWith('low')) {
    cls += ' tag-low';
  } else if (normalized === 'deleted') {
    cls += ' tag-deleted';
  } else if (
    normalized === 'archived' ||
    normalized === 'retired' ||
    normalized === 'discarded' ||
    normalized === 'consumed'
  ) {
    cls += ' tag-archived';
  }

  return `<span class="${cls}">${escapeHtml(status)}</span>`;
}

function formatDetails(detailsJson) {
  if (!detailsJson) return '';
  try {
    const details = JSON.parse(detailsJson);
    if (details.changes && typeof details.changes === 'object') {
      const changeText = Object.entries(details.changes)
        .map(([field, change]) => `${field}: ${change.from || '(empty)'} -> ${change.to || '(empty)'}`)
        .join(' | ');
      return [details.source ? `source: ${details.source}` : '', changeText]
        .filter(Boolean)
        .join(' | ');
    }

    return Object.entries(details)
      .map(([key, value]) => `${key}: ${typeof value === 'object' ? JSON.stringify(value) : value}`)
      .join(' | ');
  } catch (_) {
    return detailsJson;
  }
}
