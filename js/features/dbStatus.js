import { appState } from '../state.js';
import { LAST_DB_NAME_KEY } from '../config.js';

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
  if (!el) return;

  const v = appState.currentVersion || '?';
  const last = appState.lastSyncedVersion || 0;
  const syncedMark =
    last === v && !appState.dbDirty ? 'synced' : 'local changes';

  el.textContent = `DB v${v} · ${syncedMark}`;
}

export function makeDbDirty() {
  appState.dbDirty = true;
  updateVersionBadge();
}