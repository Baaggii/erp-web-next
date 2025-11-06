import formatTimestamp from './formatTimestamp.js';

export function replaceDateSeparators(value) {
  if (typeof value !== 'string') return value;
  return value.replace(/[.,/]/g, '-');
}

export function extractDateParts(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  if (/^\d{4}-\d{2}-\d{2}[T\s]/.test(trimmed)) {
    const parsed = new Date(trimmed.replace(' ', 'T'));
    if (!Number.isNaN(parsed.getTime())) {
      const [yyyy, mm, dd] = formatTimestamp(parsed).slice(0, 10).split('-');
      return { year: yyyy, month: mm, day: dd };
    }
  }

  const sanitized = replaceDateSeparators(trimmed);
  const hyphenMatch = sanitized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (hyphenMatch) {
    const [, yyyy, mm, dd] = hyphenMatch;
    return {
      year: yyyy,
      month: mm.padStart(2, '0'),
      day: dd.padStart(2, '0'),
    };
  }

  const compactMatch = sanitized.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compactMatch) {
    const [, yyyy, mm, dd] = compactMatch;
    return { year: yyyy, month: mm, day: dd };
  }

  return null;
}

export function isExistingDate(value) {
  if (!value) return false;
  const parts = extractDateParts(value);
  if (!parts) return false;
  const year = Number(parts.year);
  const month = Number(parts.month);
  const day = Number(parts.day);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return false;
  }
  const utc = new Date(Date.UTC(year, month - 1, day));
  return (
    utc.getUTCFullYear() === year &&
    utc.getUTCMonth() + 1 === month &&
    utc.getUTCDate() === day
  );
}

export function formatDateDisplay(value) {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) {
    const [datePart, timePart] = formatTimestamp(value).split(' ');
    const dotted = datePart.replace(/-/g, '.');
    return timePart ? `${dotted} ${timePart}` : dotted;
  }
  const str = String(value);
  const trimmed = str.trim();
  if (!trimmed) return '';
  if (/^\d{4}-\d{2}-\d{2}[T\s]/.test(trimmed) && !Number.isNaN(Date.parse(trimmed.replace(' ', 'T')))) {
    const formatted = formatTimestamp(new Date(trimmed.replace(' ', 'T')));
    const [datePart, timePart] = formatted.split(' ');
    const dotted = datePart.replace(/-/g, '.');
    return timePart ? `${dotted} ${timePart}` : dotted;
  }
  const parts = extractDateParts(trimmed);
  if (parts) {
    return `${parts.year}.${parts.month}.${parts.day}`;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed.replace(/-/g, '.');
  }
  return trimmed;
}

export default function normalizeDateInput(value, format, options = {}) {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (format === 'YYYY-MM-DD') {
    const parts = extractDateParts(trimmed);
    if (parts) {
      const sep = options.separator === '.' ? '.' : '-';
      return `${parts.year}${sep}${parts.month}${sep}${parts.day}`;
    }
    return replaceDateSeparators(trimmed);
  }
  if (format === 'HH:MM:SS') {
    if (/^\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2}/.test(trimmed)) {
      const formatted = formatTimestamp(new Date(trimmed.replace(' ', 'T')));
      return formatted.slice(11, 19);
    }
    return trimmed.replace(',', '.');
  }
  if (/^\d{4}-\d{2}-\d{2}T/.test(trimmed) && !Number.isNaN(Date.parse(trimmed))) {
    const formatted = formatTimestamp(new Date(trimmed));
    const datePart = formatted.slice(0, 10);
    const sep = options.separator === '.' ? '.' : '-';
    return sep === '.' ? datePart.replace(/-/g, '.') : datePart;
  }
  return trimmed;
}
