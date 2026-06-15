import { appState } from '../state.js';
import { queryAll, runSql, withTransaction } from '../db/query.js';
import { recordSampleEvent } from '../db/audit.js';
import { getOrCreateBoxId } from '../db/boxes.js';

const MODE_LABELS = {
  putaway: '入盒',
  pickup: '取样',
  return: '放回',
  transfer: '转移',
  inventory: '盘点',
  consume: '消耗',
};

const DEFAULT_ROWS = 9;
const DEFAULT_COLS = 9;

const scanState = {
  initialized: false,
  step: 'mode',
  mode: 'putaway',
  box: null,
  targetBox: null,
  cursorPosition: 'A1',
  sessionLabel: '',
  operator: '',
  scanned: [],
  lastScan: { value: '', at: 0 },
  camera: {
    stream: null,
    detector: null,
    rafId: null,
    active: false,
  },
};

export function bindScanWorkflowEvents({
  makeDbDirty,
  refreshAllViews,
} = {}) {
  const root = document.getElementById('scan-workflow-root');
  if (!root || scanState.initialized) return;

  scanState.initialized = true;
  root.addEventListener('click', event => {
    const action = event.target?.dataset?.scanAction;
    if (!action) return;

    if (action === 'load-box') loadBoxFromInput();
    if (action === 'load-target-box') loadTargetBoxFromInput();
    if (action === 'create-box') createBoxFromForm({ makeDbDirty, refreshAllViews });
    if (action === 'clear-basket') clearBasket();
    if (action === 'undo-scan') undoLastScan();
    if (action === 'confirm') confirmScanSession({ makeDbDirty, refreshAllViews });
    if (action === 'start-camera') startCameraScanner();
    if (action === 'stop-camera') stopCameraScanner();
    if (action === 'go-step') goStep(event.target.dataset.step);
    if (action === 'select-mode') selectMode(event.target.dataset.mode);
    if (action === 'next-from-mode') goStep(needsSourceBox() ? 'box' : 'samples');
    if (action === 'next-from-box') goStep(scanState.mode === 'transfer' ? 'target-box' : needsPosition() ? 'position' : 'samples');
    if (action === 'next-from-target-box') goStep(needsPosition() ? 'position' : 'samples');
    if (action === 'next-from-position') goStep('samples');
    if (action === 'next-from-samples') goStep('confirm');
  });

  root.addEventListener('click', event => {
    const position = event.target?.closest?.('.scan-grid-cell')?.dataset?.position;
    if (!position) return;

    scanState.cursorPosition = normalizePosition(position) || 'A1';
    renderScanWorkflow();
    focusScanInput();
  });

  root.addEventListener('change', event => {
    if (event.target?.id === 'scan-mode') {
      scanState.mode = event.target.value || 'putaway';
      clearBasket({ keepMessage: true });
      renderScanWorkflow();
    }
    if (event.target?.id === 'scan-start-position') {
      scanState.cursorPosition = normalizePosition(event.target.value) || 'A1';
      event.target.value = scanState.cursorPosition;
      renderScanWorkflow();
    }
  });

  root.addEventListener('input', event => {
    if (event.target?.id === 'scan-session-label') {
      scanState.sessionLabel = event.target.value || '';
    }
    if (event.target?.id === 'scan-operator') {
      scanState.operator = event.target.value || '';
    }
  });

  root.addEventListener('keydown', event => {
    if (event.target?.id !== 'scan-sample-input') return;
    if (event.key !== 'Enter') return;

    event.preventDefault();
    handleSampleScan(event.target.value);
    event.target.value = '';
  });

  renderScanWorkflow();
}

export function renderScanWorkflow() {
  const root = document.getElementById('scan-workflow-root');
  if (!root) return;

  ensureScanSchema();

  root.innerHTML = `
    <div class="scan-wizard">
      ${renderStepHeader()}
      <div class="scan-panel scan-step-panel">
        ${renderCurrentStep()}
        <div id="scan-message" class="scan-message small"></div>
      </div>
    </div>
  `;
}

function renderStepHeader() {
  return `
    <div class="scan-stepper">
      ${visibleSteps().map((step, index) => `
        <button type="button" class="scan-step-pill ${scanState.step === step ? 'active' : ''}" data-scan-action="go-step" data-step="${step}">
          ${index + 1}. ${escapeHtml(stepLabel(step))}
        </button>
      `).join('')}
    </div>
    <div class="scan-summary-strip">
      <span>操作：<strong>${escapeHtml(MODE_LABELS[scanState.mode])}</strong></span>
      <span>当前盒：<strong>${escapeHtml(scanState.box?.box_code || scanState.box?.box_label || '未选择')}</strong></span>
      ${scanState.mode === 'transfer' ? `<span>目标盒：<strong>${escapeHtml(scanState.targetBox?.box_code || scanState.targetBox?.box_label || '未选择')}</strong></span>` : ''}
      <span>位置：<strong>${escapeHtml(needsPosition() ? scanState.cursorPosition : '-')}</strong></span>
      <span>已扫：<strong>${scanState.scanned.length}</strong></span>
    </div>
  `;
}

function renderCurrentStep() {
  if (scanState.step === 'mode') return renderModeStep();
  if (scanState.step === 'box') return renderBoxStep('box');
  if (scanState.step === 'target-box') return renderBoxStep('target-box');
  if (scanState.step === 'position') return renderPositionStep();
  if (scanState.step === 'samples') return renderSamplesStep();
  if (scanState.step === 'confirm') return renderConfirmStep();
  return renderModeStep();
}

function renderModeStep() {
  return `
    <h3>先选择你现在要做什么</h3>
    <div class="scan-mode-grid">
      ${Object.entries(MODE_LABELS).map(([mode, label]) => `
        <button type="button" class="scan-mode-card ${scanState.mode === mode ? 'active' : ''}" data-scan-action="select-mode" data-mode="${mode}">
          <strong>${escapeHtml(label)}</strong>
          <span>${escapeHtml(modeHint(mode))}</span>
        </button>
      `).join('')}
    </div>
    <div class="scan-form-grid scan-form-grid-wide" style="margin-top:12px;">
      <label>实验 / 任务标签
        <input type="text" id="scan-session-label" value="${escapeHtml(scanState.sessionLabel)}" placeholder="EXP-20260615-01">
      </label>
      <label>操作者
        <input type="text" id="scan-operator" value="${escapeHtml(scanState.operator)}" placeholder="姓名或缩写">
      </label>
    </div>
    <div class="scan-actions scan-actions-end">
      <button type="button" class="btn-primary" data-scan-action="next-from-mode">下一步</button>
    </div>
  `;
}

function renderBoxStep(kind) {
  const isTarget = kind === 'target-box';
  const inputId = isTarget ? 'scan-target-box-input' : 'scan-box-input';
  const action = isTarget ? 'load-target-box' : 'load-box';
  const title = isTarget ? '选择目标冻存盒' : '扫当前冻存盒';
  const nextAction = isTarget ? 'next-from-target-box' : 'next-from-box';
  const selectedBox = isTarget ? scanState.targetBox : scanState.box;

  return `
    <h3>${escapeHtml(title)}</h3>
    <div class="scan-form-grid">
      <label>${isTarget ? 'Target box QR' : 'Box QR'}
        <input type="text" id="${inputId}" placeholder="例如 BOX-0001 或 box:BOX-0001">
      </label>
      <button type="button" class="btn-primary scan-align-bottom" data-scan-action="${action}">载入盒子</button>
    </div>
    ${renderCurrentBox(selectedBox, isTarget ? '目标盒子' : '当前盒子')}
    ${isTarget ? '' : renderCreateBoxDetails()}
    <div class="scan-actions">
      <button type="button" class="btn-secondary" data-scan-action="go-step" data-step="mode">上一步</button>
      <button type="button" class="btn-primary" data-scan-action="${nextAction}"${selectedBox ? '' : ' disabled'}>下一步</button>
    </div>
  `;
}

function renderCreateBoxDetails() {
  return `
    <details class="scan-create-box">
      <summary>没有这个盒子时，新建盒子记录</summary>
      <div class="scan-form-grid scan-form-grid-wide">
        <label>Box code
          <input type="text" id="scan-new-box-code" placeholder="BOX-0001">
        </label>
        <label>Storage temperature
          <input type="text" id="scan-new-storage-temperature" placeholder="-80">
        </label>
        <label>Freezer no.
          <input type="text" id="scan-new-freezer-no" placeholder="F1">
        </label>
        <label>Rack
          <input type="text" id="scan-new-rack" placeholder="Rack A">
        </label>
        <label>Box label
          <input type="text" id="scan-new-box-label" placeholder="RNA-Blue">
        </label>
        <label>Rows
          <input type="number" id="scan-new-box-rows" min="1" max="26" value="${DEFAULT_ROWS}">
        </label>
        <label>Cols
          <input type="number" id="scan-new-box-cols" min="1" max="24" value="${DEFAULT_COLS}">
        </label>
        <button type="button" class="btn-secondary scan-align-bottom" data-scan-action="create-box">Create box</button>
      </div>
    </details>
  `;
}

function renderPositionStep() {
  return `
    <h3>选择起始孔位</h3>
    <div class="scan-form-grid">
      <label>下一管放到 / 转移到
        <input type="text" id="scan-start-position" value="${escapeHtml(scanState.cursorPosition)}" placeholder="A1">
      </label>
      <button type="button" class="btn-primary scan-align-bottom" data-scan-action="next-from-position">确认位置</button>
    </div>
    <div class="small" style="margin-top:6px;">也可以直接点下面网格里的孔位。连续扫码时会自动往后填。</div>
    <div style="margin-top:10px;">${renderBoxGrid()}</div>
    <div class="scan-actions">
      <button type="button" class="btn-secondary" data-scan-action="go-step" data-step="${scanState.mode === 'transfer' ? 'target-box' : 'box'}">上一步</button>
      <button type="button" class="btn-primary" data-scan-action="next-from-position">下一步</button>
    </div>
  `;
}

function renderSamplesStep() {
  const backStep = needsPosition() ? 'position' : needsSourceBox() ? 'box' : 'mode';
  return `
    <h3>连续扫 EP 管</h3>
    <div class="scan-form-grid">
      <label>Sample QR input
        <input type="text" id="scan-sample-input" placeholder="扫 sample_id 后按 Enter" autocomplete="off">
      </label>
      <button type="button" class="btn-secondary scan-align-bottom" data-scan-action="start-camera">iPhone camera</button>
      <button type="button" class="btn-secondary scan-align-bottom" data-scan-action="stop-camera">Stop camera</button>
    </div>
    <video id="scan-camera-preview" class="scan-camera-preview" playsinline muted></video>
    <div style="margin-top:10px;">${renderBasket()}</div>
    <div class="scan-actions">
      <button type="button" class="btn-secondary" data-scan-action="go-step" data-step="${backStep}">上一步</button>
      <button type="button" class="btn-secondary" data-scan-action="undo-scan">撤销上一管</button>
      <button type="button" class="btn-secondary" data-scan-action="clear-basket">清空</button>
      <button type="button" class="btn-primary" data-scan-action="next-from-samples"${scanState.scanned.length ? '' : ' disabled'}>下一步：检查</button>
    </div>
  `;
}

function renderConfirmStep() {
  const invalidCount = scanState.scanned.filter(item => !item.ok).length;
  return `
    <h3>最后确认</h3>
    <div class="scan-confirm-box">
      <div>将执行：<strong>${escapeHtml(MODE_LABELS[scanState.mode])}</strong></div>
      <div>样本数量：<strong>${scanState.scanned.length}</strong></div>
      <div>异常数量：<strong class="${invalidCount ? 'scan-danger' : ''}">${invalidCount}</strong></div>
    </div>
    <div style="margin-top:10px;">${renderBasket()}</div>
    <div class="scan-actions">
      <button type="button" class="btn-secondary" data-scan-action="go-step" data-step="samples">上一步</button>
      <button type="button" class="btn-primary" data-scan-action="confirm"${scanState.scanned.length && !invalidCount ? '' : ' disabled'}>确认执行 ${escapeHtml(MODE_LABELS[scanState.mode])}</button>
    </div>
  `;
}

function ensureScanSchema() {
  if (!appState.db) return;

  try {
    appState.db.run(`ALTER TABLE boxes ADD COLUMN box_code TEXT;`);
  } catch (e) {
    // Existing database already has the column.
  }

  try {
    appState.db.run(`ALTER TABLE samples ADD COLUMN box_position TEXT;`);
  } catch (e) {
    // Existing database already has the column.
  }

  appState.db.run(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_boxes_box_code
    ON boxes(box_code)
    WHERE box_code IS NOT NULL AND TRIM(box_code) != '';
  `);

  appState.db.run(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_samples_box_position
    ON samples(box_id, box_position)
    WHERE box_id IS NOT NULL AND box_position IS NOT NULL AND TRIM(box_position) != '';
  `);
}

function renderCurrentBox(box, title) {
  if (!box) {
    return `<div class="scan-empty small">${escapeHtml(title)}：未选择</div>`;
  }

  return `
    <div class="scan-current-box">
      <strong>${escapeHtml(title)}：${escapeHtml(box.box_code || box.box_label || `#${box.id}`)}</strong>
      <span>${escapeHtml([box.storage_temperature, box.freezer_no, box.rack, box.box_label].filter(Boolean).join(' / '))}</span>
      <span>${getBoxRows(box)} x ${getBoxCols(box)} · id ${escapeHtml(box.id)}</span>
    </div>
  `;
}

function renderTargetBoxControls() {
  if (scanState.mode !== 'transfer') return '';

  return `
    <div class="scan-form-grid" style="margin-top:8px;">
      <label>Target box QR
        <input type="text" id="scan-target-box-input" placeholder="转移目标盒子">
      </label>
      <button type="button" class="btn-secondary scan-align-bottom" data-scan-action="load-target-box">Load target</button>
    </div>
    ${renderCurrentBox(scanState.targetBox, '目标盒子')}
  `;
}

function visibleSteps() {
  const steps = ['mode'];
  if (needsSourceBox()) steps.push('box');
  if (scanState.mode === 'transfer') steps.push('target-box');
  if (needsPosition()) steps.push('position');
  steps.push('samples', 'confirm');
  return steps;
}

function stepLabel(step) {
  return {
    mode: '操作',
    box: '盒子',
    'target-box': '目标盒',
    position: '孔位',
    samples: '扫码',
    confirm: '确认',
  }[step] || step;
}

function modeHint(mode) {
  return {
    putaway: '新样本放进盒子，按孔位连续填入',
    pickup: '从当前盒子取多管样本',
    return: '把取出的样本放回盒子',
    transfer: '从一个盒子转移到另一个盒子',
    inventory: '盘点当前盒子，找缺失/错位',
    consume: '样本用尽后批量标记 retired',
  }[mode] || '';
}

function needsSourceBox() {
  return ['putaway', 'pickup', 'return', 'transfer', 'inventory'].includes(scanState.mode);
}

function needsPosition() {
  return ['putaway', 'return', 'transfer'].includes(scanState.mode);
}

function goStep(step) {
  if (!step) return;
  if (!visibleSteps().includes(step)) return;
  scanState.step = step;
  renderScanWorkflow();
  if (step === 'samples') focusScanInput();
}

function selectMode(mode) {
  if (!MODE_LABELS[mode]) return;
  if (scanState.mode !== mode) {
    scanState.mode = mode;
    scanState.scanned = [];
    if (!needsSourceBox()) scanState.box = null;
    if (mode !== 'transfer') scanState.targetBox = null;
  }
  renderScanWorkflow();
}

function renderBoxGrid() {
  const box = scanState.box;
  if (!box) {
    return `<div class="scan-empty">先扫码或载入一个冻存盒。</div>`;
  }

  const occupancy = getBoxOccupancy(box.id);
  const pendingByPosition = new Map();
  scanState.scanned.forEach(item => {
    if (item.position) pendingByPosition.set(item.position, item);
  });

  const rows = getBoxRows(box);
  const cols = getBoxCols(box);
  const cells = [];

  for (let r = 0; r < rows; r += 1) {
    for (let c = 1; c <= cols; c += 1) {
      const pos = `${String.fromCharCode(65 + r)}${c}`;
      const existing = occupancy.get(pos);
      const pending = pendingByPosition.get(pos);
      const cls = [
        'scan-grid-cell',
        existing ? 'occupied' : 'empty',
        pending ? 'pending' : '',
        scanState.cursorPosition === pos ? 'cursor' : '',
      ].filter(Boolean).join(' ');
      cells.push(`
        <button type="button" class="${cls}" title="${escapeHtml(pos)} ${escapeHtml(existing?.sample_id || '')}" data-position="${escapeHtml(pos)}">
          <strong>${escapeHtml(pos)}</strong>
          <span>${escapeHtml(pending?.sample_id || existing?.sample_id || '')}</span>
        </button>
      `);
    }
  }

  return `
    <div class="scan-grid" style="grid-template-columns: repeat(${cols}, minmax(44px, 1fr));">
      ${cells.join('')}
    </div>
  `;
}

function renderBasket() {
  if (scanState.scanned.length === 0) {
    return `<div class="scan-empty">扫码后样本会先进入这里，确认前不会修改数据库。</div>`;
  }

  return `
    <div class="table-wrap">
      <table class="scan-basket-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Sample ID</th>
            <th>Position</th>
            <th>Status</th>
            <th>Check</th>
          </tr>
        </thead>
        <tbody>
          ${scanState.scanned.map((item, index) => `
            <tr class="${item.ok ? '' : 'scan-row-error'}">
              <td>${index + 1}</td>
              <td>${escapeHtml(item.sample_id)}</td>
              <td>${escapeHtml(item.position || '')}</td>
              <td>${escapeHtml(item.sample?.status || '')}</td>
              <td>${escapeHtml(item.message)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function loadBoxFromInput() {
  const input = document.getElementById('scan-box-input');
  const box = findBoxByQr(input?.value || '');
  if (!box) {
    setMessage('没有找到这个盒子。可以展开“新建盒子记录”先创建。', 'error');
    return;
  }

  scanState.box = box;
  clearBasket({ keepMessage: true });
  renderScanWorkflow();
  setMessage(`已载入盒子 ${box.box_code || box.box_label || box.id}`, 'ok');
}

function loadTargetBoxFromInput() {
  const input = document.getElementById('scan-target-box-input');
  const box = findBoxByQr(input?.value || '');
  if (!box) {
    setMessage('没有找到目标盒子。', 'error');
    return;
  }

  scanState.targetBox = box;
  renderScanWorkflow();
  setMessage(`已载入目标盒子 ${box.box_code || box.box_label || box.id}`, 'ok');
}

function createBoxFromForm({ makeDbDirty, refreshAllViews } = {}) {
  if (!appState.db) return;

  const boxCode = cleanBoxCode(valueOf('scan-new-box-code'));
  const storage_temperature = valueOf('scan-new-storage-temperature');
  const freezer_no = valueOf('scan-new-freezer-no');
  const rack = valueOf('scan-new-rack');
  const box_label = valueOf('scan-new-box-label') || boxCode;
  const rows = clampInteger(valueOf('scan-new-box-rows'), DEFAULT_ROWS, 1, 26);
  const cols = clampInteger(valueOf('scan-new-box-cols'), DEFAULT_COLS, 1, 24);

  if (!boxCode || !box_label) {
    setMessage('Box code 和 box label 至少要填写。', 'error');
    return;
  }

  try {
    const id = getOrCreateBoxId({
      storage_temperature,
      freezer_no,
      rack,
      box_label,
    });

    runSql(
      `UPDATE boxes SET box_code = ?, capacity = ? WHERE id = ?;`,
      [boxCode, rows * cols, id]
    );

    scanState.box = findBoxById(id);
    if (typeof makeDbDirty === 'function') makeDbDirty();
    if (typeof refreshAllViews === 'function') refreshAllViews();
    renderScanWorkflow();
    setMessage(`已创建/更新盒子 ${boxCode}`, 'ok');
  } catch (err) {
    setMessage(`创建盒子失败：${err.message || err}`, 'error');
  }
}

function handleSampleScan(rawValue) {
  if (!appState.db) return;

  const sampleId = cleanSampleQr(rawValue);
  if (!sampleId) return;

  const now = Date.now();
  if (scanState.lastScan.value === sampleId && now - scanState.lastScan.at < 1200) {
    setMessage(`忽略重复扫码：${sampleId}`, 'warn');
    return;
  }
  scanState.lastScan = { value: sampleId, at: now };

  if (scanState.scanned.some(item => item.sample_id === sampleId)) {
    setMessage(`扫码篮里已经有 ${sampleId}`, 'warn');
    return;
  }

  const sample = findSample(sampleId);
  const position = positionForNextScan();
  const validation = validateScan(sampleId, sample, position);

  scanState.scanned.push({
    sample_id: sampleId,
    sample,
    position,
    ok: validation.ok,
    message: validation.message,
  });

  if (scanState.mode === 'putaway' || scanState.mode === 'return' || scanState.mode === 'transfer') {
    scanState.cursorPosition = nextPosition(position, scanState.box);
  }

  renderScanWorkflow();
  focusScanInput();
}

function validateScan(sampleId, sample, position) {
  if (!sample) return { ok: false, message: '数据库不存在' };

  const status = String(sample.status || '').toLowerCase();
  if (status === 'deleted') return { ok: false, message: '样本已删除' };
  if (status === 'retired' && scanState.mode !== 'inventory') return { ok: false, message: '样本已 retired' };

  if ((scanState.mode === 'putaway' || scanState.mode === 'return') && !scanState.box) {
    return { ok: false, message: '未选择盒子' };
  }

  if ((scanState.mode === 'putaway' || scanState.mode === 'return') && isPositionOccupied(scanState.box.id, position, sample.id)) {
    return { ok: false, message: `${position} 已有样本` };
  }

  if ((scanState.mode === 'pickup' || scanState.mode === 'inventory' || scanState.mode === 'transfer') && scanState.box) {
    if (Number(sample.box_id) !== Number(scanState.box.id)) {
      return { ok: false, message: `不在当前盒，记录位置 ${sample.box_label || sample.box_id || '无'} / ${sample.box_position || ''}` };
    }
  }

  if (scanState.mode === 'transfer') {
    if (!scanState.targetBox) return { ok: false, message: '未选择目标盒子' };
    if (isPositionOccupied(scanState.targetBox.id, position, sample.id)) {
      return { ok: false, message: `目标 ${position} 已有样本` };
    }
  }

  return { ok: true, message: 'OK' };
}

function confirmScanSession({ makeDbDirty, refreshAllViews } = {}) {
  if (!appState.db) return;
  if (scanState.scanned.length === 0) {
    setMessage('扫码篮为空。', 'warn');
    return;
  }

  const invalid = scanState.scanned.filter(item => !item.ok);
  if (invalid.length > 0) {
    setMessage(`还有 ${invalid.length} 条异常记录，先处理后再确认。`, 'error');
    return;
  }

  const sessionId = makeSessionId();
  const label = scanState.sessionLabel || valueOf('scan-session-label');
  const operator = scanState.operator || valueOf('scan-operator');
  const mode = scanState.mode;

  try {
    withTransaction(() => {
      scanState.scanned.forEach((item, index) => {
        const details = {
          source: 'scan_workflow',
          session_id: sessionId,
          mode,
          scanned_order: index + 1,
          experiment_label: label || null,
          operator: operator || null,
          box_id: scanState.box?.id || null,
          box_code: scanState.box?.box_code || null,
          position: item.position || item.sample?.box_position || null,
          target_box_id: scanState.targetBox?.id || null,
          target_box_code: scanState.targetBox?.box_code || null,
        };

        if (mode === 'putaway' || mode === 'return') {
          runSql(
            `UPDATE samples SET box_id = ?, box_position = ?, status = 'available', updated_at = datetime('now') WHERE id = ?;`,
            [scanState.box.id, item.position, item.sample.id]
          );
        } else if (mode === 'pickup') {
          runSql(
            `UPDATE samples SET status = 'checked_out', updated_at = datetime('now') WHERE id = ?;`,
            [item.sample.id]
          );
        } else if (mode === 'transfer') {
          runSql(
            `UPDATE samples SET box_id = ?, box_position = ?, updated_at = datetime('now') WHERE id = ?;`,
            [scanState.targetBox.id, item.position, item.sample.id]
          );
        } else if (mode === 'consume') {
          runSql(
            `UPDATE samples SET status = 'retired', updated_at = datetime('now') WHERE id = ?;`,
            [item.sample.id]
          );
        }

        recordSampleEvent({
          sampleRowId: item.sample.id,
          sampleId: item.sample_id,
          action: `scan_${mode}`,
          details,
        });
      });
    });

    scanState.scanned = [];
    if (typeof makeDbDirty === 'function') makeDbDirty();
    if (typeof refreshAllViews === 'function') refreshAllViews();
    renderScanWorkflow();
    setMessage(`已确认 ${MODE_LABELS[mode]}，session ${sessionId}`, 'ok');
  } catch (err) {
    setMessage(`确认失败：${err.message || err}`, 'error');
  }
}

function clearBasket({ keepMessage = false } = {}) {
  scanState.scanned = [];
  if (!keepMessage) setMessage('');
  renderScanWorkflow();
}

function undoLastScan() {
  scanState.scanned.pop();
  renderScanWorkflow();
  focusScanInput();
}

async function startCameraScanner() {
  const video = document.getElementById('scan-camera-preview');
  if (!video) return;

  if (!('BarcodeDetector' in window)) {
    setMessage('当前浏览器不支持 BarcodeDetector。可以继续使用 iPhone 相机复制结果，或用手动输入框连续扫码。', 'error');
    return;
  }

  try {
    scanState.camera.detector = new window.BarcodeDetector({ formats: ['qr_code'] });
    scanState.camera.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' },
      audio: false,
    });
    video.srcObject = scanState.camera.stream;
    await video.play();
    scanState.camera.active = true;
    scanCameraFrame(video);
    setMessage('相机扫码已开启。', 'ok');
  } catch (err) {
    setMessage(`无法开启相机：${err.message || err}`, 'error');
  }
}

function stopCameraScanner() {
  scanState.camera.active = false;
  if (scanState.camera.rafId) cancelAnimationFrame(scanState.camera.rafId);
  if (scanState.camera.stream) {
    scanState.camera.stream.getTracks().forEach(track => track.stop());
  }
  scanState.camera.stream = null;
  scanState.camera.rafId = null;
  const video = document.getElementById('scan-camera-preview');
  if (video) video.srcObject = null;
  setMessage('相机扫码已停止。', 'ok');
}

async function scanCameraFrame(video) {
  if (!scanState.camera.active || !scanState.camera.detector) return;

  try {
    const codes = await scanState.camera.detector.detect(video);
    if (codes.length > 0) {
      handleSampleScan(codes[0].rawValue || '');
    }
  } catch (e) {
    // Detection can fail while video metadata is warming up.
  }

  scanState.camera.rafId = requestAnimationFrame(() => scanCameraFrame(video));
}

function findBoxByQr(value) {
  const cleaned = cleanBoxCode(value);
  if (!cleaned) return null;

  const numericId = Number(cleaned);
  if (Number.isInteger(numericId) && numericId > 0) {
    const byId = findBoxById(numericId);
    if (byId) return byId;
  }

  return queryAll(`
    SELECT *
    FROM boxes
    WHERE box_code = ?
       OR box_label = ?
    LIMIT 1;
  `, [cleaned, cleaned])[0] || null;
}

function findBoxById(id) {
  return queryAll(`SELECT * FROM boxes WHERE id = ? LIMIT 1;`, [id])[0] || null;
}

function findSample(sampleId) {
  return queryAll(`
    SELECT s.*, b.box_code, b.box_label, b.storage_temperature, b.freezer_no, b.rack
    FROM samples s
    LEFT JOIN boxes b ON s.box_id = b.id
    WHERE s.sample_id = ?
    LIMIT 1;
  `, [sampleId])[0] || null;
}

function getBoxOccupancy(boxId) {
  const rows = queryAll(`
    SELECT id, sample_id, box_position, status
    FROM samples
    WHERE box_id = ?
      AND box_position IS NOT NULL
      AND TRIM(box_position) != ''
      AND deleted_at IS NULL
    ORDER BY box_position ASC;
  `, [boxId]);

  return new Map(rows.map(row => [normalizePosition(row.box_position), row]));
}

function isPositionOccupied(boxId, position, sameSampleId = null) {
  if (!boxId || !position) return false;

  const rows = queryAll(`
    SELECT id
    FROM samples
    WHERE box_id = ?
      AND box_position = ?
      AND deleted_at IS NULL
    LIMIT 1;
  `, [boxId, position]);

  if (rows.length === 0) return false;
  return sameSampleId ? Number(rows[0].id) !== Number(sameSampleId) : true;
}

function positionForNextScan() {
  if (scanState.mode === 'pickup' || scanState.mode === 'inventory' || scanState.mode === 'consume') {
    return '';
  }
  return normalizePosition(scanState.cursorPosition) || 'A1';
}

function nextPosition(position, box) {
  const parsed = parsePosition(position);
  if (!parsed) return 'A1';

  const cols = getBoxCols(box);
  const rows = getBoxRows(box);
  let { row, col } = parsed;
  col += 1;
  if (col > cols) {
    col = 1;
    row += 1;
  }
  if (row >= rows) return position;
  return `${String.fromCharCode(65 + row)}${col}`;
}

function parsePosition(value) {
  const normalized = normalizePosition(value);
  const match = normalized.match(/^([A-Z])(\d{1,2})$/);
  if (!match) return null;
  return {
    row: match[1].charCodeAt(0) - 65,
    col: Number(match[2]),
  };
}

function normalizePosition(value) {
  return String(value || '').trim().toUpperCase().replace(/\s+/g, '');
}

function cleanSampleQr(value) {
  return String(value || '').trim();
}

function cleanBoxCode(value) {
  return String(value || '')
    .trim()
    .replace(/^box:/i, '')
    .trim();
}

function getBoxRows(box) {
  const capacity = Number(box?.capacity || DEFAULT_ROWS * DEFAULT_COLS);
  if (capacity === 100) return 10;
  if (capacity === 96) return 8;
  if (capacity === 81) return 9;
  return DEFAULT_ROWS;
}

function getBoxCols(box) {
  const capacity = Number(box?.capacity || DEFAULT_ROWS * DEFAULT_COLS);
  if (capacity === 100) return 10;
  if (capacity === 96) return 12;
  if (capacity === 81) return 9;
  return Math.ceil(capacity / getBoxRows(box));
}

function valueOf(id) {
  return (document.getElementById(id)?.value || '').trim();
}

function clampInteger(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isInteger(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function makeSessionId() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `SCAN-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function setMessage(message, type = '') {
  const el = document.getElementById('scan-message');
  if (!el) return;
  el.textContent = message || '';
  el.className = `scan-message small ${type ? `scan-message-${type}` : ''}`;
}

function focusScanInput() {
  setTimeout(() => document.getElementById('scan-sample-input')?.focus(), 0);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
