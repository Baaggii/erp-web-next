import formatTimestamp from './formatTimestamp.js';

export default function normalizeDateInput(value, format) {
  if (typeof value !== 'string') return value;
  let v = value.trim().replace(/^(\d{4})[.,](\d{2})[.,](\d{2})/, '$1-$2-$3');
  if (/^\d{4}-\d{2}-\d{2}T/.test(v) && !isNaN(Date.parse(v))) {
    const local = formatTimestamp(new Date(v));
    return format === 'HH:MM:SS' ? local.slice(11, 19) : local.slice(0, 10);
  }
  return v;
}
