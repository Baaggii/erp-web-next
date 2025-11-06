const DATE_PATTERN = /^(\d{4})[-./](\d{1,2})[-./](\d{1,2})(?:\s.*)?$/;
const ISO_PATTERN = /^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/;

function pad(value, length) {
  return String(value).padStart(length, '0');
}

export default function formatDateForDisplay(value) {
  if (value === null || value === undefined) return '';
  const str = String(value).trim();
  if (!str) return '';

  const isoMatch = str.match(ISO_PATTERN);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return `${pad(year, 4)}.${pad(month, 2)}.${pad(day, 2)}`;
  }

  const match = str.match(DATE_PATTERN);
  if (match) {
    const [, year, month, day] = match;
    return `${pad(year, 4)}.${pad(month, 2)}.${pad(day, 2)}`;
  }

  return str;
}
