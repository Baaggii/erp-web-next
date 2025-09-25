import {
  evaluateTranslationCandidate,
  buildValidationPrompt,
  summarizeHeuristic,
} from '../../../utils/translationValidation.js';

let nodeCache;
let nodeCachePath;
const localeCache = {};
const tooltipLocaleCache = {};
let aiDisabled = false;

function normalizeTranslationRecord(raw) {
  if (!raw) return null;

  let data = raw;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        data = JSON.parse(trimmed);
      } catch {
        return { text: trimmed, source: null, metadata: null };
      }
    } else {
      return { text: trimmed, source: null, metadata: null };
    }
  }

  if (typeof data !== 'object' || data === null) {
    return null;
  }

  if (Array.isArray(data)) {
    for (const entry of data) {
      const normalized = normalizeTranslationRecord(entry);
      if (normalized) return normalized;
    }
    return null;
  }

  if (data.response && !data.text && !data.translation && !data.value) {
    const nested = normalizeTranslationRecord(data.response);
    if (nested) return nested;
  }

  const textCandidates = ['text', 'translation', 'value', 'response'];
  let text = null;
  for (const field of textCandidates) {
    const val = data[field];
    if (typeof val === 'string') {
      const trimmed = val.trim();
      if (trimmed) {
        text = trimmed;
        break;
      }
    }
  }
  if (!text) return null;

  const sourceCandidates = ['source', 'provider', 'origin'];
  let source = null;
  for (const field of sourceCandidates) {
    const val = data[field];
    if (typeof val === 'string') {
      const trimmed = val.trim();
      if (trimmed) {
        source = trimmed;
        break;
      }
    }
  }

  const metadata =
    data.metadata && typeof data.metadata === 'object' && !Array.isArray(data.metadata)
      ? data.metadata
      : null;

  return { text, source, metadata };
}

function createCacheRecord(record, fallbackSource) {
  if (!record) return null;
  const normalized = normalizeTranslationRecord(record);
  if (!normalized) return null;
  let source = normalized.source || null;
  if (typeof source === 'string') {
    const trimmed = source.trim();
    if (trimmed) {
      const lower = trimmed.toLowerCase();
      const storageIndicators = [
        'localstorage',
        'indexeddb',
        'node-cache',
        'server-cache',
      ];
      const isStorageSource =
        lower.startsWith('cache-') ||
        lower.endsWith('-cache') ||
        storageIndicators.some((indicator) =>
          lower.includes(indicator),
        );
      if (isStorageSource) {
        source = null;
      } else {
        source = trimmed;
      }
    } else {
      source = null;
    }
  }
  if (!source && fallbackSource) {
    source = fallbackSource;
  }
  const cacheRecord = { text: normalized.text, source };
  if (normalized.metadata) cacheRecord.metadata = normalized.metadata;
  return cacheRecord;
}

function normalizeMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object') return null;
  const normalized = {};
  const setField = (field, value) => {
    if (value === undefined || value === null) return;
    const str = typeof value === 'string' ? value.trim() : String(value).trim();
    if (str) normalized[field] = str;
  };
  const prioritized = ['module', 'context', 'page', 'key', 'sourceLang'];
  for (const field of prioritized) {
    if (Object.prototype.hasOwnProperty.call(metadata, field)) {
      setField(field, metadata[field]);
    }
  }
  const remaining = Object.entries(metadata)
    .filter(([field]) => !prioritized.includes(field))
    .sort(([a], [b]) => a.localeCompare(b));
  for (const [field, value] of remaining) {
    setField(field, value);
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
  if (metadata.sourceLang) {
    const label =
      metadata.sourceLang === 'mn'
        ? 'Mongolian'
        : metadata.sourceLang === 'en'
          ? 'English'
          : metadata.sourceLang;
    parts.push(`Source language: ${label}`);
  }
  if (metadata.module) parts.push(`Module: ${metadata.module}`);
  if (metadata.context) parts.push(`Context: ${metadata.context}`);
  if (metadata.page) parts.push(`Page: ${metadata.page}`);
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

async function loadTooltipLocale(lang) {
  if (tooltipLocaleCache[lang]) return tooltipLocaleCache[lang];
  try {
    if (typeof process !== 'undefined' && process.versions?.node) {
      const fs = await import('fs/promises');
      const path = await import('path');
      const file = path.join(
        process.cwd(),
        'src',
        'erp.mgt.mn',
        'locales',
        'tooltips',
        `${lang}.json`,
      );
      const data = await fs.readFile(file, 'utf8');
      tooltipLocaleCache[lang] = JSON.parse(data);
    } else {
      tooltipLocaleCache[lang] = (
        await import(`../locales/tooltips/${lang}.json`)
      ).default;
    }
  } catch {
    tooltipLocaleCache[lang] = {};
  }
  return tooltipLocaleCache[lang];
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
    return normalizeTranslationRecord(data.response ?? data);
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
  const entryType = metadata?.type;
  const isTooltip = entryType === 'tooltip';
  const locales = isTooltip ? await loadTooltipLocale(lang) : await loadLocale(lang);
  const enLocales = isTooltip ? await loadTooltipLocale('en') : await loadLocale('en');
  const baseCandidate = (enLocales && enLocales[key]) || fallback || describe(key);
  const base =
    typeof baseCandidate === 'string' ? baseCandidate : String(baseCandidate ?? '');

  const direct = locales ? locales[key] : undefined;
  let normalizedMetadata = normalizeMetadata(metadata);
  if (lang === 'en') {
    const sourceSample =
      (typeof fallback === 'string' && fallback.trim())
        ? fallback
        : typeof key === 'string'
          ? key
          : String(key ?? '');
    const detectionTarget = sourceSample || base;
    if (/[\u0400-\u04FF]/.test(detectionTarget)) {
      normalizedMetadata = {
        ...(normalizedMetadata || {}),
        sourceLang: normalizedMetadata?.sourceLang || 'mn',
      };
    }
  }
  if (isTooltip) {
    if (typeof direct === 'string' && direct.trim()) {
      return createResult(direct, {
        base,
        source: 'tooltip-file',
        fromCache: true,
      });
    }
  } else if (direct) {
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
    cached = createCacheRecord(getLS(cacheId), 'ai');
    if (cached) {
      return createResult(cached.text, {
        base,
        source: cached.source,
        fromCache: true,
      });
    }
  }

  for (const cacheId of cacheKeys) {
    const idbValue = await idbGet(cacheId);
    cached = createCacheRecord(idbValue, 'ai');
    if (cached) {
      const existingRaw = getLS(cacheId);
      const existingRecord = createCacheRecord(existingRaw, 'ai');
      if (!existingRecord || existingRecord.text !== cached.text || existingRecord.source !== cached.source) {
        setLS(cacheId, JSON.stringify(cached));
      }
      if (typeof idbValue === 'string') await idbSet(cacheId, cached);
      return createResult(cached.text, {
        base,
        source: cached.source,
        fromCache: true,
      });
    }
  }

  const cacheStore = await loadNodeCache();
  for (const cacheId of cacheKeys) {
    const nodeValue = cacheStore[cacheId];
    cached = createCacheRecord(nodeValue, 'ai');
    if (cached) {
      const existingRaw = getLS(cacheId);
      const existingRecord = createCacheRecord(existingRaw, 'ai');
      if (!existingRecord || existingRecord.text !== cached.text || existingRecord.source !== cached.source) {
        setLS(cacheId, JSON.stringify(cached));
      }
      if (typeof nodeValue === 'string') {
        cacheStore[cacheId] = cached;
        await saveNodeCache();
      }
      return createResult(cached.text, {
        base,
        source: cached.source,
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

  const translationRecord = createCacheRecord(translated, 'ai');
  const translatedText = translationRecord?.text;

  if (!translatedText) {
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
    validation = await validateAITranslation(
      translatedText,
      base,
      lang,
      normalizedMetadata,
    );
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
      candidate: translatedText,
    });
  }

  const cachePayload = {
    text: translatedText,
    source: translationRecord?.source || 'ai',
  };
  if (translationRecord?.metadata) {
    cachePayload.metadata = translationRecord.metadata;
  }

  setLS(cacheKey, JSON.stringify(cachePayload));
  await idbSet(cacheKey, cachePayload);
  cacheStore[cacheKey] = cachePayload;
  await saveNodeCache();

  return createResult(translatedText, {
    base,
    source: cachePayload.source || 'ai',
    fromCache: false,
    validation: {
      ...validation,
      needsRetry: Boolean(validation.needsRetry),
    },
    needsRetry: Boolean(validation.needsRetry),
    candidate: translatedText,
  });
}
