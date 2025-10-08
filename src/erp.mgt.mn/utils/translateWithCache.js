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

  const fallback =
    typeof fallbackSource === 'string' && fallbackSource.trim()
      ? fallbackSource.trim()
      : null;

  let source = normalized.source || null;
  if (typeof source === 'string') {
    const trimmed = source.trim();
    if (trimmed) {
      const lower = trimmed.toLowerCase();
      const legacyTags = new Set([
        'cache-node',
        'cache-localstorage',
        'cache-indexeddb',
      ]);
      const storageIndicators = [
        'localstorage',
        'indexeddb',
        'node-cache',
        'server-cache',
      ];
      const isLegacyTag = legacyTags.has(lower);
      const isStorageSource =
        lower.startsWith('cache-') ||
        lower.endsWith('-cache') ||
        storageIndicators.some((indicator) => lower.includes(indicator));

      if (isLegacyTag || isStorageSource) {
        source = fallback;
      } else {
        source = trimmed;
      }
    } else {
      source = null;
    }
  }
  if (!source && fallback) {
    source = fallback;
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

const LANGUAGE_LABELS = {
  mn: 'Mongolian (Cyrillic)',
  en: 'English',
  ru: 'Russian',
  ja: 'Japanese',
  zh: 'Chinese',
  ko: 'Korean',
};

function getLanguageLabel(lang) {
  if (!lang) return 'the target language';
  const lower = String(lang).toLowerCase();
  return LANGUAGE_LABELS[lower] || lower;
}

function sanitizePromptSnippet(value, maxLength = 280) {
  if (!value) return '';
  const str = String(value).replace(/[\r\n]+/g, ' ').trim();
  if (!str) return '';
  if (str.length <= maxLength) return str;
  return `${str.slice(0, maxLength - 1)}…`;
}

function formatMetadataForPrompt(metadata) {
  if (!metadata || typeof metadata !== 'object') return [];
  const parts = [];
  const push = (label, value) => {
    const snippet = sanitizePromptSnippet(value, 160);
    if (snippet) parts.push(`${label}: ${snippet}`);
  };
  if (metadata.sourceLang) {
    const label = getLanguageLabel(metadata.sourceLang);
    push('Source language', label);
  }
  if (metadata.module) push('Module', metadata.module);
  if (metadata.context) push('Context', metadata.context);
  if (metadata.page) push('Page', metadata.page);
  if (metadata.key) push('Key', metadata.key);
  const remainingKeys = Object.keys(metadata)
    .filter((key) => !['sourceLang', 'module', 'context', 'page', 'key'].includes(key))
    .sort();
  for (const key of remainingKeys) {
    push(key.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').trim(), metadata[key]);
  }
  return parts;
}

function buildPrompt(text, lang, metadata, options = {}) {
  const rawText = text ?? '';
  const textStr = typeof rawText === 'string' ? rawText : String(rawText);
  const label = getLanguageLabel(lang);
  const instructions = [
    `You are an expert translator. Provide a fluent, natural translation into ${label}.`,
    'Preserve placeholders ({{ }}, %s, <tags>, etc.) exactly and keep relevant punctuation.',
    'Return only the translated sentence or phrase without commentary.',
  ];

  if (String(lang).toLowerCase() === 'mn') {
    instructions.push(
      'Write in clear, professional Mongolian using Cyrillic script only. Avoid Latin characters, transliteration, or meaningless syllables. Choose terminology appropriate for an ERP/business application.',
    );
  }

  const feedback = sanitizePromptSnippet(options.feedback, 360);
  if (feedback) {
    instructions.push(`Previous attempt issues to fix: ${feedback}. Correct them in this translation.`);
  }

  if (options.attempt && options.attempt > 1) {
    instructions.push('Provide an alternative phrasing that differs from earlier attempts while keeping the meaning.');
  }

  const previous = Array.isArray(options.previousCandidates)
    ? options.previousCandidates
        .map((candidate) => sanitizePromptSnippet(candidate, 140))
        .filter(Boolean)
    : [];
  if (previous.length) {
    const recent = previous.slice(-3).map((candidate) => `"${candidate}"`).join('; ');
    if (recent) {
      instructions.push(`Do not repeat these rejected outputs: ${recent}.`);
    }
  }

  const metadataParts = formatMetadataForPrompt(metadata);
  const sections = [instructions.join('\n')];
  if (metadataParts.length) {
    sections.push(['Context:', ...metadataParts.map((item) => `- ${item}`)].join('\n'));
  }
  sections.push(`Text to translate:\n"""${textStr}"""`);
  return sections.join('\n\n');
}

const RETRY_REASON_HINTS = {
  contains_latin_script:
    'Remove all Latin characters and write the translation using Mongolian Cyrillic only.',
  contains_tibetan_script:
    'Avoid Tibetan characters; use standard Mongolian Cyrillic script.',
  no_cyrillic_content:
    'Ensure the translation is provided in Mongolian Cyrillic characters.',
  insufficient_cyrillic_ratio:
    'Make sure the translation is primarily composed of Mongolian Cyrillic letters.',
  limited_cyrillic_content:
    'Add more substantial Mongolian words written in Cyrillic.',
  insufficient_character_variety:
    'Use natural Mongolian words instead of repeating the same few characters.',
  insufficient_word_length:
    'Include meaningful Mongolian words that are at least a few letters long.',
  missing_mongolian_vowel:
    'Use natural Mongolian vocabulary that includes appropriate vowels.',
  metadata_not_reflected:
    'Incorporate key terminology from the provided module/context when appropriate.',
  no_language_signal:
    'Provide meaningful words in the target language instead of placeholders or punctuation.',
  identical_to_base:
    'Do not copy the source text; translate it into the target language.',
  duplicate_candidate:
    'Provide a different translation from the earlier attempts.',
  empty_translation: 'Return an actual translated phrase, not an empty string.',
  no_translation: 'Provide a translated value rather than omitting the text.',
  validation_failed: 'The previous attempt did not pass validation; supply a corrected translation.',
  validation_error:
    'The previous attempt did not satisfy validation; produce a clearer, correct translation.',
};

function normalizeReasonCode(reason) {
  if (!reason) return '';
  if (reason.startsWith('missing_placeholders')) {
    const [, payload] = reason.split(':');
    const placeholderList = payload ? payload.split(',').map((p) => p.trim()).filter(Boolean) : [];
    if (placeholderList.length) {
      return `Ensure these placeholders appear exactly as in the source: ${placeholderList.join(', ')}.`;
    }
    return 'Ensure all placeholders from the source appear unchanged in the translation.';
  }
  if (RETRY_REASON_HINTS[reason]) {
    return RETRY_REASON_HINTS[reason];
  }
  if (reason.includes('_')) {
    return reason.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return reason;
}

function buildRetryFeedback(validation) {
  if (!validation) return '';
  const hints = [];
  if (validation.reason && validation.reason !== 'failed_heuristics') {
    const normalized = normalizeReasonCode(validation.reason);
    hints.push(normalized || validation.reason);
  }
  const heuristicReasons = Array.isArray(validation.heuristics?.reasons)
    ? validation.heuristics.reasons
    : [];
  for (const reason of heuristicReasons) {
    const hint = normalizeReasonCode(reason);
    if (hint) hints.push(hint);
  }
  const missingPlaceholders = validation.heuristics?.placeholders?.missing;
  if (Array.isArray(missingPlaceholders) && missingPlaceholders.length) {
    hints.push(
      `Ensure these placeholders are present: ${missingPlaceholders
        .map((ph) => ph.trim())
        .filter(Boolean)
        .join(', ')}.`,
    );
  }
  const summary = validation.summary;
  if (!hints.length && summary) {
    hints.push(summary);
  }
  return sanitizePromptSnippet(hints.join(' '), 360);
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

async function requestTranslation(text, lang, metadata, options = {}) {
  if (aiDisabled) return null;
  try {
    const prompt = buildPrompt(text, lang, metadata, options);
    const payload = {
      prompt,
      task: 'translation',
      lang,
      metadata,
      key: metadata?.key || options.key,
      attempt: options.attempt,
      model: options.model,
    };
    const res = await fetch('/api/openai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
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
      body: JSON.stringify({
        prompt,
        task: 'validation',
        lang: payload?.lang,
      }),
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
  const requiresRemoteValidation = lang === 'mn';
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

  const shouldUseHeuristicsOnly = heuristics.status === 'pass' && !requiresRemoteValidation;

  if (shouldUseHeuristicsOnly) {
    return {
      ...result,
      valid: true,
    };
  }

  const payload = { candidate, base, lang, metadata };
  const viaEndpoint = await requestValidationViaEndpoint(payload);
  if (viaEndpoint?.ok) {
    const remoteNeedsRetry =
      typeof viaEndpoint.needsRetry === 'boolean'
        ? viaEndpoint.needsRetry
        : !viaEndpoint.valid;
    const lowConfidence =
      typeof viaEndpoint.languageConfidence === 'number' &&
      viaEndpoint.languageConfidence < 0.65;
    const combinedNeedsRetry =
      remoteNeedsRetry || heuristicsSuggestRetry || lowConfidence;
    const reason =
      viaEndpoint.reason ||
      (lowConfidence ? 'low_language_confidence' : '') ||
      primaryHeuristicReason ||
      (combinedNeedsRetry ? 'validation_failed' : '');
    return {
      ...result,
      valid:
        Boolean(viaEndpoint.valid) &&
        !heuristicsSuggestRetry &&
        !lowConfidence,
      reason,
      needsRetry: combinedNeedsRetry,
      attemptedRemote: true,
      remoteSource: viaEndpoint.strategy || viaEndpoint.source || 'api',
      languageConfidence: viaEndpoint.languageConfidence ?? null,
    };
  }

  if (viaEndpoint && viaEndpoint.status === 404) {
    const viaPrompt = await requestValidationViaPrompt(payload);
    if (viaPrompt?.ok) {
      const promptNeedsRetry =
        typeof viaPrompt.needsRetry === 'boolean'
          ? viaPrompt.needsRetry
          : !viaPrompt.valid;
      const combinedNeedsRetry = promptNeedsRetry || heuristicsSuggestRetry;
      const reason =
        viaPrompt.reason ||
        primaryHeuristicReason ||
        (combinedNeedsRetry ? 'validation_failed' : '');
      return {
        ...result,
        valid: Boolean(viaPrompt.valid) && !heuristicsSuggestRetry,
        reason,
        needsRetry: combinedNeedsRetry,
        attemptedRemote: true,
        remoteSource: viaPrompt.source,
        languageConfidence: viaPrompt.languageConfidence,
      };
    }
  }

  if (heuristics.status === 'pass' && !requiresRemoteValidation) {
    return {
      ...result,
      valid: true,
      reason: '',
      needsRetry: false,
      attemptedRemote: Boolean(viaEndpoint),
      remoteSource: viaEndpoint?.status ? `status_${viaEndpoint.status}` : null,
    };
  }

  return {
    ...result,
    reason:
      primaryHeuristicReason ||
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

  const maxAttempts = String(lang).toLowerCase() === 'mn' ? 5 : 3;
  const seenCandidates = [];
  let translationRecord = null;
  let translatedText = null;
  let validation = null;
  let requestError = null;
  let success = false;
  let previousValidation = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let translated;
    try {
      translated = await requestTranslation(base, lang, normalizedMetadata, {
        attempt,
        feedback: buildRetryFeedback(previousValidation),
        previousCandidates: seenCandidates.slice(),
      });
    } catch (err) {
      if (err.rateLimited) throw err;
      requestError = err;
      break;
    }

    translationRecord = createCacheRecord(translated, 'ai');
    translatedText = translationRecord?.text || null;

    if (!translated) {
      validation = {
        valid: false,
        needsRetry: true,
        reason: 'no_translation',
      };
      previousValidation = validation;
      break;
    }

    if (!translatedText) {
      validation = {
        valid: false,
        needsRetry: true,
        reason: 'empty_translation',
      };
      previousValidation = validation;
      if (attempt === maxAttempts) break;
      continue;
    }

    if (seenCandidates.includes(translatedText)) {
      validation = {
        valid: false,
        needsRetry: true,
        reason: 'duplicate_candidate',
      };
      previousValidation = validation;
      if (attempt === maxAttempts) break;
      continue;
    }

    seenCandidates.push(translatedText);

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

    previousValidation = validation;

    if (validation?.valid && !validation.needsRetry) {
      success = true;
      break;
    }

    if (!validation?.needsRetry) {
      break;
    }
  }

  if (!success) {
    if (requestError) {
      return createResult(base, {
        base,
        source: 'fallback-error',
        needsRetry: true,
        validation: {
          valid: false,
          reason: 'request_failed',
          error: requestError.message,
        },
      });
    }

    const fallbackValidation =
      validation ||
      previousValidation || {
        valid: false,
        needsRetry: true,
        reason: 'validation_failed',
      };

    const fallbackSource =
      fallbackValidation.reason === 'no_translation' ||
      fallbackValidation.reason === 'empty_translation'
        ? 'fallback-missing'
        : 'fallback-validation';

    return createResult(base, {
      base,
      source: fallbackSource,
      needsRetry: true,
      validation: fallbackValidation,
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

export { createCacheRecord };
