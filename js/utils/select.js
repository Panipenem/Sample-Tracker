export function ensureSelectHasValue(selectEl, value, {
  labelPrefix = 'Custom: ',
  insertAfterEmpty = true,
} = {}) {
  if (!selectEl) return;
  const normalized = String(value || '').trim();

  if (!normalized) {
    selectEl.value = '';
    return;
  }

  const existing = Array.from(selectEl.options).find(
    opt => String(opt.value).trim() === normalized
  );

  if (existing) {
    selectEl.value = normalized;
    return;
  }

  const option = document.createElement('option');
  option.value = normalized;
  option.textContent = `${labelPrefix}${normalized}`;
  option.dataset.dynamic = 'true';

  if (insertAfterEmpty && selectEl.options.length > 0) {
    selectEl.insertBefore(option, selectEl.options[1] || null);
  } else {
    selectEl.appendChild(option);
  }

  selectEl.value = normalized;
}

export function clearDynamicOptions(selectEl) {
  if (!selectEl) return;

  Array.from(selectEl.options).forEach(opt => {
    if (opt.dataset.dynamic === 'true') {
      opt.remove();
    }
  });
}