const CACHE_TTL_MS = 60 * 1000;

const codeTransactionCache = {
  rows: null,
  fetchedAt: 0,
  promise: null,
};

const employmentCache = new Map();

function isFresh(timestamp) {
  return Date.now() - Number(timestamp || 0) < CACHE_TTL_MS;
}

export async function getCodeTransactionRows() {
  if (Array.isArray(codeTransactionCache.rows) && isFresh(codeTransactionCache.fetchedAt)) {
    return codeTransactionCache.rows;
  }
  if (codeTransactionCache.promise) {
    return codeTransactionCache.promise;
  }

  codeTransactionCache.promise = fetch('/api/tables/code_transaction?perPage=500', {
    credentials: 'include',
    skipErrorToast: true,
    skipLoader: true,
  })
    .then((res) => (res.ok ? res.json() : { rows: [] }))
    .then((data) => {
      const rows = Array.isArray(data?.rows) ? data.rows : [];
      codeTransactionCache.rows = rows;
      codeTransactionCache.fetchedAt = Date.now();
      return rows;
    })
    .catch(() => {
      codeTransactionCache.rows = [];
      codeTransactionCache.fetchedAt = Date.now();
      return [];
    })
    .finally(() => {
      codeTransactionCache.promise = null;
    });

  return codeTransactionCache.promise;
}

export async function getEmploymentRows(companyId) {
  const normalizedCompanyId = String(companyId || '').trim();
  if (!normalizedCompanyId) return [];

  const cacheKey = normalizedCompanyId;
  const existing = employmentCache.get(cacheKey);
  if (existing?.rows && isFresh(existing.fetchedAt)) {
    return existing.rows;
  }
  if (existing?.promise) {
    return existing.promise;
  }

  const params = new URLSearchParams({ perPage: '1000', company_id: normalizedCompanyId });
  const promise = fetch(`/api/tables/tbl_employment?${params.toString()}`, {
    credentials: 'include',
    skipErrorToast: true,
    skipLoader: true,
  })
    .then((res) => (res.ok ? res.json() : { rows: [] }))
    .then((data) => {
      const rows = Array.isArray(data?.rows) ? data.rows : Array.isArray(data) ? data : [];
      employmentCache.set(cacheKey, { rows, fetchedAt: Date.now(), promise: null });
      return rows;
    })
    .catch(() => {
      employmentCache.set(cacheKey, { rows: [], fetchedAt: Date.now(), promise: null });
      return [];
    });

  employmentCache.set(cacheKey, {
    rows: existing?.rows || null,
    fetchedAt: existing?.fetchedAt || 0,
    promise,
  });

  return promise;
}

