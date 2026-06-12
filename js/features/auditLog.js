import { queryAll } from '../db/query.js';
import { escapeHtml } from '../utils/string.js';

export function renderAuditLog() {
  const tbody = document.querySelector('#audit-table tbody');
  if (!tbody) return;

  tbody.innerHTML = '';

  const rows = queryAll(`
    SELECT created_at, action, sample_id, details_json
    FROM sample_events
    ORDER BY id DESC
    LIMIT 200;
  `);

  rows.forEach(row => {
    const tr = document.createElement('tr');
    const details = formatDetails(row.details_json);

    tr.innerHTML = `
      <td>${escapeHtml(row.created_at)}</td>
      <td>${escapeHtml(row.action)}</td>
      <td>${escapeHtml(row.sample_id)}</td>
      <td>${escapeHtml(details)}</td>
    `;

    tbody.appendChild(tr);
  });
}

function formatDetails(detailsJson) {
  if (!detailsJson) return '';

  try {
    const details = JSON.parse(detailsJson);
    return Object.entries(details)
      .map(([key, value]) => `${key}: ${formatValue(value)}`)
      .join(' | ');
  } catch (_) {
    return detailsJson;
  }
}

function formatValue(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}
