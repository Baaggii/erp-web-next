const cacheStore = new Map();
const tagIndex = new Map();

function now() {
  return Date.now();
}

function keyToString(parts = []) {
  return parts
    .map((part) => {
      if (part === undefined || part === null) return '';
      if (typeof part === 'string') return part;
      return JSON.stringify(part);
    })
    .join('::');
}

function addTagRef(tag, key) {
  if (!tag) return;
  if (!tagIndex.has(tag)) tagIndex.set(tag, new Set());
  tagIndex.get(tag).add(key);
}

export function setCachedValue(keyParts, value, { ttlMs = 30_000, tags = [] } = {}) {
  const key = keyToString(keyParts);
  const expiresAt = now() + Math.max(1_000, Number(ttlMs) || 30_000);
  const normalizedTags = Array.isArray(tags) ? Array.from(new Set(tags.filter(Boolean))) : [];
  cacheStore.set(key, { value, expiresAt, tags: normalizedTags });
  normalizedTags.forEach((tag) => addTagRef(tag, key));
  return value;
}

export function getCachedValue(keyParts) {
  const key = keyToString(keyParts);
  const entry = cacheStore.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= now()) {
    cacheStore.delete(key);
    return null;
  }
  return entry.value;
}

export function withCache(keyParts, factory, options = {}) {
  const hit = getCachedValue(keyParts);
  if (hit !== null) return Promise.resolve(hit);
  return Promise.resolve(factory()).then((value) => setCachedValue(keyParts, value, options));
}

export function invalidateTags(tags = []) {
  const normalizedTags = Array.isArray(tags) ? tags.filter(Boolean) : [];
  normalizedTags.forEach((tag) => {
    const keys = tagIndex.get(tag);
    if (!keys) return;
    keys.forEach((key) => cacheStore.delete(key));
    tagIndex.delete(tag);
  });
}

export function invalidateByMutationPath(pathname = '') {
  const path = String(pathname || '').toLowerCase();
  const tags = new Set();

  if (path.includes('/api/transaction_forms')) {
    tags.add('bootstrap');
    tags.add('forms:meta');
    tags.add('page:dashboard');
  }
  if (path.includes('/api/display_fields')) {
    tags.add('display_fields');
    tags.add('relations');
  }
  if (path.includes('/api/permissions')) {
    tags.add('bootstrap');
    tags.add('permissions');
  }
  if (path.includes('/api/company_modules')) {
    tags.add('bootstrap');
    tags.add('modules');
  }
  if (path.includes('/api/general_config') || path.includes('/api/config')) {
    tags.add('bootstrap');
    tags.add('forms:meta');
    tags.add('reports');
  }
  if (path.includes('/api/tenant_tables')) {
    tags.add('bootstrap');
    tags.add('tables');
  }
  if (path.includes('/api/report_procedures') || path.includes('/api/report_access')) {
    tags.add('reports');
    tags.add('page:dashboard');
  }
  if (/\/api\/tables\/[^/]+($|\/)/.test(path)) {
    tags.add('tables');
    tags.add('relations');
  }

  if (tags.size > 0) {
    invalidateTags(Array.from(tags));
  }
}
