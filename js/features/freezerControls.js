import { normalizeFreezerName } from '../utils/string.js';
import {
  addFreezerToListByTemp,
  refreshFreezerMenus,
} from './freezerSelect.js';

export function bindFreezerControlEvents() {
  bindMainFreezerControls();
  bindBatchFreezerControls();
}

function bindMainFreezerControls() {
  const freezerSel = document.getElementById('freezer_no');
  if (freezerSel) {
    freezerSel.addEventListener('change', () => {
      const wrap = document.getElementById('freezer-no-add-wrap');
      if (wrap) {
        wrap.classList.toggle('hidden', freezerSel.value !== '__add__');
      }
    });
  }

  const tempSel = document.getElementById('storage_temperature');
  if (tempSel) {
    tempSel.addEventListener('change', refreshFreezerMenus);
  }

  const btnAddFreezer = document.getElementById('btn-add-freezer');
  if (btnAddFreezer) {
    btnAddFreezer.addEventListener('click', () => {
      const tempVal = (document.getElementById('storage_temperature')?.value || '').trim();
      if (!tempVal) {
        alert('Please choose storage temperature first.');
        return;
      }

      const val = normalizeFreezerName(
        document.getElementById('freezer_no_new')?.value
      );
      if (!val) {
        alert('Please input a freezer name.');
        return;
      }

      addFreezerToListByTemp(tempVal, val);
      refreshFreezerMenus();

      const sel = document.getElementById('freezer_no');
      if (sel) sel.value = val;

      const wrap = document.getElementById('freezer-no-add-wrap');
      if (wrap) wrap.classList.add('hidden');
    });
  }
}

function bindBatchFreezerControls() {
  const batchFreezerSel = document.getElementById('batch-freezer-no');
  if (batchFreezerSel) {
    batchFreezerSel.addEventListener('change', () => {
      const wrap = document.getElementById('batch-freezer-no-add-wrap');
      if (wrap) {
        wrap.classList.toggle('hidden', batchFreezerSel.value !== '__add__');
      }
    });
  }

  const batchTempSel = document.getElementById('batch-storage-temperature');
  if (batchTempSel) {
    batchTempSel.addEventListener('change', refreshFreezerMenus);
  }

  const btnBatchAddFreezer = document.getElementById('btn-batch-add-freezer');
  if (btnBatchAddFreezer) {
    btnBatchAddFreezer.addEventListener('click', () => {
      const tempVal = (document.getElementById('batch-storage-temperature')?.value || '').trim();
      if (!tempVal) {
        alert('Please choose storage temperature first.');
        return;
      }

      const val = normalizeFreezerName(
        document.getElementById('batch-freezer-no-new')?.value
      );
      if (!val) {
        alert('Please input a freezer name.');
        return;
      }

      addFreezerToListByTemp(tempVal, val);
      refreshFreezerMenus();

      const sel = document.getElementById('batch-freezer-no');
      if (sel) sel.value = val;

      const wrap = document.getElementById('batch-freezer-no-add-wrap');
      if (wrap) wrap.classList.add('hidden');
    });
  }
}