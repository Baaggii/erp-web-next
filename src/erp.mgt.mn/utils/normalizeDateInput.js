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
    const d = new Date(v);
    const yyyy = String(d.getFullYear()).padStart(4, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    const ss = String(d.getSeconds()).padStart(2, '0');
    if (format === 'HH:MM:SS') return `${hh}:${mi}:${ss}`;
    return `${yyyy}-${mm}-${dd}`;
  }

  return v;
}
