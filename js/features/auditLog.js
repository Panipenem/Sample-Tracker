import { queryAll } from '../db/query.js';
import { escapeHtml } from '../utils/string.js';

export function renderAuditLog() {
  const tbody = document.querySelector('#audit-table tbody');
  if (!tbody) return;

  tbody.innerHTML = '';
  renderAuditActionOptions();

  const search = (document.getElementById('audit-search-input')?.value || '')
    .trim()
    .toLowerCase();
  const action = document.getElementById('audit-action-filter')?.value || '';
  const where = [];
  const params = [];

  if (search) {
    where.push(`(
      LOWER(COALESCE(sample_id, '')) LIKE ?
      OR LOWER(COALESCE(details_json, '')) LIKE ?
    )`);
    params.push(`%${search}%`, `%${search}%`);
  }

  if (action) {
    where.push('action = ?');
    params.push(action);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const rows = queryAll(`
    SELECT created_at, action, sample_id, details_json
    FROM sample_events
    ${whereSql}
    ORDER BY id DESC
    LIMIT 200;
  `, params);

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

export function bindAuditLogEvents({ renderAuditLog: rerender } = {}) {
  const search = document.getElementById('audit-search-input');
  const action = document.getElementById('audit-action-filter');

  if (search && typeof rerender === 'function') {
    search.addEventListener('input', rerender);
  }

  if (action && typeof rerender === 'function') {
    action.addEventListener('change', rerender);
  }
}

function renderAuditActionOptions() {
  const select = document.getElementById('audit-action-filter');
  if (!select) return;

  const current = select.value;
  const actions = queryAll(`
    SELECT DISTINCT action
    FROM sample_events
    ORDER BY action ASC;
  `);

  select.innerHTML = '<option value="">All actions</option>';

  actions.forEach(row => {
    if (!row.action) return;
    const opt = document.createElement('option');
    opt.value = row.action;
    opt.textContent = row.action;
    select.appendChild(opt);
  });

  select.value = current;
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
