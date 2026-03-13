import { cachedFetch } from './apiCache.js';

export async function fetchTransactionForms(filters = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    const normalized = String(value).trim();
    if (!normalized) return;
    params.set(key, normalized);
  });
  const query = params.toString();
  return cachedFetch(`/api/transaction_forms${query ? `?${query}` : ''}`);
}

export function filterFormsByModule(forms, moduleKey) {
  if (!forms || typeof forms !== 'object') return {};
  const result = {};
  Object.entries(forms).forEach(([name, config]) => {
    if (name === 'isDefault') return;
    if (!config || typeof config !== 'object') return;
    if (moduleKey && config.moduleKey !== moduleKey) return;
    result[name] = config;
  });
  return result;
}
