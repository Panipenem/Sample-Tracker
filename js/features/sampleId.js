import { appState } from '../state.js';
import { queryAll } from '../db/query.js';

export function bindSampleIdEvents() {
  const btnGenerateId = document.getElementById('btn-generate-id');
  if (!btnGenerateId) return;

  btnGenerateId.addEventListener('click', generateSampleIdFromDate);
}

function generateSampleIdFromDate() {
  if (!appState.db) {
    alert('Database not ready.');
    return;
  }

  const dateInput = document.getElementById('date').value.trim();

  if (!dateInput || dateInput.length !== 8) {
    alert('请先在 Date 中输入 8 位数字日期（YYYYMMDD），例如 20250213。');
    return;
  }

  const rows = queryAll(
    `
    SELECT sample_id
    FROM samples
    WHERE date = ?
    ORDER BY sample_id DESC
    LIMIT 1;
    `,
    [dateInput]
  );

  let nextSeq = 1;

  if (rows.length > 0 && rows[0].sample_id) {
    const m = String(rows[0].sample_id).match(/(\\d{3})$/);
    if (m) {
      nextSeq = parseInt(m[1], 10) + 1;
    }
  }

  const seqStr = String(nextSeq).padStart(3, '0');
  const newId = `${dateInput}-${seqStr}`;

  document.getElementById('sample_id').value = newId;
}