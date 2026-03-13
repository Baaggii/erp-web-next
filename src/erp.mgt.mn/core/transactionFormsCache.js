let formsCache = null;
let formsPromise = null;

async function cachedFetch(url) {
  const res = await fetch(url, { credentials: 'include', skipLoader: true, skipErrorToast: true });
  if (!res.ok) return {};
  return res.json().catch(() => ({}));
}

export async function getTransactionForms(_params) {
  if (formsCache) return formsCache;
  if (formsPromise) return formsPromise;

  formsPromise = cachedFetch('/api/transaction_forms')
    .then((data) => {
      formsCache = data && typeof data === 'object' ? data : {};
      return formsCache;
    })
    .finally(() => {
      formsPromise = null;
    });

  return formsPromise;
}

export function clearTransactionFormsCache() {
  formsCache = null;
  formsPromise = null;
}
