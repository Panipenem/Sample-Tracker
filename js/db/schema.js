import { appState } from '../state.js';
import { LAST_SYNC_VERSION_KEY } from '../config.js';
import { getMeta, setMeta } from './meta.js';


export function initSchema() {
    if (!appState.db) return;
    appState.db.run(`
      CREATE TABLE IF NOT EXISTS boxes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        storage_temperature TEXT NOT NULL,
        freezer_no TEXT NOT NULL,
        rack TEXT NOT NULL,
        box_label TEXT NOT NULL,
        UNIQUE(storage_temperature, freezer_no, rack, box_label)
      );
    `);

      // 兼容旧数据库：若原来没有 capacity 列，则尝试添加
    try {
        appState.db.run(`ALTER TABLE boxes ADD COLUMN capacity INTEGER;`);
    } catch (e) {
        // 已经有该列时会报错，忽略即可
    }

    appState.db.run(`
      CREATE TABLE IF NOT EXISTS samples (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sample_id TEXT NOT NULL UNIQUE,
        date TEXT,
        experiment_label TEXT,
        species_genotype TEXT,
        model TEXT,
        tissue TEXT,
        sample_type TEXT,
        notes TEXT,
        processing TEXT,
        parent_sample_id TEXT,
        amount TEXT,
        project TEXT,
        status TEXT,
        box_id INTEGER,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (box_id) REFERENCES boxes(id)
      );
    `);

    try {
        appState.db.run(`ALTER TABLE samples ADD COLUMN deleted_at TEXT;`);
    } catch (e) {
        // 已经有该列时会报错，忽略即可
    }

    appState.db.run(`
      CREATE TABLE IF NOT EXISTS meta (
        key   TEXT PRIMARY KEY,
        value TEXT
      );
    `);

    appState.db.run(`
      CREATE TABLE IF NOT EXISTS sample_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sample_row_id INTEGER,
        sample_id TEXT,
        action TEXT NOT NULL,
        details_json TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (sample_row_id) REFERENCES samples(id)
      );
    `);

    appState.db.run(`
      CREATE INDEX IF NOT EXISTS idx_samples_date
      ON samples(date);
    `);

    appState.db.run(`
      CREATE INDEX IF NOT EXISTS idx_samples_status
      ON samples(status);
    `);

    appState.db.run(`
      CREATE INDEX IF NOT EXISTS idx_samples_deleted_at
      ON samples(deleted_at);
    `);

    appState.db.run(`
      CREATE INDEX IF NOT EXISTS idx_samples_box_id
      ON samples(box_id);
    `);

    appState.db.run(`
      CREATE INDEX IF NOT EXISTS idx_samples_project
      ON samples(project);
    `);

    appState.db.run(`
      CREATE INDEX IF NOT EXISTS idx_boxes_location
      ON boxes(storage_temperature, freezer_no, rack, box_label);
    `);

    appState.db.run(`
      CREATE INDEX IF NOT EXISTS idx_sample_events_sample_row_id
      ON sample_events(sample_row_id);
    `);

    appState.db.run(`
      CREATE INDEX IF NOT EXISTS idx_sample_events_action
      ON sample_events(action);
    `);

    // 初始化版本信息
    let v = parseInt(getMeta('version', '0'), 10);
    if (Number.isNaN(v) || v < 1) {
      v = 1;
      setMeta('version', v);
      setMeta('updated_at', new Date().toISOString());
    }
    appState.currentVersion = v;

    // 从 localStorage 恢复最后一次同步的版本（可选）
    const ls = localStorage.getItem('LIMS_LAST_SYNC_VERSION');
    if (ls) {
      appState.lastSyncedVersion = parseInt(ls, 10) || 0;
    } else {
      appState.lastSyncedVersion = 0;
    }

    updateVersionBadgeSafe();
}

function updateVersionBadgeSafe() {
  if (typeof window.updateVersionBadge === 'function') {
    window.updateVersionBadge();
  }
}
