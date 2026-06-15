import { appState } from '../state.js';
import { queryAll, runSql, withTransaction } from '../db/query.js';
import { getOrCreateBoxId } from '../db/boxes.js';
import { recordSampleEvent } from '../db/audit.js';
import { cellToString, parseSeqFromSampleId } from '../utils/string.js';
import { isValidYmdDate, normalizeSampleStatus, VALID_SAMPLE_STATUSES } from '../utils/validation.js';

export function bindImportExportEvents({ refreshAllViews, makeDbDirty } = {}) {
  bindExportSamplesXlsx();
  bindExportLabelsXlsx();
  bindImportSamples({ refreshAllViews, makeDbDirty });
  bindImportScanEvents({ refreshAllViews, makeDbDirty });
}

function bindExportSamplesXlsx() {
  const btn = document.getElementById('btn-export-xlsx');
  if (!btn) return;

  btn.addEventListener('click', () => {
    if (!appState.db) {
      alert('No database loaded.');
      return;
    }

    const rows = queryAll(`
      SELECT s.sample_id, s.date, s.experiment_label, s.species_genotype, s.model, s.tissue, s.sample_type,
             s.notes, s.processing, s.parent_sample_id, s.amount,
             s.project, s.status,
             b.storage_temperature, b.freezer_no, b.rack, b.box_label
      FROM samples s
      LEFT JOIN boxes b ON s.box_id = b.id
      ORDER BY s.date ASC, s.sample_id ASC;
    `);

    const data = rows.map(r => ({
      sample_id: r.sample_id || '',
      date: r.date || '',
      experiment_label: r.experiment_label || '',
      species_genotype: r.species_genotype || '',
      model: r.model || '',
      tissue: r.tissue || '',
      sample_type: r.sample_type || '',
      notes: r.notes || '',
      processing: r.processing || '',
      parent_sample_id: r.parent_sample_id || '',
      amount: r.amount || '',
      project: r.project || '',
      status: r.status || '',
      storage_temperature: r.storage_temperature || '',
      freezer_no: r.freezer_no || '',
      rack: r.rack || '',
      box_label: r.box_label || '',
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'samples');

    const ts = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    XLSX.writeFile(wb, `samples_${ts}.xlsx`);
  });
}

function bindExportLabelsXlsx() {
  const btn = document.getElementById('btn-export-labels-xlsx');
  if (!btn) return;

  btn.addEventListener('click', () => {
    if (!appState.db) {
      alert('No database loaded.');
      return;
    }

    const selectedChecks = Array.from(document.querySelectorAll('.sample-select:checked'));
    let rows = [];

    if (selectedChecks.length > 0) {
      const ids = selectedChecks.map(cb => parseInt(cb.getAttribute('data-id'), 10));
      const placeholders = ids.map(() => '?').join(',');

      rows = queryAll(`
        SELECT sample_id, date, experiment_label, species_genotype, model, tissue,
               sample_type, processing, amount, status, notes
        FROM samples
        WHERE id IN (${placeholders})
          AND (status IS NULL OR status NOT IN ('retired','deleted'))
        ORDER BY date ASC, sample_id ASC;
      `, ids);

      if (!rows || rows.length === 0) {
        alert('选中的样本中没有可导出的记录（可能已标记为 retired）。');
        return;
      }
    } else {
      let labelDate = document.getElementById('label-export-date').value.trim();

      if (!labelDate) {
        const formDate = document.getElementById('date').value.trim();
        if (formDate && formDate.length === 8) {
          labelDate = formDate;
          document.getElementById('label-export-date').value = formDate;
        }
      }

      if (!labelDate || labelDate.length !== 8) {
        alert('请在 "Label date" 中输入 8 位日期（YYYYMMDD），例如 20250213；\n或者先在 Sample List 中勾选要导出的样本。');
        return;
      }

      rows = queryAll(`
        SELECT sample_id, date, experiment_label, species_genotype, model, tissue,
               sample_type, processing, amount, status, notes
        FROM samples
        WHERE date = ?
          AND (status IS NULL OR status NOT IN ('retired','deleted'))
        ORDER BY sample_id ASC;
      `, [labelDate]);

      if (!rows || rows.length === 0) {
        alert(`该日期下（${labelDate}）没有可导出的样本。`);
        return;
      }
    }

    const data = rows.map(r => {
      const sample_id = r.sample_id || '';
      const date = r.date || '';
      const species_genotype = r.species_genotype || '';
      const group = r.model || '';
      const tissue = r.tissue || '';
      const sample_type = (r.sample_type || '').trim();
      const processing = (r.processing || '').trim();
      const amount = r.amount || '';
      const experiment_label = r.experiment_label || '';
      const notes = r.notes || ''

      const lowerType = sample_type.toLowerCase();
      const primaryTypes = ['tissue', 'serum', 'plasma', 'pbmc', 'whole blood'];

      let tailParts;

      if (!tissue && !sample_type && !processing) {
        tailParts = [];
      } else if (sample_type && !primaryTypes.includes(lowerType)) {
        tailParts = [tissue, sample_type, processing].filter(Boolean);
      } else {
        tailParts = [tissue, processing].filter(Boolean);
      }

      const combined = tailParts.join('.');

      return {
        sample_id,
        date,
        species_genotype,
        group,
        experiment_label,
        tissue_sampletype_processing: combined,
        amount,
        notes,
      };
    });

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'labels');

    let fileSuffix = '';
    const labelDateVal = document.getElementById('label-export-date').value.trim();

    if (selectedChecks.length === 0 && labelDateVal && labelDateVal.length === 8) {
      fileSuffix = labelDateVal;
    } else {
      fileSuffix = Date.now();
    }

    XLSX.writeFile(wb, `labels_${fileSuffix}.xlsx`);
  });
}

function bindImportSamples({ refreshAllViews, makeDbDirty } = {}) {
  const btn = document.getElementById('btn-import-samples');
  if (!btn) return;

  btn.addEventListener('click', () => {
    if (!appState.db) {
      alert('Database not ready.');
      return;
    }

    const fileInput = document.getElementById('import-file');
    const file = fileInput?.files?.[0];

    if (!file) {
      alert('请先选择一个 .xlsx 文件。');
      return;
    }

    const reader = new FileReader();

    reader.onload = function (e) {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

      if (!rows || rows.length === 0) {
        alert('表格中没有数据。');
        return;
      }

      const precheck = buildImportPrecheck(rows);
      if (!confirm(formatImportPrecheck(precheck))) {
        return;
      }

      let imported = 0;
      let skippedNoId = 0;
      let skippedDuplicate = 0;
      let skippedInvalidDate = 0;
      let normalizedStatus = 0;
      let otherErrors = 0;
      let missingTemp = 0;
      let missingFreezer = 0;
      let missingRack = 0;
      let missingBoxLabel = 0;

      const nextSeqByDate = {};

      try {
        withTransaction(() => {
          rows.forEach(r => {
            let sample_id = cellToString(r.sample_id);
            const date = cellToString(r.date);

            if (date && !isValidYmdDate(date)) {
              skippedInvalidDate++;
              return;
            }

            if (!sample_id) {
              if (!date || date.length !== 8) {
                skippedNoId++;
                return;
              }

              if (nextSeqByDate[date] === undefined) {
                const existing = queryAll(
                  `SELECT sample_id
                   FROM samples
                   WHERE date = ?
                   ORDER BY sample_id DESC
                   LIMIT 1;`,
                  [date]
                );

                let baseSeq = 0;
                if (existing.length > 0 && existing[0].sample_id) {
                  baseSeq = parseSeqFromSampleId(existing[0].sample_id);
                }
                nextSeqByDate[date] = baseSeq + 1;
              }

              const seq = nextSeqByDate[date];
              const seqStr = String(seq).padStart(3, '0');
              sample_id = `${date}-${seqStr}`;
              nextSeqByDate[date] = seq + 1;
            }

            const experiment_label = cellToString(r.experiment_label);
            const species_genotype = cellToString(r.species_genotype);
            const model = cellToString(r.model);
            const tissue = cellToString(r.tissue);
            const sample_type = cellToString(r.sample_type);
            const notes = cellToString(r.notes);
            const processing = cellToString(r.processing);
            const parent_sample_id = cellToString(r.parent_sample_id);
            const amount = cellToString(r.amount);
            const project = cellToString(r.project);
            const rawStatus = cellToString(r.status);
            const status = normalizeSampleStatus(rawStatus, 'available');
            if (rawStatus && !VALID_SAMPLE_STATUSES.has(rawStatus.toLowerCase())) {
              normalizedStatus++;
            }

            const storage_temperature = cellToString(r.storage_temperature);
            const freezer_no = cellToString(r.freezer_no);
            const rack = cellToString(r.rack);
            const box_label = cellToString(r.box_label);

            const hasAnyStorage =
              storage_temperature || freezer_no || rack || box_label;

            if (hasAnyStorage) {
              if (!storage_temperature) missingTemp++;
              if (!freezer_no) missingFreezer++;
              if (!rack) missingRack++;
              if (!box_label) missingBoxLabel++;
            }

            const boxId = box_label
              ? getOrCreateBoxId({
                  storage_temperature,
                  freezer_no,
                  rack,
                  box_label,
                })
              : null;

            let insertStmt = null;

            try {
              insertStmt = appState.db.prepare(`
                INSERT INTO samples
                  (sample_id, date, experiment_label, species_genotype, model, tissue, sample_type, notes,
                   processing, parent_sample_id, amount, project, status, box_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
              `);

              insertStmt.run([
                sample_id || null,
                date || null,
                experiment_label || null,
                species_genotype || null,
                model || null,
                tissue || null,
                sample_type || null,
                notes || null,
                processing || null,
                parent_sample_id || null,
                amount || null,
                project || null,
                status || null,
                boxId,
              ]);

              const row = queryAll('SELECT last_insert_rowid() AS id;')[0];
              recordSampleEvent({
                sampleRowId: row?.id || null,
                sampleId: sample_id,
                action: 'import',
                details: { source: 'xlsx_import' },
              });

              imported++;
            } catch (err) {
              const msg = String(err);
              if (msg.includes('UNIQUE constraint failed: samples.sample_id')) {
                skippedDuplicate++;
              } else {
                console.error('Error inserting row', sample_id, err);
                otherErrors++;
              }
            } finally {
              if (insertStmt) insertStmt.free();
            }
          });
        });
      } catch (e2) {
        console.error('Import failed, rolling back.', e2);
        alert('导入过程中出现错误，已回滚。请检查控制台错误信息。');
        return;
      }

      if (typeof refreshAllViews === 'function') {
        refreshAllViews();
      }

      if (imported > 0 && typeof makeDbDirty === 'function') {
        makeDbDirty();
      }

      let summary = `导入完成：\n成功导入 ${imported} 条样本。`;
      if (skippedNoId > 0) {
        summary += `\n跳过 ${skippedNoId} 行（sample_id 为空且 date 不合法，无法自动生成）。`;
      }
      if (skippedDuplicate > 0) {
        summary += `\n跳过 ${skippedDuplicate} 行（sample_id 已存在）。`;
      }
      if (skippedInvalidDate > 0) {
        summary += `\n跳过 ${skippedInvalidDate} 行（date 不是合法 YYYYMMDD）。`;
      }
      if (normalizedStatus > 0) {
        summary += `\n有 ${normalizedStatus} 行 status 不合法，已按 available 导入。`;
      }
      if (otherErrors > 0) {
        summary += `\n有 ${otherErrors} 行插入失败（其他错误，详见控制台）。`;
      }

      if (missingTemp > 0 || missingFreezer > 0 || missingRack > 0 || missingBoxLabel > 0) {
        summary += `\n\n存储信息缺失统计（仅对填写过任一 storage 字段的行）：`;
        if (missingTemp > 0) summary += `\n- 缺少 storage_temperature 的行数：${missingTemp}`;
        if (missingFreezer > 0) summary += `\n- 缺少 freezer_no 的行数：${missingFreezer}`;
        if (missingRack > 0) summary += `\n- 缺少 rack 的行数：${missingRack}`;
        if (missingBoxLabel > 0) summary += `\n- 缺少 box_label 的行数：${missingBoxLabel}`;
      }

      alert(summary);
    };

    reader.readAsArrayBuffer(file);
  });
}

function bindImportScanEvents({ refreshAllViews, makeDbDirty } = {}) {
  const btn = document.getElementById('btn-import-scan-events');
  if (!btn) return;

  btn.addEventListener('click', () => {
    if (!appState.db) {
      alert('Database not ready.');
      return;
    }

    const fileInput = document.getElementById('scan-events-file');
    const file = fileInput?.files?.[0];
    if (!file) {
      alert('请先选择 LIMS Scanner App 导出的 scan_events.json 文件。');
      return;
    }

    const reader = new FileReader();
    reader.onload = event => {
      let payload;
      try {
        payload = JSON.parse(String(event.target.result || ''));
      } catch (err) {
        alert('JSON 解析失败，请确认文件是 scan_events.json。');
        return;
      }

      const events = normalizeScanEventsPayload(payload);
      if (events.length === 0) {
        alert('没有找到可导入的 scan events。');
        return;
      }

      const precheck = buildScanEventsPrecheck(events);
      if (!confirm(formatScanEventsPrecheck(precheck))) return;

      let applied = 0;
      let skippedMissingSample = 0;
      let skippedInvalid = 0;
      let otherErrors = 0;

      try {
        ensureScanEventImportSchema();
        withTransaction(() => {
          events.forEach(event => {
            const sampleId = cellToString(event.sampleID || event.sample_id);
            const action = cellToString(event.action);
            if (!sampleId || !action) {
              skippedInvalid++;
              return;
            }

            const sample = queryAll(
              'SELECT id, sample_id, status FROM samples WHERE sample_id = ? LIMIT 1;',
              [sampleId]
            )[0];
            if (!sample) {
              skippedMissingSample++;
              return;
            }

            try {
              applyScanEventToSample(sample, event);
              recordSampleEvent({
                sampleRowId: sample.id,
                sampleId,
                action: `app_${action}`,
                details: {
                  source: 'ios_scanner_app_import',
                  imported_event_id: event.id || null,
                  session_id: event.sessionID || event.session_id || null,
                  action,
                  box_code: event.boxCode || event.box_code || null,
                  target_box_code: event.targetBoxCode || event.target_box_code || null,
                  position: event.position || null,
                  operator: event.operatorName || event.operator || null,
                  experiment_label: event.experimentLabel || event.experiment_label || null,
                  scanned_order: event.scannedOrder || event.scanned_order || null,
                  created_at: event.createdAt || event.created_at || null,
                },
              });
              applied++;
            } catch (err) {
              console.error('Failed to apply scan event', event, err);
              otherErrors++;
            }
          });
        });
      } catch (err) {
        console.error('Scan events import failed, rolling back.', err);
        alert('导入过程中出现错误，已回滚。请检查控制台错误信息。');
        return;
      }

      if (applied > 0 && typeof makeDbDirty === 'function') makeDbDirty();
      if (typeof refreshAllViews === 'function') refreshAllViews();

      let summary = `Scan events 导入完成：\n成功应用 ${applied} 条事件。`;
      if (skippedMissingSample > 0) summary += `\n跳过 ${skippedMissingSample} 条（sample_id 不存在）。`;
      if (skippedInvalid > 0) summary += `\n跳过 ${skippedInvalid} 条（缺少 sample_id 或 action）。`;
      if (otherErrors > 0) summary += `\n失败 ${otherErrors} 条（详见控制台）。`;
      alert(summary);
    };

    reader.readAsText(file);
  });
}

function normalizeScanEventsPayload(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.events)) return payload.events;
  return [];
}

function buildScanEventsPrecheck(events) {
  const sampleIds = events
    .map(event => cellToString(event.sampleID || event.sample_id))
    .filter(Boolean);
  const uniqueSampleIds = Array.from(new Set(sampleIds));
  const existingIds = new Set(
    queryAll('SELECT sample_id FROM samples;')
      .map(row => row.sample_id)
      .filter(Boolean)
  );

  const missing = uniqueSampleIds.filter(sampleId => !existingIds.has(sampleId));
  const actionCounts = {};
  events.forEach(event => {
    const action = cellToString(event.action) || '(missing)';
    actionCounts[action] = (actionCounts[action] || 0) + 1;
  });

  return {
    total: events.length,
    uniqueSamples: uniqueSampleIds.length,
    missing,
    actionCounts,
  };
}

function formatScanEventsPrecheck(result) {
  const lines = [
    'Scan events 导入预检：',
    `事件数：${result.total}`,
    `涉及样本数：${result.uniqueSamples}`,
  ];

  lines.push('');
  lines.push('Action 统计：');
  Object.entries(result.actionCounts).forEach(([action, count]) => {
    lines.push(`- ${action}: ${count}`);
  });

  if (result.missing.length > 0) {
    lines.push('');
    lines.push(`将跳过不存在的 sample_id：${result.missing.length} 个`);
    lines.push(result.missing.slice(0, 12).join(', '));
    if (result.missing.length > 12) lines.push('...');
  }

  lines.push('');
  lines.push('导入会更新样本状态/盒位，并写入 Audit Log。确认继续吗？');
  return lines.join('\n');
}

function ensureScanEventImportSchema() {
  try {
    appState.db.run(`ALTER TABLE boxes ADD COLUMN box_code TEXT;`);
  } catch (e) {
    // Column already exists.
  }

  try {
    appState.db.run(`ALTER TABLE samples ADD COLUMN box_position TEXT;`);
  } catch (e) {
    // Column already exists.
  }

  appState.db.run(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_boxes_box_code
    ON boxes(box_code)
    WHERE box_code IS NOT NULL AND TRIM(box_code) != '';
  `);
}

function applyScanEventToSample(sample, event) {
  const action = cellToString(event.action);
  const position = normalizePosition(event.position);
  const boxCode = cleanBoxCode(event.boxCode || event.box_code);
  const targetBoxCode = cleanBoxCode(event.targetBoxCode || event.target_box_code);

  if (action === 'putaway' || action === 'return') {
    const boxId = findOrCreateBoxByCode(boxCode);
    runSql(
      `UPDATE samples
       SET box_id = COALESCE(?, box_id),
           box_position = COALESCE(?, box_position),
           status = 'available',
           updated_at = datetime('now')
       WHERE id = ?;`,
      [boxId, position || null, sample.id]
    );
    return;
  }

  if (action === 'transfer') {
    const boxId = findOrCreateBoxByCode(targetBoxCode || boxCode);
    runSql(
      `UPDATE samples
       SET box_id = COALESCE(?, box_id),
           box_position = COALESCE(?, box_position),
           updated_at = datetime('now')
       WHERE id = ?;`,
      [boxId, position || null, sample.id]
    );
    return;
  }

  if (action === 'pickup') {
    runSql(
      `UPDATE samples
       SET status = 'checked_out',
           updated_at = datetime('now')
       WHERE id = ?;`,
      [sample.id]
    );
    return;
  }

  if (action === 'consume') {
    runSql(
      `UPDATE samples
       SET status = 'retired',
           updated_at = datetime('now')
       WHERE id = ?;`,
      [sample.id]
    );
    return;
  }

  if (action === 'inventory') {
    runSql(
      `UPDATE samples
       SET updated_at = datetime('now')
       WHERE id = ?;`,
      [sample.id]
    );
  }
}

function findOrCreateBoxByCode(rawCode) {
  const code = cleanBoxCode(rawCode);
  if (!code) return null;

  const existing = queryAll(
    `SELECT id FROM boxes
     WHERE box_code = ? OR box_label = ?
     LIMIT 1;`,
    [code, code]
  )[0];
  if (existing?.id) return existing.id;

  const id = getOrCreateBoxId({
    storage_temperature: '',
    freezer_no: '',
    rack: '',
    box_label: code,
  });
  if (id) {
    runSql('UPDATE boxes SET box_code = ? WHERE id = ?;', [code, id]);
  }
  return id;
}

function cleanBoxCode(value) {
  return cellToString(value)
    .replace(/^box:/i, '')
    .trim();
}

function normalizePosition(value) {
  const normalized = cellToString(value).toUpperCase().replace(/\s+/g, '');
  return normalized || null;
}

function buildImportPrecheck(rows) {
  const existingIds = new Set(
    queryAll('SELECT sample_id FROM samples;')
      .map(row => row.sample_id)
      .filter(Boolean)
  );
  const seenIds = new Set();
  const nextSeqByDate = {};
  const duplicateIds = [];

  const result = {
    total: rows.length,
    importable: 0,
    autoGenerated: 0,
    skippedNoId: 0,
    invalidDates: 0,
    duplicateIds,
    invalidStatuses: 0,
    missingTemp: 0,
    missingFreezer: 0,
    missingRack: 0,
    missingBoxLabel: 0,
  };

  rows.forEach(r => {
    let sampleId = cellToString(r.sample_id);
    const date = cellToString(r.date);

    if (date && !isValidYmdDate(date)) {
      result.invalidDates++;
      return;
    }

    if (!sampleId) {
      if (!date || date.length !== 8) {
        result.skippedNoId++;
        return;
      }

      if (nextSeqByDate[date] === undefined) {
        const existing = queryAll(
          `SELECT sample_id
           FROM samples
           WHERE date = ?
           ORDER BY sample_id DESC
           LIMIT 1;`,
          [date]
        );

        let baseSeq = 0;
        if (existing.length > 0 && existing[0].sample_id) {
          baseSeq = parseSeqFromSampleId(existing[0].sample_id);
        }
        nextSeqByDate[date] = baseSeq + 1;
      }

      sampleId = `${date}-${String(nextSeqByDate[date]).padStart(3, '0')}`;
      nextSeqByDate[date] += 1;
      result.autoGenerated++;
    }

    if (existingIds.has(sampleId) || seenIds.has(sampleId)) {
      if (duplicateIds.length < 10) duplicateIds.push(sampleId);
      return;
    }

    seenIds.add(sampleId);

    const rawStatus = cellToString(r.status);
    if (rawStatus && !VALID_SAMPLE_STATUSES.has(rawStatus.toLowerCase())) {
      result.invalidStatuses++;
    }

    const storage_temperature = cellToString(r.storage_temperature);
    const freezer_no = cellToString(r.freezer_no);
    const rack = cellToString(r.rack);
    const box_label = cellToString(r.box_label);
    const hasAnyStorage = storage_temperature || freezer_no || rack || box_label;

    if (hasAnyStorage) {
      if (!storage_temperature) result.missingTemp++;
      if (!freezer_no) result.missingFreezer++;
      if (!rack) result.missingRack++;
      if (!box_label) result.missingBoxLabel++;
    }

    result.importable++;
  });

  return result;
}

function formatImportPrecheck(result) {
  const lines = [
    '导入预检结果：',
    `总行数：${result.total}`,
    `预计可导入：${result.importable}`,
  ];

  if (result.autoGenerated > 0) {
    lines.push(`将自动生成 Sample ID：${result.autoGenerated} 行`);
  }
  if (result.skippedNoId > 0) {
    lines.push(`将跳过：${result.skippedNoId} 行（sample_id 为空且 date 不合法/为空）`);
  }
  if (result.invalidDates > 0) {
    lines.push(`将跳过：${result.invalidDates} 行（date 不是合法 YYYYMMDD）`);
  }
  if (result.duplicateIds.length > 0) {
    lines.push(`将跳过重复 Sample ID：${result.duplicateIds.join(', ')}`);
  }
  if (result.invalidStatuses > 0) {
    lines.push(`status 不合法并将按 available 导入：${result.invalidStatuses} 行`);
  }

  if (
    result.missingTemp > 0 ||
    result.missingFreezer > 0 ||
    result.missingRack > 0 ||
    result.missingBoxLabel > 0
  ) {
    lines.push('');
    lines.push('存储信息缺失统计：');
    if (result.missingTemp > 0) lines.push(`- 缺少 storage_temperature：${result.missingTemp}`);
    if (result.missingFreezer > 0) lines.push(`- 缺少 freezer_no：${result.missingFreezer}`);
    if (result.missingRack > 0) lines.push(`- 缺少 rack：${result.missingRack}`);
    if (result.missingBoxLabel > 0) lines.push(`- 缺少 box_label：${result.missingBoxLabel}`);
  }

  lines.push('');
  lines.push('确认开始导入吗？');
  return lines.join('\n');
}
