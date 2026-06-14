import { queryAll } from '../db/query.js';
import { escapeHtml } from '../utils/string.js';

export function renderDataQuality() {
  const summary = document.getElementById('data-quality-summary');
  const tbody = document.querySelector('#quality-table tbody');
  if (!summary || !tbody) return;

  const metrics = [
    ['Missing date', countWhere(`date IS NULL OR TRIM(date) = ''`)],
    ['Missing storage', countMissingStorage()],
    ['Missing box', countWhere(`box_id IS NULL AND (status IS NULL OR status NOT IN ('deleted'))`)],
    ['Parent not found', countMissingParents()],
    ['Low volume', countWhere(`LOWER(COALESCE(status, '')) = 'low'`)],
    ['Deleted', countWhere(`LOWER(COALESCE(status, '')) = 'deleted'`)],
  ];

  summary.innerHTML = metrics.map(([label, count]) => `
    <div class="quality-card">
      <strong>${escapeHtml(count)}</strong>
      <span class="small">${escapeHtml(label)}</span>
    </div>
  `).join('');

  const issues = []
    .concat(issueRows('Missing date', `s.date IS NULL OR TRIM(s.date) = ''`, 'date is empty'))
    .concat(issueRows('Missing storage', `
      (s.box_id IS NULL OR b.box_label IS NULL OR TRIM(b.box_label) = '')
      AND (s.status IS NULL OR s.status != 'deleted')
    `, 'no linked box or missing box label'))
    .concat(missingParentRows());

  tbody.innerHTML = issues.slice(0, 200).map(row => `
    <tr>
      <td>${escapeHtml(row.issue)}</td>
      <td>${escapeHtml(row.sample_id)}</td>
      <td>${escapeHtml(row.date)}</td>
      <td>${escapeHtml(row.project)}</td>
      <td>${escapeHtml(row.details)}</td>
    </tr>
  `).join('');
}

function countWhere(whereSql) {
  return queryAll(`SELECT COUNT(*) AS c FROM samples WHERE ${whereSql};`)[0]?.c || 0;
}

function countMissingStorage() {
  return queryAll(`
    SELECT COUNT(*) AS c
    FROM samples s
    LEFT JOIN boxes b ON s.box_id = b.id
    WHERE (s.box_id IS NULL OR b.box_label IS NULL OR TRIM(b.box_label) = '')
      AND (s.status IS NULL OR s.status != 'deleted');
  `)[0]?.c || 0;
}

function countMissingParents() {
  return queryAll(`
    SELECT COUNT(*) AS c
    FROM samples s
    LEFT JOIN samples p
      ON s.parent_sample_id = p.sample_id
    WHERE s.parent_sample_id IS NOT NULL
      AND TRIM(s.parent_sample_id) != ''
      AND p.id IS NULL;
  `)[0]?.c || 0;
}

function issueRows(issue, whereSql, details) {
  return queryAll(`
    SELECT s.sample_id, s.date, s.project
    FROM samples s
    LEFT JOIN boxes b ON s.box_id = b.id
    WHERE ${whereSql}
    ORDER BY s.date ASC, s.sample_id ASC
    LIMIT 100;
  `).map(row => ({ ...row, issue, details }));
}

function missingParentRows() {
  return queryAll(`
    SELECT s.sample_id, s.date, s.project, s.parent_sample_id
    FROM samples s
    LEFT JOIN samples p
      ON s.parent_sample_id = p.sample_id
    WHERE s.parent_sample_id IS NOT NULL
      AND TRIM(s.parent_sample_id) != ''
      AND p.id IS NULL
    ORDER BY s.date ASC, s.sample_id ASC
    LIMIT 100;
  `).map(row => ({
    issue: 'Parent not found',
    sample_id: row.sample_id,
    date: row.date,
    project: row.project,
    details: `parent_sample_id: ${row.parent_sample_id}`,
  }));
}
