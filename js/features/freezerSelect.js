import { FREEZER_LIST_PREFIX } from '../config.js';
import { queryAll } from '../db/query.js';
import { normalizeFreezerName } from '../utils/string.js';

function freezerListKey(temp) {
  const t = String(temp || '').trim();
  return FREEZER_LIST_PREFIX + (t || '__NONE__');
}

function loadFreezerListByTemp(temp) {
  try {
    const raw = localStorage.getItem(freezerListKey(temp));
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function saveFreezerListByTemp(temp, list) {
  localStorage.setItem(freezerListKey(temp), JSON.stringify(list || []));
}

export function addFreezerToListByTemp(temp, name) {
  const t = String(temp || '').trim();
  if (!t) return false;

  const n = normalizeFreezerName(name);
  if (!n) return false;

  const list = loadFreezerListByTemp(t);
  const exists = list.some(x => String(x).toLowerCase() === n.toLowerCase());

  if (!exists) {
    list.push(n);
    list.sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
    saveFreezerListByTemp(t, list);
  }

  return true;
}

function getAllFreezerOptionsByTemp(temp) {
  const t = String(temp || '').trim();
  if (!t) return [];

  const fromLS = loadFreezerListByTemp(t);

  const fromDb = queryAll(
    `
      SELECT DISTINCT freezer_no
      FROM boxes
      WHERE storage_temperature = ?
        AND freezer_no IS NOT NULL
        AND freezer_no != ""
    `,
    [t]
  )
    .map(r => String(r.freezer_no || '').trim())
    .filter(Boolean);

  const map = new Map();

  [...fromLS, ...fromDb].forEach(v => {
    const key = v.toLowerCase();
    if (!map.has(key)) {
      map.set(key, v);
    }
  });

  return Array.from(map.values()).sort((a, b) =>
    a.localeCompare(b, 'en', { numeric: true })
  );
}

function fillFreezerSelectByTemp(selectEl, currentValue, tempEl) {
  if (!selectEl) return;

  const tempVal = String(tempEl?.value || '').trim();
  const cur = normalizeFreezerName(currentValue);

  selectEl.innerHTML = '';

  if (!tempVal) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = '(select temperature first)';
    selectEl.appendChild(opt);
    selectEl.value = '';
    selectEl.disabled = true;
    return;
  }

  selectEl.disabled = false;

  const options = getAllFreezerOptionsByTemp(tempVal);

  const opt0 = document.createElement('option');
  opt0.value = '';
  opt0.textContent = '(select)';
  selectEl.appendChild(opt0);

  options.forEach(v => {
    const o = document.createElement('option');
    o.value = v;
    o.textContent = v;

    if (cur && v.toLowerCase() === cur.toLowerCase()) {
      o.selected = true;
    }

    selectEl.appendChild(o);
  });

  const addOpt = document.createElement('option');
  addOpt.value = '__add__';
  addOpt.textContent = '+ Add new…';
  selectEl.appendChild(addOpt);

  if (cur && !options.some(v => v.toLowerCase() === cur.toLowerCase())) {
    selectEl.value = '__add__';
  }
}

export function refreshFreezerMenus() {
  const mainTemp = document.getElementById('storage_temperature');
  const batchTemp = document.getElementById('batch-storage-temperature');

  const mainSel = document.getElementById('freezer_no');
  const batchSel = document.getElementById('batch-freezer-no');

  const mainCur = mainSel ? mainSel.value : '';
  const batchCur = batchSel ? batchSel.value : '';

  fillFreezerSelectByTemp(mainSel, mainCur, mainTemp);
  fillFreezerSelectByTemp(batchSel, batchCur, batchTemp);

  const mainWrap = document.getElementById('freezer-no-add-wrap');
  if (mainSel && mainWrap) {
    mainWrap.classList.toggle(
      'hidden',
      mainSel.value !== '__add__' || mainSel.disabled
    );
  }

  const batchWrap = document.getElementById('batch-freezer-no-add-wrap');
  if (batchSel && batchWrap) {
    batchWrap.classList.toggle(
      'hidden',
      batchSel.value !== '__add__' || batchSel.disabled
    );
  }
}

export function getFreezerNoFromUI() {
  const sel = document.getElementById('freezer_no');
  if (!sel) return '';

  if (sel.value === '__add__') {
    return normalizeFreezerName(
      document.getElementById('freezer_no_new')?.value
    );
  }

  return normalizeFreezerName(sel.value);
}

export function getBatchFreezerNoFromUI() {
  const sel = document.getElementById('batch-freezer-no');
  if (!sel) return '';

  if (sel.value === '__add__') {
    return normalizeFreezerName(
      document.getElementById('batch-freezer-no-new')?.value
    );
  }

  return normalizeFreezerName(sel.value);
}