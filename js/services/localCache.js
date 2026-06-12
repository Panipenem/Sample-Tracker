import { appState } from '../state.js';
import { LAST_DB_KEY, LAST_DB_NAME_KEY } from '../config.js';
import { base64ToUint8, uint8ToBase64 } from '../utils/encoding.js';
import { initSchema } from '../db/schema.js';

const IDB_NAME = 'sampleApp.localDbCache';
const IDB_STORE = 'cache';
const IDB_VERSION = 1;
const IDB_DB_KEY = 'lastDb';

function openCacheDb() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      reject(new Error('IndexedDB is not available.'));
      return;
    }

    const req = window.indexedDB.open(IDB_NAME, IDB_VERSION);

    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE, { keyPath: 'key' });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Failed to open IndexedDB.'));
  });
}

async function putCachedDb(binaryArray, dbName) {
  const db = await openCacheDb();

  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      const store = tx.objectStore(IDB_STORE);

      store.put({
        key: IDB_DB_KEY,
        bytes: binaryArray,
        dbName,
        updatedAt: new Date().toISOString(),
      });

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('IndexedDB write failed.'));
      tx.onabort = () => reject(tx.error || new Error('IndexedDB write aborted.'));
    });
  } finally {
    db.close();
  }
}

async function getCachedDb() {
  const db = await openCacheDb();

  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const store = tx.objectStore(IDB_STORE);
      const req = store.get(IDB_DB_KEY);

      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error || new Error('IndexedDB read failed.'));
    });
  } finally {
    db.close();
  }
}

function cacheDbToLegacyLocalStorage(binaryArray, dbName) {
  try {
    const base64 = uint8ToBase64(binaryArray);
    localStorage.setItem(LAST_DB_KEY, base64);
    localStorage.setItem(LAST_DB_NAME_KEY, dbName);
    console.log('Cached DB to localStorage fallback:', dbName);
  } catch (e) {
    console.error('Failed to cache DB into localStorage', e);
  }
}

export async function cacheDbToLocalStorage(binaryArray, dbName = 'sample_db_Master.sqlite') {
  try {
    await putCachedDb(binaryArray, dbName);
    localStorage.setItem(LAST_DB_NAME_KEY, dbName);
    console.log('Cached DB to IndexedDB:', dbName);
  } catch (e) {
    console.warn('IndexedDB cache failed; falling back to localStorage.', e);
    cacheDbToLegacyLocalStorage(binaryArray, dbName);
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

export async function tryAutoLoadLastDb({ refreshAllViews, refreshFreezerMenus } = {}) {
  if (!appState.SQL || appState.db) return;

  try {
    let cached = null;
    let source = 'IndexedDB';

    try {
      cached = await getCachedDb();
    } catch (e) {
      console.warn('Could not read IndexedDB cache; checking localStorage.', e);
    }

    if (!cached) {
      const base64 = localStorage.getItem(LAST_DB_KEY);
      if (!base64) return;

      cached = {
        bytes: base64ToUint8(base64),
        dbName: localStorage.getItem(LAST_DB_NAME_KEY) || '(cached DB)',
      };
      source = 'localStorage';
    }

    const u8 = cached.bytes instanceof Uint8Array
      ? cached.bytes
      : new Uint8Array(cached.bytes);

    appState.db = new appState.SQL.Database(u8);

    initSchema();

    if (typeof refreshAllViews === 'function') {
      refreshAllViews();
    }

    appState.dbDirty = false;

    const name = cached.dbName || '(cached DB)';
    const statusEl = document.getElementById('db-status');
    if (statusEl) {
      statusEl.textContent = 'Loaded cached DB: ' + name;
    }

    localStorage.setItem(LAST_DB_NAME_KEY, name);

    if (typeof refreshFreezerMenus === 'function') {
      refreshFreezerMenus();
    }

    if (source === 'localStorage') {
      cacheDbToLocalStorage(u8, name);
    }

    console.log(`Auto-loaded last DB from ${source}:`, name);
  } catch (e) {
    console.error('Failed to auto-load cached DB', e);
  }
}
