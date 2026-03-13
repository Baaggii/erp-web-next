import { cachedFetch } from './apiCache.js';

let formsCache = null;

export async function getTransactionForms() {
  if (formsCache) return formsCache;

  formsCache = await cachedFetch('/api/transaction_forms');

  return formsCache;
}

export function clearTransactionForms() {
  formsCache = null;
}
