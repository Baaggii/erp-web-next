export default function formatSqlValue(val, type = '') {
  const t = (type || '').toLowerCase();
  const stringTypes = [
    'char',
    'varchar',
    'text',
    'enum',
    'set',
    'date',
    'datetime',
    'timestamp',
    'time',
  ];
  if (stringTypes.includes(t)) {
    return `'${String(val).replace(/'/g, "''")}'`;
  }
  return val;
}
