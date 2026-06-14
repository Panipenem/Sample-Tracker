import { appState } from '../state.js';
import {
  R2_API_BASE,
  R2_WRITE_TOKEN_STORAGE_KEY,
  LAST_SYNC_VERSION_KEY,
  MASTER_DB_FILENAME,
} from '../config.js';
import { uint8ToBase64, base64ToUint8 } from '../utils/encoding.js';
import { downloadBlob } from '../utils/download.js';
import { setMeta, getMeta } from '../db/meta.js';
import { initSchema } from '../db/schema.js';
import { updateLocalCacheFromCurrentDb } from './localCache.js';

function getRuntimeWriteToken() {
  let token = localStorage.getItem(R2_WRITE_TOKEN_STORAGE_KEY) || '';
  if (token) return token;

  token = sessionStorage.getItem(R2_WRITE_TOKEN_STORAGE_KEY) || '';
  if (token) {
    localStorage.setItem(R2_WRITE_TOKEN_STORAGE_KEY, token);
    return token;
  }

  token = prompt('Enter R2 write token. It will be remembered in this browser:') || '';
  token = token.trim();

  if (token) {
    localStorage.setItem(R2_WRITE_TOKEN_STORAGE_KEY, token);
  }

  return token;
}

function readMetaFromDatabase(db, key, defaultValue = null) {
  try {
    const stmt = db.prepare('SELECT value FROM meta WHERE key = ?');
    stmt.bind([key]);

    if (stmt.step()) {
      const value = stmt.get()[0];
      stmt.free();
      return value;
    }

    stmt.free();
  } catch (err) {
    console.warn('Could not read remote DB metadata:', err);
  }

  return defaultValue;
}

function readRemoteMetaFromBase64(dbBase64) {
  if (!appState.SQL || !dbBase64) {
    return { version: 0, updatedAt: '' };
  }

  const u8 = base64ToUint8(dbBase64);
  const remoteDb = new appState.SQL.Database(u8);

  try {
    const version = parseInt(readMetaFromDatabase(remoteDb, 'version', '0'), 10);
    const updatedAt = readMetaFromDatabase(remoteDb, 'updated_at', '') || '';

    return {
      version: Number.isFinite(version) ? version : 0,
      updatedAt,
    };
  } finally {
    remoteDb.close();
  }
}

async function fetchRemoteSnapshot() {
  const resp = await fetch(`${R2_API_BASE}/db`, { method: 'GET' });

  if (resp.status === 404) return null;

  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`Load remote DB failed: ${resp.status} ${txt}`);
  }

  const data = await resp.json();
  if (!data || !data.dbBase64) return null;
  const meta = readRemoteMetaFromBase64(data.dbBase64);

  return {
    dbBase64: data.dbBase64,
    version: meta.version,
    updatedAt: meta.updatedAt,
  };
}

function makeTimestamp() {
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');

  return (
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_` +
    `${pad(now.getHours())}${pad(now.getMinutes())}`
  );
}

function downloadPreSyncBackup() {
  const binaryArray = appState.db.export();
  const blob = new Blob([binaryArray], {
    type: 'application/x-sqlite3',
  });

  downloadBlob(blob, `pre_sync_backup_${makeTimestamp()}.sqlite`);
}

function restoreLocalVersion(version, updateVersionBadge) {
  appState.currentVersion = version;
  setMeta('version', version);

  if (typeof updateVersionBadge === 'function') {
    updateVersionBadge();
  }
}

export async function saveDbToR2({ updateVersionBadge } = {}) {
  if (!appState.db) {
    alert('No database loaded.');
    return;
  }

  if (!R2_API_BASE) {
    alert('R2_API_BASE 未配置');
    return;
  }

  let remoteSnapshot = null;

  try {
    remoteSnapshot = await fetchRemoteSnapshot();
  } catch (err) {
    console.error('Remote version check failed:', err);
    alert('Could not check the remote DB version. Sync was cancelled to avoid overwriting newer data.');
    return;
  }

  const remoteVersion = remoteSnapshot?.version || 0;
  const baseVersion = appState.lastSyncedVersion || appState.currentVersion || 0;

  if (remoteVersion > baseVersion) {
    alert(
      `Remote DB is newer (remote v${remoteVersion}, local base v${baseVersion}). ` +
      'Load from R2 or export a local backup before syncing.'
    );
    return;
  }

  const writeToken = getRuntimeWriteToken();
  if (!writeToken) {
    alert('R2 write token is required to sync.');
    return;
  }

  downloadPreSyncBackup();

  const previousVersion = appState.currentVersion || 0;
  appState.currentVersion = previousVersion + 1;
  setMeta('version', appState.currentVersion);
  setMeta('updated_at', new Date().toISOString());

  if (typeof updateVersionBadge === 'function') {
    updateVersionBadge();
  }

  const binaryArray = appState.db.export();
  const base64 = uint8ToBase64(binaryArray);

  try {
    const resp = await fetch(`${R2_API_BASE}/db`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-LIMS-TOKEN': writeToken,
      },
      body: JSON.stringify({
        dbName: MASTER_DB_FILENAME,
        dbBase64: base64,
      }),
    });

    if (!resp.ok) {
      const txt = await resp.text();
      console.error('R2 save failed', resp.status, txt);
      alert('Sync to R2 failed: ' + resp.status);
      restoreLocalVersion(previousVersion, updateVersionBadge);
      return;
    }

    appState.dbDirty = false;
    appState.lastSyncedVersion = appState.currentVersion;
    appState.remoteVersion = appState.currentVersion;
    appState.remoteUpdatedAt = getMeta('updated_at', '');
    appState.lastR2CheckedAt = new Date().toLocaleString();
    appState.lastR2Status = 'Synced to R2.';
    localStorage.setItem(
      LAST_SYNC_VERSION_KEY,
      String(appState.lastSyncedVersion)
    );

    updateLocalCacheFromCurrentDb(MASTER_DB_FILENAME);

    const statusEl = document.getElementById('db-status');
    if (statusEl) {
      statusEl.textContent = `Synced to R2 (v${appState.currentVersion})`;
    }

    console.log('Synced to R2, version', appState.currentVersion);
  } catch (err) {
    console.error('Error saving DB to R2:', err);
    alert('Error saving DB to R2, see console.');
    restoreLocalVersion(previousVersion, updateVersionBadge);
  }
}

export async function checkR2Status({ updateVersionBadge } = {}) {
  if (!R2_API_BASE) {
    alert('R2_API_BASE 未配置');
    return;
  }

  if (!appState.SQL) {
    alert('sql.js not ready yet.');
    return;
  }

  const statusEl = document.getElementById('db-status');
  if (statusEl) {
    statusEl.textContent = 'Checking R2 status...';
  }

  try {
    const remoteSnapshot = await fetchRemoteSnapshot();
    const localVersion = appState.currentVersion || 0;
    const remoteVersion = remoteSnapshot?.version || 0;
    const updatedAt = remoteSnapshot?.updatedAt || 'unknown time';
    appState.remoteVersion = remoteSnapshot ? remoteVersion : null;
    appState.remoteUpdatedAt = remoteSnapshot ? updatedAt : '';
    appState.lastR2CheckedAt = new Date().toLocaleString();

    if (!remoteSnapshot) {
      appState.lastR2Status = 'R2 has no database yet.';
      if (statusEl) {
        statusEl.textContent = `R2 has no database yet. Local version: v${localVersion}.`;
      }
      if (typeof updateVersionBadge === 'function') {
        updateVersionBadge();
      }
      return;
    }

    const relation = remoteVersion > localVersion
      ? 'Remote is newer than local'
      : remoteVersion < localVersion
        ? 'Local is newer than remote'
        : 'Local and remote versions match';
    appState.lastR2Status = relation;

    if (statusEl) {
      statusEl.textContent =
        `${relation}. Local v${localVersion}, remote v${remoteVersion}, remote updated ${updatedAt}.`;
    }

    if (typeof updateVersionBadge === 'function') {
      updateVersionBadge();
    }
  } catch (err) {
    console.error('R2 status check failed:', err);
    appState.lastR2Status = 'R2 status check failed.';
    appState.lastR2CheckedAt = new Date().toLocaleString();
    if (typeof updateVersionBadge === 'function') {
      updateVersionBadge();
    }
    if (statusEl) {
      statusEl.textContent = 'R2 status check failed. See console for details.';
    }
    alert('R2 status check failed, see console.');
  }
}

export async function loadDbFromR2({
  refreshAllViews,
  refreshFreezerMenus,
  updateVersionBadge,
} = {}) {
  if (!R2_API_BASE) {
    alert('R2_API_BASE 未配置');
    return;
  }

  if (!appState.SQL) {
    alert('sql.js not ready yet.');
    return;
  }

  if (appState.dbDirty) {
    const ok = confirm(
      'There are unsaved local changes. Loading from R2 will overwrite the current DB. Continue?'
    );
    if (!ok) return;
  }

  try {
    const resp = await fetch(`${R2_API_BASE}/db`, { method: 'GET' });

    if (!resp.ok) {
      const txt = await resp.text();
      console.error('R2 load failed', resp.status, txt);

      if (resp.status === 404) {
        alert(
          'No database found in R2 yet, or the Worker does not handle /db. Try Sync → R2 first, then Load ← R2.'
        );
      } else {
        alert('Load from R2 failed: ' + resp.status);
      }

      return;
    }

    const data = await resp.json();

    if (!data || !data.dbBase64) {
      alert('R2 DB is empty or invalid.');
      return;
    }

    const u8 = base64ToUint8(data.dbBase64);
    appState.db = new appState.SQL.Database(u8);
    appState.dbDirty = false;

    initSchema();

    const vStr = getMeta('version', '1');
    appState.currentVersion = parseInt(vStr, 10) || 1;
    appState.lastSyncedVersion = appState.currentVersion;
    appState.remoteVersion = appState.currentVersion;
    appState.remoteUpdatedAt = getMeta('updated_at', '');
    appState.lastR2CheckedAt = new Date().toLocaleString();
    appState.lastR2Status = 'Loaded DB from R2.';

    localStorage.setItem(
      LAST_SYNC_VERSION_KEY,
      String(appState.lastSyncedVersion)
    );

    if (typeof refreshAllViews === 'function') {
      refreshAllViews();
    }

    if (typeof refreshFreezerMenus === 'function') {
      refreshFreezerMenus();
    }

    if (typeof updateVersionBadge === 'function') {
      updateVersionBadge();
    }

    updateLocalCacheFromCurrentDb(MASTER_DB_FILENAME);

    const statusEl = document.getElementById('db-status');
    if (statusEl) {
      statusEl.textContent = `Loaded DB from R2 (v${appState.currentVersion})`;
    }
  } catch (err) {
    console.error('Error loading DB from R2:', err);
    alert('Error loading DB from R2, see console.');
  }
}
