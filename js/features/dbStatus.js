import { appState } from '../state.js';
import { LAST_DB_NAME_KEY } from '../config.js';
import { escapeHtml } from '../utils/string.js';

export function refreshDbStatus() {
  const statusEl = document.getElementById('db-status-line');
  const badgeEl = document.getElementById('version-badge');

  if (!statusEl || !badgeEl) return;

  const name = localStorage.getItem(LAST_DB_NAME_KEY) || '(no name)';
  statusEl.textContent = `Loaded DB: ${name}`;

  const v = appState.currentVersion || '?';
  const synced =
    appState.lastSyncedVersion === appState.currentVersion &&
    !appState.dbDirty;

  badgeEl.textContent = `DB v${v} • ${synced ? 'synced' : 'local changes'}`;
}

export function updateVersionBadge() {
  const el = document.getElementById('db-version');

  const v = appState.currentVersion || '?';
  const last = appState.lastSyncedVersion || 0;
  const syncedMark =
    last === v && !appState.dbDirty ? 'synced' : 'local changes';

  if (el) {
    el.textContent = `DB v${v} · ${syncedMark}`;
  }

  renderSyncStatusPanel();
}

export function makeDbDirty() {
  appState.dbDirty = true;
  updateVersionBadge();
}

export function renderSyncStatusPanel() {
  const panel = document.getElementById('sync-status-panel');
  if (!panel) return;

  const localVersion = appState.currentVersion || '?';
  const lastSynced = appState.lastSyncedVersion || 0;
  const remoteVersion = appState.remoteVersion === null
    ? 'not checked'
    : `v${appState.remoteVersion}`;
  const remoteUpdatedAt = appState.remoteUpdatedAt || 'unknown';
  const checkedAt = appState.lastR2CheckedAt || 'not checked';
  const localState = appState.dbDirty
    ? 'local changes'
    : lastSynced === appState.currentVersion
      ? 'synced'
      : 'not synced';

  panel.innerHTML = `
    <div class="sync-pill"><strong>Local</strong><span>v${escapeHtml(localVersion)} · ${escapeHtml(localState)}</span></div>
    <div class="sync-pill"><strong>Remote</strong><span>${escapeHtml(remoteVersion)}</span></div>
    <div class="sync-pill"><strong>Remote updated</strong><span>${escapeHtml(remoteUpdatedAt)}</span></div>
    <div class="sync-pill"><strong>Checked</strong><span>${escapeHtml(checkedAt)}</span></div>
    <div class="sync-pill sync-note"><strong>Status</strong><span>${escapeHtml(appState.lastR2Status || 'Click Check R2 status to compare local and remote DB.')}</span></div>
  `;
}
