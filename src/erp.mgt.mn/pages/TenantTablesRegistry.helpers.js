export function applyTableFieldChange(row, field, value) {
  if (!row || typeof row !== 'object') {
    return row;
  }
  if (field === 'seedOnCreate') {
    if (value) {
      return { ...row, seedOnCreate: true, isShared: false };
    }
    return { ...row, seedOnCreate: value };
  }
  if (field === 'isShared') {
    if (value && row.seedOnCreate) {
      return { ...row, isShared: value, seedOnCreate: false };
    }
    return { ...row, isShared: value };
  }
  return { ...row, [field]: value };
}

export function updateTablesWithChange(prevTables, idx, field, value) {
  if (!Array.isArray(prevTables)) {
    return prevTables;
  }
  return prevTables.map((row, i) => {
    if (i !== idx) {
      return row;
    }
    return applyTableFieldChange(row, field, value);
  });
}

export function buildRowIdentifier(row, primaryKeys) {
  if (!row || typeof row !== 'object') {
    return null;
  }
  if (!Array.isArray(primaryKeys) || primaryKeys.length === 0) {
    return null;
  }
  const parts = [];
  for (const key of primaryKeys) {
    if (!key) {
      return null;
    }
    const value = row[key];
    if (value === undefined || value === null) {
      return null;
    }
    parts.push(String(value));
  }
  return parts.join('-');
}
