import { appState } from '../state.js';

export function recordSampleEvent({
  sampleRowId = null,
  sampleId = '',
  action,
  details = null,
} = {}) {
  if (!appState.db || !action) return;

  const stmt = appState.db.prepare(`
    INSERT INTO sample_events (sample_row_id, sample_id, action, details_json)
    VALUES (?, ?, ?, ?);
  `);

  try {
    stmt.run([
      sampleRowId,
      sampleId || null,
      action,
      details ? JSON.stringify(details) : null,
    ]);
  } finally {
    stmt.free();
  }
}
