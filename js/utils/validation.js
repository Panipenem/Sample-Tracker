export const VALID_SAMPLE_STATUSES = new Set([
  'available',
  'low',
  'retired',
  'archived',
  'discarded',
  'consumed',
  'deleted',
]);

export function isValidYmdDate(value) {
  if (!value) return true;
  if (!/^\d{8}$/.test(value)) return false;

  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(4, 6));
  const day = Number(value.slice(6, 8));
  const d = new Date(year, month - 1, day);

  return (
    d.getFullYear() === year &&
    d.getMonth() === month - 1 &&
    d.getDate() === day
  );
}

export function normalizeSampleStatus(value, fallback = 'available') {
  const status = String(value || '').trim().toLowerCase();
  if (!status) return fallback;
  return VALID_SAMPLE_STATUSES.has(status) ? status : fallback;
}

export function validateSampleInput(sample) {
  const errors = [];
  const warnings = [];

  if (!sample.sample_id) {
    errors.push('Sample ID is required.');
  }

  if (sample.date && !isValidYmdDate(sample.date)) {
    errors.push('Date must be a valid YYYYMMDD date.');
  }

  if (sample.status && !VALID_SAMPLE_STATUSES.has(String(sample.status).toLowerCase())) {
    errors.push(`Status is not supported: ${sample.status}`);
  }

  const hasAnyStorage =
    sample.storage_temperature ||
    sample.freezer_no ||
    sample.rack ||
    sample.box_label;

  if (hasAnyStorage && !sample.box_label) {
    warnings.push('Storage information is incomplete: box_label is missing.');
  }

  return { errors, warnings };
}
