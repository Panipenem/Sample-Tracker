import { appState } from '../state.js';
import { queryAll } from './query.js';

export function getMeta(key, defaultValue = null) {
    try {
        const stmt = appState.db.prepare('SELECT value FROM meta WHERE key = ?');
        stmt.bind([key]);
        if (stmt.step()) {
        const v = stmt.get()[0];
        stmt.free();
        return v;
        }
        stmt.free();
    } catch (e) {
        console.error('getMeta error', e);
    }
    return defaultValue;
}

export function setMeta(key, value) {
    try {
      const stmt = appState.db.prepare(`
        INSERT INTO meta (key, value)
        VALUES (?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
      `);
      stmt.bind([key, String(value)]);
      stmt.step();
      stmt.free();
    } catch (e) {
      console.error('setMeta error', e);
    }
}