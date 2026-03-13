import { cachedFetch } from './apiCache.js';

let formsCache = null;

export async function getTransactionForms() {
  if (formsCache) return formsCache;

  formsCache = await cachedFetch('/api/transaction_forms');

  return formsCache;
}

export function buildTransactionFormIndex(data) {
  const byTable = {};
  const names = [];
  const mapping = {};
  const fields = {};

  if (!data || typeof data !== 'object') {
    return { byTable, names, mapping, fields };
  }

  for (const [name, info] of Object.entries(data)) {
    if (name === 'isDefault' || !info || typeof info !== 'object') continue;
    const table = info.table;
    if (!table) continue;
    mapping[name] = table;
    names.push(name);
    fields[name] = Array.isArray(info.visibleFields) ? info.visibleFields : [];
    if (!byTable[table]) byTable[table] = [];
    byTable[table].push(name);
  }

  return { byTable, names, mapping, fields };
}

export function filterTransactionFormsByModule(data, moduleKey) {
  const filtered = {};
  if (!data || typeof data !== 'object') return filtered;

  Object.entries(data).forEach(([name, info]) => {
    if (name === 'isDefault' || !info || typeof info !== 'object') return;
    if (info.moduleKey !== moduleKey) return;
    filtered[name] = info;
  });

  return filtered;
}

export function clearTransactionForms() {
  formsCache = null;
}
