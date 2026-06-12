import { appState } from '../state.js';
import { queryAll } from './query.js';

export function getOrCreateBoxId({
  storage_temperature = '',
  freezer_no = '',
  rack = '',
  box_label = '',
} = {}) {
  if (!appState.db) {
    throw new Error('Database not ready.');
  }

  const normalized = {
    storage_temperature: storage_temperature || '',
    freezer_no: freezer_no || '',
    rack: rack || '',
    box_label: box_label || '',
  };

  const hasAnyStorage =
    normalized.storage_temperature ||
    normalized.freezer_no ||
    normalized.rack ||
    normalized.box_label;

  if (!hasAnyStorage) return null;

  const existing = queryAll(
    `SELECT id FROM boxes
     WHERE storage_temperature = ?
       AND freezer_no = ?
       AND rack = ?
       AND box_label = ?
     LIMIT 1`,
    [
      normalized.storage_temperature,
      normalized.freezer_no,
      normalized.rack,
      normalized.box_label,
    ]
  );

  if (existing.length > 0) {
    return existing[0].id;
  }

  const stmt = appState.db.prepare(`
    INSERT INTO boxes (storage_temperature, freezer_no, rack, box_label)
    VALUES (?, ?, ?, ?);
  `);

  try {
    stmt.run([
      normalized.storage_temperature,
      normalized.freezer_no,
      normalized.rack,
      normalized.box_label,
    ]);
  } finally {
    stmt.free();
  }

  return queryAll('SELECT last_insert_rowid() AS id;')[0].id;
}
