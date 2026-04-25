import { appState } from '../state.js';
import { LAST_DB_KEY, LAST_DB_NAME_KEY } from '../config.js';
import { base64ToUint8, uint8ToBase64 } from '../utils/encoding.js';
import { initSchema } from '../db/schema.js';

export function cacheDbToLocalStorage(binaryArray, dbName = 'sample_db_Master.sqlite') {
  try {
    const base64 = uint8ToBase64(binaryArray);
    localStorage.setItem(LAST_DB_KEY, base64);
    localStorage.setItem(LAST_DB_NAME_KEY, dbName);
    console.log('Cached DB to localStorage:', dbName);
  } catch (e) {
    console.error('Failed to cache DB into localStorage', e);
  }
}

export function updateLocalCacheFromCurrentDb(dbName = 'sample_db_Master.sqlite') {
  if (!appState.db) return;

  try {
    const binaryArray = appState.db.export();
    cacheDbToLocalStorage(binaryArray, dbName);
  } catch (e) {
    console.error('Failed updating localStorage from current DB', e);
  }
}

export function tryAutoLoadLastDb({ refreshAllViews, refreshFreezerMenus } = {}) {
  if (!appState.SQL || appState.db) return;

  const base64 = localStorage.getItem(LAST_DB_KEY);
  if (!base64) return;

  try {
    const u8 = base64ToUint8(base64);
    appState.db = new appState.SQL.Database(u8);

    initSchema();

    if (typeof refreshAllViews === 'function') {
      refreshAllViews();
    }

    appState.dbDirty = false;

    const name = localStorage.getItem(LAST_DB_NAME_KEY) || '(cached DB)';
    const statusEl = document.getElementById('db-status');
    if (statusEl) {
      statusEl.textContent = 'Loaded cached DB: ' + name;
    }

    if (typeof refreshFreezerMenus === 'function') {
      refreshFreezerMenus();
    }

    console.log('Auto-loaded last DB from localStorage:', name);
  } catch (e) {
    console.error('Failed to auto-load DB from localStorage', e);
  }
}