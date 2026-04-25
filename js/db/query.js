// js/db/query.js

import { appState } from '../state.js';

export function queryAll(sql, params = []) {
  if (!appState.db) return [];

  const stmt = appState.db.prepare(sql);
  stmt.bind(params);

  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }

  stmt.free();
  return rows;
}

export function runSql(sql, params = []) {
  if (!appState.db) {
    throw new Error('Database not ready.');
  }

  const stmt = appState.db.prepare(sql);
  stmt.run(params);
  stmt.free();
}

export function beginTransaction() {
  if (!appState.db) throw new Error('Database not ready.');
  appState.db.run('BEGIN TRANSACTION;');
}

export function commitTransaction() {
  if (!appState.db) throw new Error('Database not ready.');
  appState.db.run('COMMIT;');
}

export function rollbackTransaction() {
  if (!appState.db) return;

  try {
    appState.db.run('ROLLBACK;');
  } catch (e) {
    console.warn('Rollback failed:', e);
  }
}