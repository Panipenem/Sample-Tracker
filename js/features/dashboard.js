import { appState } from '../state.js';
import { queryAll } from '../db/query.js';
import { getMeta } from '../db/meta.js';
import { escapeHtml } from '../utils/string.js';
import { setActiveTab, setActiveSettingsPanel } from './tabs.js';

const DEFAULT_BOX_CAPACITY = 81;

export function renderDashboard() {
  const container = document.getElementById('dashboard-summary');
  if (!container) return;

  if (!appState.db) {
    container.innerHTML = '<div class="dashboard-card"><strong>Not loaded</strong><span class="small">Open or create a database to see dashboard metrics.</span></div>';
    return;
  }

  const metrics = [
    ['Active samples', countWhere(`status IS NULL OR status NOT IN ('archived','retired','discarded','consumed','deleted')`)],
    ['Archived samples', countWhere(`status IN ('archived','retired','discarded','consumed')`)],
    ['Deleted samples', countWhere(`LOWER(COALESCE(status, '')) = 'deleted'`)],
    ['Low volume', countWhere(`LOWER(COALESCE(status, '')) = 'low'`)],
    ['Missing storage', countMissingStorage()],
    ['Boxes over capacity', countOverCapacityBoxes()],
    ['Local version', `v${appState.currentVersion || '?'}`],
    ['Last DB update', formatDateTime(getMeta('updated_at', '')) || 'unknown'],
  ];

  container.innerHTML = metrics.map(([label, value]) => `
    <div class="dashboard-card">
      <strong>${escapeHtml(value)}</strong>
      <span class="small">${escapeHtml(label)}</span>
    </div>
  `).join('');
}

export function bindDashboardEvents() {
  document.querySelectorAll('.tab-jump').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.targetTab;
      const settingsTarget = btn.dataset.settingsTarget;

      if (tab) setActiveTab(tab);
      if (settingsTarget) setActiveSettingsPanel(settingsTarget);
    });
  });
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

function countOverCapacityBoxes() {
  return queryAll(`
    SELECT COUNT(*) AS c
    FROM (
      SELECT b.id, COUNT(s.id) AS sample_count, COALESCE(NULLIF(b.capacity, 0), ?) AS capacity
      FROM boxes b
      LEFT JOIN samples s
        ON s.box_id = b.id
       AND (s.status IS NULL OR s.status NOT IN ('archived','retired','discarded','consumed','deleted'))
      GROUP BY b.id, b.capacity
      HAVING sample_count > capacity
    );
  `, [DEFAULT_BOX_CAPACITY])[0]?.c || 0;
}

function formatDateTime(value) {
  if (!value) return '';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString();
}
