import { DATA_ENTRY_SAMPLE_TYPES } from '../db/sampleTypes.js';
import { clearDynamicOptions } from '../utils/select.js';

export function initSampleTypeSelect() {
  const selectEl = document.getElementById('sample_type');
  if (!selectEl) return;

  clearDynamicOptions(selectEl);
  selectEl.innerHTML = '';

  const emptyOpt = document.createElement('option');
  emptyOpt.value = '';
  emptyOpt.textContent = '(select)';
  selectEl.appendChild(emptyOpt);

  DATA_ENTRY_SAMPLE_TYPES.forEach(type => {
    const opt = document.createElement('option');
    opt.value = type;
    opt.textContent = type;
    selectEl.appendChild(opt);
  });
}