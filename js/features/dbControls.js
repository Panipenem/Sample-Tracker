import { appState } from '../state.js';
import { MASTER_DB_FILENAME, LAST_DB_NAME_KEY } from '../config.js';
import { initSchema } from '../db/schema.js';
import { cacheDbToLocalStorage } from '../services/localCache.js';
import { saveDbToR2, loadDbFromR2 } from '../services/r2Service.js';
import { downloadBlob } from '../utils/download.js';

export function bindDbControlEvents({
  refreshAllViews,
  refreshFreezerMenus,
  updateVersionBadge,
} = {}) {
  bindNewDbButton({
    refreshAllViews,
    refreshFreezerMenus,
  });

  bindLoadFileInput({
    refreshAllViews,
    refreshFreezerMenus,
    updateVersionBadge,
  });

  bindExportDbButton();

  bindBackupDbButton();

  bindR2Buttons({
    refreshAllViews,
    refreshFreezerMenus,
    updateVersionBadge,
  });
}

function bindNewDbButton({ refreshAllViews, refreshFreezerMenus } = {}) {
  const btn = document.getElementById('btn-new-db');
  if (!btn) return;

  btn.addEventListener('click', () => {
    if (!appState.SQL) {
      alert('sql.js not ready yet.');
      return;
    }

    appState.db = new appState.SQL.Database();
    appState.dbDirty = false;

    initSchema();

    if (typeof refreshAllViews === 'function') {
      refreshAllViews();
    }

    if (typeof refreshFreezerMenus === 'function') {
      refreshFreezerMenus();
    }

    const statusEl = document.getElementById('db-status');
    if (statusEl) {
      statusEl.textContent = 'New empty in-memory DB.';
    }
  });
}

function bindLoadFileInput({
  refreshAllViews,
  refreshFreezerMenus,
  updateVersionBadge,
} = {}) {
  const input = document.getElementById('file-input');
  if (!input) return;

  input.addEventListener('change', async ev => {
    const file = ev.target.files[0];
    if (!file || !appState.SQL) return;

    const arrayBuffer = await file.arrayBuffer();
    const u8 = new Uint8Array(arrayBuffer);

    appState.db = new appState.SQL.Database(u8);
    appState.dbDirty = false;

    initSchema();

    if (typeof refreshAllViews === 'function') {
      refreshAllViews();
    }

    if (typeof updateVersionBadge === 'function') {
      updateVersionBadge();
    }

    if (typeof refreshFreezerMenus === 'function') {
      refreshFreezerMenus();
    }

    cacheDbToLocalStorage(u8, file.name || 'db.sqlite');
  });
}

function bindExportDbButton() {
  const btn = document.getElementById('btn-export-db');
  if (!btn) return;

  btn.addEventListener('click', () => {
    if (!appState.db) {
      alert('No database loaded.');
      return;
    }

    const binaryArray = appState.db.export();
    const blob = new Blob([binaryArray], {
      type: 'application/x-sqlite3',
    });

    const filename = MASTER_DB_FILENAME;

    downloadBlob(blob, filename);
    appState.dbDirty = false;

    const oldName = localStorage.getItem(LAST_DB_NAME_KEY);
    cacheDbToLocalStorage(binaryArray, oldName || filename);
  });
}

function backupDbNow() {
  if (!appState.db) {
    alert('No database loaded.');
    return;
  }

  try {
    const binaryArray = appState.db.export();
    const blob = new Blob([binaryArray], {
      type: 'application/x-sqlite3',
    });

    const now = new Date();
    const pad = n => (n < 10 ? '0' + n : '' + n);
    const ts =
      `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_` +
      `${pad(now.getHours())}${pad(now.getMinutes())}`;

    downloadBlob(blob, `backup_${ts}.sqlite`);

    console.log('Manual backup created:', `backup_${ts}.sqlite`);
  } catch (e) {
    console.error('Backup failed:', e);
    alert('Backup failed, please check console for details.');
  }
}

function bindBackupDbButton() {
  const btn = document.getElementById('btn-backup-db');
  if (!btn) return;

  btn.addEventListener('click', () => {
    backupDbNow();
  });
}

function bindR2Buttons({
  refreshAllViews,
  refreshFreezerMenus,
  updateVersionBadge,
} = {}) {
  const btnSaveR2 = document.getElementById('btn-save-r2');
  if (btnSaveR2) {
    btnSaveR2.addEventListener('click', () => {
      saveDbToR2({
        updateVersionBadge,
      });
    });
  }

  const btnLoadR2 = document.getElementById('btn-load-r2');
  if (btnLoadR2) {
    btnLoadR2.addEventListener('click', () => {
      loadDbFromR2({
        refreshAllViews,
        refreshFreezerMenus,
        updateVersionBadge,
      });
    });
  }
}