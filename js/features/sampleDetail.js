import { queryAll } from '../db/query.js';
import { escapeHtml } from '../utils/string.js';

export function bindSampleDetailEvents() {
  document.addEventListener('click', event => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (!target.matches('.btn-details')) return;

    const id = parseInt(target.getAttribute('data-id'), 10);
    if (!Number.isFinite(id)) return;

    openSampleDetail(id);
  });

  const close = document.getElementById('sample-detail-close');
  if (close) {
    close.addEventListener('click', closeSampleDetail);
  }

  const backdrop = document.getElementById('sample-detail-backdrop');
  if (backdrop) {
    backdrop.addEventListener('click', event => {
      if (event.target === backdrop) closeSampleDetail();
    });
  }
}

function openSampleDetail(id) {
  const rows = queryAll(`
    SELECT s.*, b.storage_temperature, b.freezer_no, b.rack, b.box_label
    FROM samples s
    LEFT JOIN boxes b ON s.box_id = b.id
    WHERE s.id = ?
    LIMIT 1;
  `, [id]);

  if (rows.length === 0) return;

  const sample = rows[0];
  const children = queryAll(`
    SELECT DISTINCT sample_id, status
    FROM samples
    WHERE parent_sample_id = ?
       OR CAST(parent_sample_id AS TEXT) = CAST(? AS TEXT)
    ORDER BY sample_id ASC;
  `, [sample.sample_id || '', id]);
  const events = queryAll(`
    SELECT created_at, action, details_json
    FROM sample_events
    WHERE sample_row_id = ? OR sample_id = ?
    ORDER BY id DESC
    LIMIT 100;
  `, [id, sample.sample_id || '']);

  const title = document.getElementById('sample-detail-title');
  const body = document.getElementById('sample-detail-body');
  const backdrop = document.getElementById('sample-detail-backdrop');
  if (!body || !backdrop) return;

  if (title) {
    title.innerHTML = `
      <span>Sample details</span>
      <span class="detail-title-id">${escapeHtml(sample.sample_id || id)}</span>
      ${statusTag(sample.status)}
    `;
  }

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

  backdrop.classList.remove('hidden');
}

function closeSampleDetail() {
  const backdrop = document.getElementById('sample-detail-backdrop');
  if (backdrop) backdrop.classList.add('hidden');
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
  }

  return `<span class="${cls}">${escapeHtml(status)}</span>`;
}

function formatDetails(detailsJson) {
  if (!detailsJson) return '';
  try {
    const details = JSON.parse(detailsJson);
    return Object.entries(details)
      .map(([key, value]) => `${key}: ${typeof value === 'object' ? JSON.stringify(value) : value}`)
      .join(' | ');
  } catch (_) {
    return detailsJson;
  }
}
