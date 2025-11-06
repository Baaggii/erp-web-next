import formatTimestamp from './formatTimestamp.js';
import normalizeDateInput from './normalizeDateInput.js';

export default function formatSqlValue(val, type = '') {
  const t = (type || '').toLowerCase();
  if (t === 'date') {
    const d = val instanceof Date ? val : new Date(val);
    if (!Number.isNaN(d.getTime())) {
      const normalized = normalizeDateInput(formatTimestamp(d), 'YYYY-MM-DD');
      return `'${normalized}'`;
    }
    const normalized = normalizeDateInput(String(val), 'YYYY-MM-DD');
    return `'${normalized.slice(0, 10).replace(/'/g, "''")}'`;
  }
  const stringTypes = [
    'char',
    'varchar',
    'text',
    'enum',
    'set',
    'datetime',
    'timestamp',
    'time',
  ];
  if (stringTypes.includes(t)) {
    return `'${String(val).replace(/'/g, "''")}'`;
  }
  return val;
}
