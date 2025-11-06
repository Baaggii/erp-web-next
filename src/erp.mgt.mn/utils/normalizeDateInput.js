import formatTimestamp from './formatTimestamp.js';

const DATE_WITH_SEPARATORS = /^(\d{4})[-.,/](\d{1,2})[-.,/](\d{1,2})$/;

export default function normalizeDateInput(value, format) {
  if (typeof value !== 'string') return value;
  let v = value.trim();

  if (format === 'YYYY-MM-DD') {
    v = v.replace(/[.,]/g, '-');
    const match = v.match(DATE_WITH_SEPARATORS);
    if (match) {
      const [, year, month, day] = match;
      const paddedMonth = month.padStart(2, '0');
      const paddedDay = day.padStart(2, '0');
      v = `${year.padStart(4, '0')}-${paddedMonth}-${paddedDay}`;
    }
  } else {
    v = v.replace(/^(\d{4})[.,](\d{2})[.,](\d{2})/, '$1-$2-$3');
  }

  if (/^\d{4}-\d{2}-\d{2}T/.test(v) && !isNaN(Date.parse(v))) {
    const local = formatTimestamp(new Date(v));
    return format === 'HH:MM:SS' ? local.slice(11, 19) : local.slice(0, 10);
  }

  return v;
}
