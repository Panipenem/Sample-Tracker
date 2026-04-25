// js/features/sampleSelection.js

export function bindSampleSelectionEvents() {
  enableShiftSelect('.sample-select');
  enableShiftSelect('.archived-select');

  bindSelectAll({
    selectAllId: 'select-all-samples',
    checkboxSelector: '.sample-select',
  });

  bindSelectAll({
    selectAllId: 'select-all-archived',
    checkboxSelector: '.archived-select',
  });

  bindRowHighlightOnChange();
}

function enableShiftSelect(selector) {
  let lastChecked = null;

  document.addEventListener('click', event => {
    const target = event.target;

    if (!(target instanceof HTMLInputElement)) return;
    if (!target.matches(selector)) return;

    const checkboxes = Array.from(document.querySelectorAll(selector));
    const currentIndex = checkboxes.indexOf(target);

    if (event.shiftKey && lastChecked !== null) {
      const lastIndex = checkboxes.indexOf(lastChecked);
      const [start, end] = [lastIndex, currentIndex].sort((a, b) => a - b);
      const newState = target.checked;

      for (let i = start; i <= end; i++) {
        const cb = checkboxes[i];
        cb.checked = newState;

        const tr = cb.closest('tr');
        if (tr) {
          tr.classList.toggle('row-selected', newState);
        }
      }
    }

    lastChecked = target;
  });
}

function bindSelectAll({ selectAllId, checkboxSelector }) {
  const selectAll = document.getElementById(selectAllId);
  if (!selectAll) return;

  selectAll.addEventListener('change', () => {
    const checked = selectAll.checked;

    document.querySelectorAll(checkboxSelector).forEach(cb => {
      cb.checked = checked;

      const tr = cb.closest('tr');
      if (tr) {
        tr.classList.toggle('row-selected', checked);
      }
    });
  });
}

function bindRowHighlightOnChange() {
  document.addEventListener('change', event => {
    const target = event.target;

    if (!(target instanceof HTMLInputElement)) return;
    if (!target.matches('.sample-select, .archived-select')) return;

    const tr = target.closest('tr');
    if (tr) {
      tr.classList.toggle('row-selected', target.checked);
    }
  });
}