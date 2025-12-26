function normalizeStringValue(value = '', primaryTableName = '') {
  const trimmed = value.trim();
  if (!trimmed) return { table: '', column: '', raw: '' };
  const envMatch = trimmed.match(/^\{\{\s*([A-Z0-9_]+)\s*\}\}$/i);
  if (envMatch) {
    return {
      table: '',
      column: '',
      raw: trimmed,
      type: 'env',
      envVar: envMatch[1],
      value: envMatch[1],
    };
  }
  const parts = trimmed.split('.');
  if (parts.length > 1) {
    const [first, ...rest] = parts;
    if (/^[a-zA-Z0-9_]+$/.test(first)) {
      const normalizedPrimary = typeof primaryTableName === 'string' ? primaryTableName.trim() : '';
      if (normalizedPrimary && first === normalizedPrimary) {
        return { table: '', column: rest.join('.'), raw: trimmed, type: 'column' };
      }
      return { table: first, column: rest.join('.'), raw: trimmed, type: 'column' };
    }
  }
  return { table: '', column: trimmed, raw: trimmed, type: 'column' };
}

export function parseFieldSource(value = '', primaryTableName = '') {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const table = typeof value.table === 'string' ? value.table.trim() : '';
    const column = typeof value.column === 'string' ? value.column.trim() : '';
    const type = typeof value.type === 'string'
      ? value.type
      : value.envVar
        ? 'env'
        : value.sessionVar
          ? 'session'
          : value.expression
            ? 'expression'
            : value.value
              ? 'literal'
              : 'column';
    const literal = typeof value.value === 'string' ? value.value.trim() : '';
    const envVar = typeof value.envVar === 'string' ? value.envVar.trim() : '';
    const sessionVar = typeof value.sessionVar === 'string' ? value.sessionVar.trim() : '';
    const expression = typeof value.expression === 'string' ? value.expression.trim() : '';
    const raw = column || literal || envVar || sessionVar || expression || table;
    return {
      table,
      column: column || (type === 'literal' ? literal : ''),
      raw,
      type,
      envVar,
      sessionVar,
      expression,
      value: literal || envVar || sessionVar || expression,
    };
  }
  if (typeof value !== 'string') {
    return { table: '', column: '', raw: value ? String(value) : '' };
  }
  return normalizeStringValue(value, primaryTableName);
}

export function buildFieldSource(tableName, columnName) {
  const tablePart = typeof tableName === 'string' ? tableName.trim() : '';
  const columnPart = typeof columnName === 'string' ? columnName.trim() : '';
  if (!columnPart) return '';
  if (!tablePart) return columnPart;
  return `${tablePart}.${columnPart}`;
}

export function normalizeMappingSelection(value, primaryTableName = '') {
  const parsed = parseFieldSource(value, primaryTableName);
  const type = parsed.type || 'column';
  if (type === 'literal') {
    return { type, value: parsed.value ?? parsed.column ?? '' };
  }
  if (type === 'env') {
    return { type, envVar: parsed.envVar || parsed.value || parsed.raw };
  }
  if (type === 'session') {
    return { type, sessionVar: parsed.sessionVar || parsed.value || parsed.raw };
  }
  if (type === 'expression') {
    return { type, expression: parsed.expression || parsed.value || parsed.raw };
  }
  return {
    type: 'column',
    table: parsed.table,
    column: parsed.column || parsed.value || '',
  };
}

export function buildMappingValue(selection = {}, { preserveType = false } = {}) {
  const type = selection.type || 'column';
  if (type === 'literal') {
    const literal = selection.value ?? selection.literal ?? '';
    const trimmed = `${literal}`.trim();
    if (!trimmed && !preserveType) return '';
    return { type: 'literal', value: String(trimmed) };
  }
  if (type === 'env') {
    const envVar = selection.envVar || selection.value || '';
    const trimmed = typeof envVar === 'string' ? envVar.trim() : envVar;
    if (!trimmed && !preserveType) return '';
    return { type: 'env', envVar: trimmed || '' };
  }
  if (type === 'session') {
    const sessionVar = selection.sessionVar || selection.value || '';
    const trimmed = typeof sessionVar === 'string' ? sessionVar.trim() : sessionVar;
    if (!trimmed && !preserveType) return '';
    return { type: 'session', sessionVar: trimmed || '' };
  }
  if (type === 'expression') {
    const expression = selection.expression || selection.value || '';
    const trimmed = typeof expression === 'string' ? expression.trim() : expression;
    if (!trimmed && !preserveType) return '';
    return { type: 'expression', expression: trimmed || '' };
  }
  const table = typeof selection.table === 'string' ? selection.table.trim() : '';
  const column = typeof selection.column === 'string' ? selection.column.trim() : '';
  if (!column && !table && !preserveType) return '';
  if (column) {
    return buildFieldSource(table, column || selection.value || '');
  }
  return { type: 'column', table, column: column || selection.value || '' };
}
