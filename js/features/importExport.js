import { appState } from '../state.js';
import { queryAll } from '../db/query.js';
import { cellToString, parseSeqFromSampleId } from '../utils/string.js';

export function bindImportExportEvents({ refreshAllViews, makeDbDirty } = {}) {
  bindExportSamplesXlsx();
  bindExportLabelsXlsx();
  bindImportSamples({ refreshAllViews, makeDbDirty });
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
               sample_type, processing, status, notes
        FROM samples
        WHERE id IN (${placeholders})
          AND (status IS NULL OR status != 'retired')
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
               sample_type, processing, status, notes
        FROM samples
        WHERE date = ?
          AND (status IS NULL OR status != 'retired')
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

      let imported = 0;
      let skippedNoId = 0;
      let skippedDuplicate = 0;
      let otherErrors = 0;
      let missingTemp = 0;
      let missingFreezer = 0;
      let missingRack = 0;
      let missingBoxLabel = 0;

      const nextSeqByDate = {};

      appState.db.run('BEGIN TRANSACTION;');

      try {
        rows.forEach(r => {
          let sample_id = cellToString(r.sample_id);
          const date = cellToString(r.date);

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
          const status = cellToString(r.status) || 'available';

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

          let boxId = null;

          if (box_label) {
            const existingBox = queryAll(
              `SELECT id FROM boxes
               WHERE storage_temperature = ? AND freezer_no = ? AND rack = ? AND box_label = ?
               LIMIT 1`,
              [storage_temperature || '', freezer_no || '', rack || '', box_label]
            );

            if (existingBox.length > 0) {
              boxId = existingBox[0].id;
            } else {
              const insertBoxStmt = appState.db.prepare(`
                INSERT INTO boxes (storage_temperature, freezer_no, rack, box_label)
                VALUES (?, ?, ?, ?);
              `);
              insertBoxStmt.run([
                storage_temperature || '',
                freezer_no || '',
                rack || '',
                box_label,
              ]);
              insertBoxStmt.free();

              const row = queryAll('SELECT last_insert_rowid() AS id;')[0];
              boxId = row.id;
            }
          }

          try {
            const insertStmt = appState.db.prepare(`
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

            insertStmt.free();
            imported++;
          } catch (err) {
            const msg = String(err);
            if (msg.includes('UNIQUE constraint failed: samples.sample_id')) {
              skippedDuplicate++;
            } else {
              console.error('Error inserting row', sample_id, err);
              otherErrors++;
            }
          }
        });

        appState.db.run('COMMIT;');
      } catch (e2) {
        console.error('Import failed, rolling back.', e2);
        appState.db.run('ROLLBACK;');
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