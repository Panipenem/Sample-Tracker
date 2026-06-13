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
    title.textContent = `Sample details: ${sample.sample_id || id}`;
  }

  body.innerHTML = `
    <div class="detail-grid">
      ${detailItem('Date', sample.date)}
      ${detailItem('Status', sample.status)}
      ${detailItem('Project', sample.project)}
      ${detailItem('Species / Genotype', sample.species_genotype)}
      ${detailItem('Model', sample.model)}
      ${detailItem('Tissue', sample.tissue)}
      ${detailItem('Type', sample.sample_type)}
      ${detailItem('Processing', sample.processing)}
      ${detailItem('Parent row ID', sample.parent_sample_id)}
      ${detailItem('Amount', sample.amount)}
      ${detailItem('Storage', [
        sample.storage_temperature,
        sample.freezer_no,
        sample.rack,
        sample.box_label,
      ].filter(Boolean).join(' / '))}
      ${detailItem('Deleted at', sample.deleted_at)}
    </div>
    <h3>Notes</h3>
    <div class="small">${escapeHtml(sample.notes || '(none)')}</div>
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
  `;

  backdrop.classList.remove('hidden');
}

function closeSampleDetail() {
  const backdrop = document.getElementById('sample-detail-backdrop');
  if (backdrop) backdrop.classList.add('hidden');
}

function detailItem(label, value) {
  return `
    <div class="detail-item">
      <span class="small">${escapeHtml(label)}</span>
      <strong>${escapeHtml(value || '')}</strong>
    </div>
  `;
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
