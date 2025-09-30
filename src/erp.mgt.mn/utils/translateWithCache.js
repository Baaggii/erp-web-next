import {
  evaluateTranslationCandidate,
  buildValidationPrompt,
  summarizeHeuristic,
} from '../../../utils/translationValidation.js';

let nodeCache;
let nodeCachePath;
const localeCache = {};
let aiDisabled = false;

function normalizeMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object') return null;
  const normalized = {};
  for (const field of ['module', 'context', 'key']) {
    const value = metadata[field];
    if (value === undefined || value === null) continue;
    const str = typeof value === 'string' ? value.trim() : String(value).trim();
    if (str) normalized[field] = str;
  }
  return Object.keys(normalized).length ? normalized : null;
}

function buildPrompt(text, lang, metadata) {
  const rawText = text ?? '';
  const textStr = typeof rawText === 'string' ? rawText : String(rawText);
  if (!metadata) {
    return `Translate the following text to ${lang}: ${textStr}`;
  }
  const parts = [];
  if (metadata.module) parts.push(`Module: ${metadata.module}`);
  if (metadata.context) parts.push(`Context: ${metadata.context}`);
  if (metadata.key) parts.push(`Key: ${metadata.key}`);
  parts.push(`Text: ${textStr}`);
  return `Translate the following text to ${lang}.
${parts.join(', ')}`;
}

function buildCacheKeyParts(lang, base, metadata) {
  const baseKey = `${lang}|${base}`;
  if (!metadata) {
    return { primary: baseKey, all: [baseKey] };
  }
  const metaKey = `${baseKey}|${JSON.stringify(metadata)}`;
  return { primary: metaKey, all: [metaKey, baseKey] };
}

async function loadNodeCache() {
  if (nodeCache) return nodeCache;
  if (typeof process === 'undefined' || !process.versions?.node) {
    nodeCache = {};
    return nodeCache;
  }
  const fs = await import('fs/promises');
  const path = await import('path');
  nodeCachePath = path.join(process.cwd(), 'docs', 'manuals', 'translation-cache.json');
  try {
    const data = await fs.readFile(nodeCachePath, 'utf8');
    nodeCache = JSON.parse(data);
  } catch {
    nodeCache = {};
  }
  return nodeCache;
}

async function saveNodeCache() {
  if (!nodeCachePath) return;
  const fs = await import('fs/promises');
  const path = await import('path');
  await fs.mkdir(path.dirname(nodeCachePath), { recursive: true });
  await fs.writeFile(nodeCachePath, JSON.stringify(nodeCache, null, 2));
}

async function loadLocale(lang) {
  if (localeCache[lang]) return localeCache[lang];
  try {
    if (typeof process !== 'undefined' && process.versions?.node) {
      const fs = await import('fs/promises');
      const path = await import('path');
      const file = path.join(
        process.cwd(),
        'src',
        'erp.mgt.mn',
        'locales',
        `${lang}.json`,
      );
      const data = await fs.readFile(file, 'utf8');
      localeCache[lang] = JSON.parse(data);
    } else {
      localeCache[lang] = (
        await import(`../locales/${lang}.json`)
      ).default;
    }
  } catch {
    localeCache[lang] = {};
  }
  return localeCache[lang];
}

function getLS(key) {
  if (typeof localStorage === 'undefined') return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function setLS(key, val) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(key, val);
  } catch {}
}

let dbPromise;
function getDB() {
  if (typeof indexedDB === 'undefined') return null;
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const open = indexedDB.open('translation-cache', 1);
      open.onupgradeneeded = () => {
        open.result.createObjectStore('translations');
      };
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
  }
  return dbPromise;
}

async function idbGet(key) {
  const db = await getDB();
  if (!db) return null;
  return new Promise((resolve) => {
    const tx = db.transaction('translations', 'readonly');
    const store = tx.objectStore('translations');
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => resolve(null);
  });
}

async function idbSet(key, val) {
  const db = await getDB();
  if (!db) return;
  return new Promise((resolve) => {
    const tx = db.transaction('translations', 'readwrite');
    const store = tx.objectStore('translations');
    const req = store.put(val, key);
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
  });
}

async function requestTranslation(text, lang, metadata) {
  if (aiDisabled) return null;
  try {
    const prompt = buildPrompt(text, lang, metadata);
    const res = await fetch('/api/openai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt }),
      skipErrorToast: true,
      skipLoader: true,
    });
    if (res.status === 404) {
      aiDisabled = true;
      return null;
    }
    if (res.status === 429) {
      const err = new Error('rate limited');
      err.rateLimited = true;
      throw err;
    }
    if (!res.ok) throw new Error('openai request failed');
    const data = await res.json();
    return data.response?.trim() || null;
  } catch (err) {
    if (err.rateLimited) throw err;
    console.error('AI translation failed', err);
    return null;
  }
}

function describe(key) {
  const str = typeof key === 'string' ? key : String(key ?? '');
  return str
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function createResult(text, options = {}) {
  const rendered = typeof text === 'string' ? text : String(text ?? '');
  const baseText = options.base ?? rendered;
  return {
    text: rendered,
    base: typeof baseText === 'string' ? baseText : String(baseText ?? ''),
    source: options.source || 'unknown',
    fromCache: Boolean(options.fromCache),
    candidate: options.candidate ?? null,
    validation: options.validation ?? null,
    needsRetry: Boolean(options.needsRetry),
  };
}

function parseValidationText(raw) {
  if (!raw || typeof raw !== 'string') return null;
  try {
    return JSON.parse(raw);
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {
        return null;
      }
    }
  }
  return null;
}

async function requestValidationViaEndpoint(payload) {
  if (typeof fetch !== 'function') return null;
  try {
    const res = await fetch('/api/openai/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      skipErrorToast: true,
      skipLoader: true,
    });
    if (res.status === 404) {
      return { ok: false, status: 404 };
    }
    if (res.status === 429) {
      const err = new Error('rate limited');
      err.rateLimited = true;
      throw err;
    }
    if (!res.ok) {
      return { ok: false, status: res.status };
    }
    const data = await res.json();
    return { ok: true, ...data };
  } catch (err) {
    if (err.rateLimited) throw err;
    console.error('Validation endpoint request failed', err);
    return { ok: false, error: err };
  }
}

async function requestValidationViaPrompt(payload) {
  if (aiDisabled || typeof fetch !== 'function') return null;
  try {
    const prompt = buildValidationPrompt(payload);
    const res = await fetch('/api/openai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt }),
      skipErrorToast: true,
      skipLoader: true,
    });
    if (res.status === 404) {
      aiDisabled = true;
      return null;
    }
    if (res.status === 429) {
      const err = new Error('rate limited');
      err.rateLimited = true;
      throw err;
    }
    if (!res.ok) return null;
    const data = await res.json();
    const parsed = parseValidationText(data.response?.trim());
    if (!parsed) return null;
    return {
      ok: true,
      valid: Boolean(parsed.valid),
      reason: parsed.reason || '',
      needsRetry: parsed.valid ? false : true,
      languageConfidence: typeof parsed.languageConfidence === 'number'
        ? parsed.languageConfidence
        : null,
      source: 'prompt',
    };
  } catch (err) {
    if (err.rateLimited) throw err;
    console.error('Validation prompt request failed', err);
    return null;
  }
}

export async function validateAITranslation(candidate, base, lang, metadata) {
  const heuristics = evaluateTranslationCandidate({
    candidate,
    base,
    lang,
    metadata,
  });
  const summary = summarizeHeuristic(heuristics);
  const result = {
    valid: false,
    reason: '',
    needsRetry: false,
    heuristics,
    summary,
    attemptedRemote: false,
    remoteSource: null,
    languageConfidence: null,
  };

  if (heuristics.status === 'fail') {
    return {
      ...result,
      reason: heuristics.reasons[0] || 'failed_heuristics',
      needsRetry: false,
    };
  }

  if (heuristics.status === 'pass') {
    return {
      ...result,
      valid: true,
    };
  }

  const payload = { candidate, base, lang, metadata };
  const viaEndpoint = await requestValidationViaEndpoint(payload);
  if (viaEndpoint?.ok) {
    return {
      ...result,
      valid: Boolean(viaEndpoint.valid),
      reason: viaEndpoint.reason || '',
      needsRetry:
        typeof viaEndpoint.needsRetry === 'boolean'
          ? viaEndpoint.needsRetry
          : !viaEndpoint.valid,
      attemptedRemote: true,
      remoteSource: viaEndpoint.strategy || viaEndpoint.source || 'api',
      languageConfidence: viaEndpoint.languageConfidence ?? null,
    };
  }

  if (viaEndpoint && viaEndpoint.status === 404) {
    const viaPrompt = await requestValidationViaPrompt(payload);
    if (viaPrompt?.ok) {
      return {
        ...result,
        valid: Boolean(viaPrompt.valid),
        reason: viaPrompt.reason || '',
        needsRetry: Boolean(viaPrompt.needsRetry),
        attemptedRemote: true,
        remoteSource: viaPrompt.source,
        languageConfidence: viaPrompt.languageConfidence,
      };
    }
  }

  return {
    ...result,
    reason:
      heuristics.reasons[0] ||
      (viaEndpoint?.status ? `validation_http_${viaEndpoint.status}` : 'validation_unavailable'),
    needsRetry: true,
    attemptedRemote: Boolean(viaEndpoint),
    remoteSource: viaEndpoint?.status ? `status_${viaEndpoint.status}` : null,
  };
}

export default async function translateWithCache(lang, key, fallback, metadata) {
  const locales = await loadLocale(lang);
  const enLocales = await loadLocale('en');
  const baseCandidate = enLocales[key] || fallback || describe(key);
  const base =
    typeof baseCandidate === 'string' ? baseCandidate : String(baseCandidate ?? '');

  if (lang === 'en') {
    return createResult(base, { base, source: 'base', fromCache: true });
  }

  const direct = locales[key];
  const normalizedMetadata = normalizeMetadata(metadata);
  if (direct) {
    return createResult(direct, {
      base,
      source: 'locale-file',
      fromCache: true,
    });
  }

  const { primary: cacheKey, all: cacheKeys } = buildCacheKeyParts(
    lang,
    base,
    normalizedMetadata,
  );

  let cached;
  for (const cacheId of cacheKeys) {
    cached = getLS(cacheId);
    if (cached) {
      return createResult(cached, {
        base,
        source: 'cache-localStorage',
        fromCache: true,
      });
    }
  }

  for (const cacheId of cacheKeys) {
    cached = await idbGet(cacheId);
    if (cached) {
      if (!getLS(cacheId)) setLS(cacheId, cached);
      return createResult(cached, {
        base,
        source: 'cache-indexedDB',
        fromCache: true,
      });
    }
  }

  const cacheStore = await loadNodeCache();
  for (const cacheId of cacheKeys) {
    const value = cacheStore[cacheId];
    if (value) {
      if (!getLS(cacheId)) setLS(cacheId, value);
      return createResult(value, {
        base,
        source: 'cache-node',
        fromCache: true,
      });
    }
  }

  let translated;
  try {
    translated = await requestTranslation(base, lang, normalizedMetadata);
  } catch (err) {
    if (err.rateLimited) throw err;
    return createResult(base, {
      base,
      source: 'fallback-error',
      needsRetry: true,
      validation: {
        valid: false,
        reason: 'request_failed',
        error: err.message,
      },
    });
  }

  if (!translated) {
    return createResult(base, {
      base,
      source: 'fallback-missing',
      needsRetry: true,
      validation: {
        valid: false,
        reason: 'no_translation',
      },
    });
  }

  let validation;
  try {
    validation = await validateAITranslation(translated, base, lang, normalizedMetadata);
  } catch (err) {
    if (err.rateLimited) throw err;
    validation = {
      valid: false,
      needsRetry: true,
      reason: 'validation_error',
    };
  }

  if (!validation?.valid) {
    return createResult(base, {
      base,
      source: 'fallback-validation',
      needsRetry: true,
      validation,
      candidate: translated,
    });
  }

  setLS(cacheKey, translated);
  await idbSet(cacheKey, translated);
  cacheStore[cacheKey] = translated;
  await saveNodeCache();

  return createResult(translated, {
    base,
    source: 'ai',
    fromCache: false,
    validation: {
      ...validation,
      needsRetry: Boolean(validation.needsRetry),
    },
    needsRetry: Boolean(validation.needsRetry),
    candidate: translated,
  });
}
