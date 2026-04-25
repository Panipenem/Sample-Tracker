import { appState } from '../state.js';
import { queryAll } from '../db/query.js';
import {
  SECONDARY_SAMPLE_PRESETS,
  SECONDARY_TYPE_SHORT,
  SECONDARY_DEFAULT_PROCESSING,
} from '../db/sampleTypes.js';

let wizardPrimaryIds = [];
let wizardTypes = [];
let wizardProcessingByType = {};
let wizardNamingRule = 'parent-type';
let wizardCustomTemplate = '{parent}-{type}';


export function bindWizardEvents({ refreshAllViews, makeDbDirty } = {}) {
  initSecondaryPresetOptions();
  bindWizardOpen();
  bindWizardClose();
  bindWizardStepEvents({ refreshAllViews, makeDbDirty });
}

function normalizeTypeKey(typeName) {
  return (typeName || '').trim();
}

function getTypeAbbrev(typeName) {
  const key = normalizeTypeKey(typeName);
  if (!key) return '';

  if (SECONDARY_TYPE_SHORT[key]) {
    return SECONDARY_TYPE_SHORT[key];
  }

  const words = key.split(/\s+/).filter(Boolean);
  let abbr = words.map(w => w[0]).join('');

  if (abbr.length > 3) abbr = abbr.slice(0, 3);
  if (!abbr) abbr = key.slice(0, 3);

  abbr = abbr.charAt(0).toUpperCase() + abbr.slice(1);

  const ok = confirm(`Use abbreviation "${abbr}" for type "${key}" in sample_id?`);
  if (!ok) return '';

  SECONDARY_TYPE_SHORT[key] = abbr;
  return abbr;
}

function getTodayYMD() {
  const now = new Date();
  const y = now.getFullYear().toString();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return y + m + d;
}

function generateUniqueChildSampleId(parentSampleId, typeAbbrev) {
  const base = `${parentSampleId}-${typeAbbrev}`;
  let candidate = base;
  let suffix = 2;

  while (true) {
    const res = queryAll(`SELECT COUNT(*) AS c FROM samples WHERE sample_id = ?`, [candidate]);
    const count = res && res[0] ? res[0].c : 0;

    if (!count) return candidate;

    candidate = `${base}${suffix}`;
    suffix++;

    if (suffix > 99) {
      return `${base}-${Date.now()}`;
    }
  }
}

function showWizardStep(step) {
  [1, 2, 3, 4].forEach(n => {
    const el = document.getElementById(`wizard-step-${n}`);
    if (!el) return;

    if (n === step) {
      el.classList.remove('hidden');
    } else {
      el.classList.add('hidden');
    }
  });
}

function initSecondaryPresetOptions() {
  const container = document.getElementById('wizard-type-list');
  if (!container) return;

  container.innerHTML = '';

  SECONDARY_SAMPLE_PRESETS.forEach(type => {
    const label = document.createElement('label');

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.className = 'wizard-type-checkbox';
    input.value = type;

    label.appendChild(input);
    label.appendChild(document.createTextNode(' ' + type));

    container.appendChild(label);
  });
}

function openWizard() {
  const selected = Array.from(document.querySelectorAll('.sample-select:checked'));

  if (selected.length === 0) {
    alert('请先在 Sample List 中勾选至少一个一次样本。');
    return;
  }

  wizardPrimaryIds = selected
    .map(cb => parseInt(cb.getAttribute('data-id'), 10))
    .filter(id => !Number.isNaN(id));

  if (wizardPrimaryIds.length === 0) {
    alert('Selected rows do not have valid IDs.');
    return;
  }

  wizardTypes = [];
  wizardProcessingByType = {};
  wizardNamingRule = 'parent-type';
  wizardCustomTemplate = '{parent}-{type}';

  document.querySelectorAll('.wizard-type-checkbox').forEach(cb => {
    cb.checked = false;
  });

  const customTypeInput = document.getElementById('wizard-custom-type');
  if (customTypeInput) customTypeInput.value = '';

  const customTemplateInput = document.getElementById('wizard-custom-template');
  if (customTemplateInput) customTemplateInput.value = '';

  const hint = document.getElementById('wizard-primary-count-hint');
  if (hint) {
    hint.textContent = `Selected primary samples: ${wizardPrimaryIds.length}`;
  }

  document.querySelectorAll('input[name="wizard-naming-rule"]').forEach(r => {
    r.checked = r.value === 'parent-type';
  });

  showWizardStep(1);

  const bd = document.getElementById('wizard-backdrop');
  if (bd) {
    bd.classList.remove('hidden');
    bd.style.display = 'flex';
  }
}

function closeWizard() {
  const bd = document.getElementById('wizard-backdrop');
  if (!bd) return;

  bd.classList.add('hidden');
  bd.style.display = 'none';
}

function buildProcessingUI() {
  const container = document.getElementById('wizard-processing-container');
  if (!container) return;

  container.innerHTML = '';

  wizardTypes.forEach(typeName => {
    const key = normalizeTypeKey(typeName);

    const block = document.createElement('div');
    block.className = 'wizard-type-block';

    const title = document.createElement('div');
    title.className = 'wizard-type-block-title';
    title.textContent = key;
    block.appendChild(title);

    const optionsDiv = document.createElement('div');
    optionsDiv.className = 'wizard-type-block-options';

    const defaultList = SECONDARY_DEFAULT_PROCESSING[key] || [];
    const saved = localStorage.getItem('wizard_last_processing_' + key);
    const radioName = 'wizard-proc-' + key;

    defaultList.forEach(opt => {
      if (opt === 'Other') return;

      const label = document.createElement('label');
      const input = document.createElement('input');
      input.type = 'radio';
      input.name = radioName;
      input.value = opt;

      label.appendChild(input);
      label.appendChild(document.createTextNode(' ' + opt));
      optionsDiv.appendChild(label);
    });

    const otherLabel = document.createElement('label');
    const otherRadio = document.createElement('input');
    otherRadio.type = 'radio';
    otherRadio.name = radioName;
    otherRadio.value = '__other__';

    const otherText = document.createElement('input');
    otherText.type = 'text';
    otherText.className = 'wizard-proc-other';
    otherText.setAttribute('data-type', key);
    otherText.placeholder = 'Other...';

    otherLabel.appendChild(otherRadio);
    otherLabel.appendChild(document.createTextNode(' Other: '));
    otherLabel.appendChild(otherText);
    optionsDiv.appendChild(otherLabel);

    block.appendChild(optionsDiv);
    container.appendChild(block);

    if (saved) {
      const radios = optionsDiv.querySelectorAll(`input[name="${radioName}"]`);
      let matched = false;

      radios.forEach(r => {
        if (r.value === saved) {
          r.checked = true;
          matched = true;
        }
      });

      if (!matched) {
        otherRadio.checked = true;
        otherText.value = saved;
      }
    } else {
      const firstRadio = optionsDiv.querySelector(`input[name="${radioName}"]`);
      if (firstRadio) firstRadio.checked = true;
    }
  });
}

function bindWizardOpen() {
  const btn = document.getElementById('btn-open-secondary-wizard');
  if (!btn) return;

  btn.addEventListener('click', openWizard);
}

function bindWizardClose() {
  const closeBtn = document.getElementById('wizard-close-btn');
  if (closeBtn) {
    closeBtn.addEventListener('click', closeWizard);
  }

  const cancelBtn = document.getElementById('wizard-cancel-1');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', closeWizard);
  }
}

function bindWizardStepEvents({ refreshAllViews, makeDbDirty } = {}) {
  const next1 = document.getElementById('wizard-next-1');
  if (next1) {
    next1.addEventListener('click', () => {
      const types = [];

      document.querySelectorAll('.wizard-type-checkbox').forEach(cb => {
        if (cb.checked) types.push(cb.value);
      });

      const custom = (document.getElementById('wizard-custom-type')?.value || '').trim();
      if (custom) types.push(custom);

      if (types.length === 0) {
        alert('请至少选择一种二次样本预设类型，或填写 Custom secondary type。');
        return;
      }

      wizardTypes = types;
      buildProcessingUI();
      showWizardStep(2);
    });
  }

  const prev2 = document.getElementById('wizard-prev-2');
  if (prev2) {
    prev2.addEventListener('click', () => {
      showWizardStep(1);
    });
  }

  const next2 = document.getElementById('wizard-next-2');
  if (next2) {
    next2.addEventListener('click', () => {
      const procMap = {};

      for (const typeName of wizardTypes) {
        const key = normalizeTypeKey(typeName);
        const radioName = 'wizard-proc-' + key;
        const selected = document.querySelector(`input[name="${radioName}"]:checked`);

        if (!selected) {
          alert(`Please choose processing for type: ${key}`);
          return;
        }

        let val = selected.value;

        if (val === '__other__') {
          const otherInput = document.querySelector(`.wizard-proc-other[data-type="${key}"]`);
          val = (otherInput && otherInput.value.trim()) || '';

          if (!val) {
            alert(`Please fill in the processing text for: ${key}`);
            return;
          }
        }

        procMap[key] = val;
        localStorage.setItem('wizard_last_processing_' + key, val);
      }

      wizardProcessingByType = procMap;
      showWizardStep(3);
    });
  }

  const prev3 = document.getElementById('wizard-prev-3');
  if (prev3) {
    prev3.addEventListener('click', () => {
      showWizardStep(2);
    });
  }

  const next3 = document.getElementById('wizard-next-3');
  if (next3) {
    next3.addEventListener('click', () => {
      let rule = 'parent-type';

      document.querySelectorAll('input[name="wizard-naming-rule"]').forEach(r => {
        if (r.checked) rule = r.value;
      });

      wizardNamingRule = rule;

      if (rule === 'custom') {
        const tpl = (document.getElementById('wizard-custom-template')?.value || '').trim();
        if (!tpl) {
          alert('请填写自定义模板，至少包含 {parent} 或 {type}。');
          return;
        }
        wizardCustomTemplate = tpl;
      } else {
        wizardCustomTemplate = '{parent}-{type}';
      }

      const summaryDiv = document.getElementById('wizard-summary');
      const lines = [];

      lines.push(`Primary samples selected: ${wizardPrimaryIds.length}`);
      lines.push('');
      lines.push('Types and processing:');

      wizardTypes.forEach(t => {
        const key = normalizeTypeKey(t);
        lines.push(`  - ${key}: ${wizardProcessingByType[key] || ''}`);
      });

      lines.push('');
      lines.push(
        'Naming rule: ' +
          (wizardNamingRule === 'parent-type'
            ? 'ParentID-TYPE'
            : `Custom: ${wizardCustomTemplate}`)
      );
      lines.push('');
      lines.push('Example IDs (first primary sample):');

      try {
        if (wizardPrimaryIds.length > 0) {
          const firstId = wizardPrimaryIds[0];
          const r = queryAll(
            'SELECT sample_id FROM samples WHERE id = ? LIMIT 1;',
            [firstId]
          )[0];

          if (r && r.sample_id) {
            const parentSid = r.sample_id;

            wizardTypes.forEach(t => {
              const abbrev = getTypeAbbrev(t);
              if (!abbrev) return;

              let exampleId;
              if (wizardNamingRule === 'parent-type') {
                exampleId = `${parentSid}-${abbrev}`;
              } else {
                exampleId = wizardCustomTemplate
                  .replace(/\{parent\}/g, parentSid)
                  .replace(/\{type\}/g, abbrev)
                  .replace(/\{n\}/g, '1');
              }

              lines.push(`  · ${exampleId}`);
            });
          }
        }
      } catch (err) {
        // ignore
      }

      if (summaryDiv) {
        summaryDiv.textContent = lines.join('\n');
      }

      showWizardStep(4);
    });
  }

  const prev4 = document.getElementById('wizard-prev-4');
  if (prev4) {
    prev4.addEventListener('click', () => {
      showWizardStep(3);
    });
  }

  const generateBtn = document.getElementById('wizard-generate');
  if (generateBtn) {
    generateBtn.addEventListener('click', () => {
      if (!appState.db) return;
      if (wizardPrimaryIds.length === 0 || wizardTypes.length === 0) {
        alert('No primary samples or types in wizard.');
        return;
      }

      const today = getTodayYMD();

      appState.db.run('BEGIN TRANSACTION;');

      try {
        const insertStmt = appState.db.prepare(`
          INSERT INTO samples
            (sample_id, date, experiment_label, species_genotype, model, tissue,
             sample_type, notes, processing, parent_sample_id, amount, project, status, box_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
        `);

        wizardPrimaryIds.forEach(pid => {
          const row = queryAll('SELECT * FROM samples WHERE id = ? LIMIT 1;', [pid])[0];
          if (!row) return;

          wizardTypes.forEach(t => {
            const key = normalizeTypeKey(t);
            const processing = wizardProcessingByType[key] || '';
            const abbrev = getTypeAbbrev(key);
            if (!abbrev) return;

            const parentSid = row.sample_id || '';
            if (!parentSid) return;

            const newSid = generateUniqueChildSampleId(parentSid, abbrev);

            insertStmt.run([
              newSid,
              today,
              row.experiment_label || '',
              row.species_genotype || '',
              row.model || '',
              row.tissue || '',
              key,
              row.notes || '',
              processing,
              row.id,
              null,
              row.project || '',
              'available',
              null,
            ]);
          });
        });

        insertStmt.free();
        appState.db.run('COMMIT;');

        if (typeof makeDbDirty === 'function') {
          makeDbDirty();
        }

        if (typeof refreshAllViews === 'function') {
          refreshAllViews();
        }

        closeWizard();
        alert('Secondary samples generated.');
      } catch (err) {
        try {
          appState.db.run('ROLLBACK;');
        } catch (_) {
          // ignore
        }

        alert('Error while generating secondary samples: ' + err);
      }
    });
  }
}