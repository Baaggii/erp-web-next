import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  evaluateTranslationCandidate,
  summarizeHeuristic,
} from '../../utils/translationValidation.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../');

const localesDir = path.join(projectRoot, 'src', 'erp.mgt.mn', 'locales');
const tooltipDir = path.join(localesDir, 'tooltips');
const configDir = path.join(projectRoot, 'config');

const cyrillicRegex = /[\u0400-\u04FF]/;
const latinRegex = /[A-Za-z]/;

function detectExportedLanguage(value) {
  if (typeof value !== 'string') {
    return { language: null, reason: 'non_string' };
  }
  const text = value.trim();
  if (!text) {
    return { language: null, reason: 'empty' };
  }

  const hasCyrillic = cyrillicRegex.test(text);
  const hasLatin = latinRegex.test(text);

  const defaultEnglishStats = { ratio: 0, asciiCount: 0, matches: 0 };
  let englishStats = defaultEnglishStats;
  try {
    const heuristics = evaluateTranslationCandidate({
      candidate: text,
      base: '',
      lang: 'mn',
      metadata: {},
    });
    if (heuristics?.english) {
      englishStats = {
        ratio: Number.isFinite(heuristics.english.ratio)
          ? heuristics.english.ratio
          : defaultEnglishStats.ratio,
        asciiCount: Number.isFinite(heuristics.english.asciiCount)
          ? heuristics.english.asciiCount
          : defaultEnglishStats.asciiCount,
        matches: Number.isFinite(heuristics.english.englishMatches)
          ? heuristics.english.englishMatches
          : defaultEnglishStats.matches,
      };
    }
  } catch {
    englishStats = defaultEnglishStats;
  }

  if (hasCyrillic && !hasLatin) {
    return { language: 'mn', reason: 'cyrillic_only', english: englishStats };
  }

  if (hasCyrillic && hasLatin) {
    if (englishStats.ratio >= 0.6 && englishStats.asciiCount >= 2) {
      return {
        language: 'en',
        reason: 'mixed_but_english_dominant',
        english: englishStats,
      };
    }
    if (englishStats.ratio <= 0.2) {
      return {
        language: 'mn',
        reason: 'mixed_but_cyrillic_dominant',
        english: englishStats,
      };
    }
    return { language: null, reason: 'mixed_scripts', english: englishStats };
  }

  if (!hasCyrillic && hasLatin) {
    if (
      englishStats.asciiCount >= 2 &&
      (englishStats.ratio >= 0.4 || englishStats.matches >= 1)
    ) {
      return { language: 'en', reason: 'latin_script', english: englishStats };
    }
    if (englishStats.asciiCount >= 1 && text.split(' ').length === 1) {
      return { language: 'en', reason: 'single_latin_token', english: englishStats };
    }
    return {
      language: null,
      reason: 'latin_without_signal',
      english: englishStats,
    };
  }

  return { language: null, reason: 'no_language_signal', english: englishStats };
}

async function listLangs(dir) {
  try {
    const files = await fs.readdir(dir);
    return files.filter((f) => f.endsWith('.json')).map((f) => path.basename(f, '.json'));
  } catch {
    return [];
  }
}

function flattenTranslationTree(source) {
  const flat = {};
  (function walk(obj, prefix) {
    if (typeof obj === 'string') {
      if (prefix) flat[prefix] = obj;
      return;
    }
    if (Array.isArray(obj)) {
      obj.forEach((value, index) => {
        const key = prefix ? `${prefix}.${index}` : String(index);
        walk(value, key);
      });
      return;
    }
    if (obj && typeof obj === 'object') {
      for (const [key, value] of Object.entries(obj)) {
        const nextKey = prefix ? `${prefix}.${key}` : key;
        walk(value, nextKey);
      }
    }
  })(source, '');
  return flat;
}

function toSafeString(value) {
  if (typeof value === 'string') return value;
  if (value == null) return '';
  return String(value);
}

const REASON_DESCRIPTIONS = {
  empty: 'Translation cannot be empty.',
  identical_to_base: 'Translation matches the English baseline.',
  appears_english: 'Translation appears to be English text.',
  too_short_for_context: 'Translation seems too short for this context.',
  missing_placeholders: 'Translation is missing required placeholders.',
  extra_placeholders: 'Translation contains unexpected placeholders.',
};

function describeValidationReason(reason) {
  if (!reason) return 'Translation failed validation.';
  const [code, ...rest] = String(reason).split(':');
  const extra = rest.join(':');
  let message = REASON_DESCRIPTIONS[code];
  if (code === 'missing_placeholders') {
    message = extra
      ? `Translation is missing required placeholders: ${extra}.`
      : REASON_DESCRIPTIONS[code];
  } else if (code === 'extra_placeholders') {
    message = extra
      ? `Translation contains unexpected placeholders: ${extra}.`
      : REASON_DESCRIPTIONS[code];
  }
  if (!message) {
    message = String(reason).replace(/_/g, ' ');
  }
  if (!/[.!?]$/.test(message)) message += '.';
  return message;
}

function buildValidationErrorMessage({ key, lang, reason }) {
  const detail = describeValidationReason(reason);
  const language = lang || 'target';
  return `Validation failed for ${language} translation of "${key}": ${detail}`;
}

async function readJsonSafe(file) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch {
    return null;
  }
}

async function loadEnglishReferenceData(store) {
  if (store && store.data) return store.data;

  const data = {
    locale: new Map(),
    tooltip: new Map(),
  };

  const ensureRecord = (type, key) => {
    const map = type === 'tooltip' ? data.tooltip : data.locale;
    if (!map.has(key)) {
      map.set(key, {
        value: '',
        metadata: { module: '', context: '', key },
      });
    }
    return map.get(key);
  };

  const applyValue = (type, key, value) => {
    const record = ensureRecord(type, key);
    record.value = toSafeString(value);
  };

  const applyMetadata = (type, key, meta = {}) => {
    const record = ensureRecord(type, key);
    record.metadata = {
      module: typeof meta.module === 'string' ? meta.module : '',
      context: typeof meta.context === 'string' ? meta.context : '',
      key: meta.key || key,
    };
  };

  const localeEn = await readJsonSafe(path.join(localesDir, 'en.json'));
  if (localeEn && typeof localeEn === 'object') {
    for (const [key, value] of Object.entries(localeEn)) {
      applyValue('locale', key, value);
    }
  }

  const tooltipEn = await readJsonSafe(path.join(tooltipDir, 'en.json'));
  if (tooltipEn && typeof tooltipEn === 'object') {
    for (const [key, value] of Object.entries(tooltipEn)) {
      applyValue('tooltip', key, value);
    }
  }

  try {
    const tenants = await fs.readdir(configDir, { withFileTypes: true });
    for (const tenant of tenants) {
      if (!tenant.isDirectory()) continue;
      const exportedFile = path.join(configDir, tenant.name, 'exportedtexts.json');
      try {
        const raw = await readJsonSafe(exportedFile);
        if (!raw) continue;
        let translationsData = raw;
        let metadata = {};
        if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
          if (raw.translations && typeof raw.translations === 'object') {
            translationsData = raw.translations;
          }
          if (raw.meta && typeof raw.meta === 'object') {
            metadata = raw.meta;
          }
        }
        const flat = flattenTranslationTree(translationsData);
        for (const [key, value] of Object.entries(flat)) {
          const meta = metadata[key] || {};
          const normalizedMeta = {
            module: typeof meta.module === 'string' ? meta.module : '',
            context: typeof meta.context === 'string' ? meta.context : '',
            key: meta.key || key,
          };
          applyMetadata('locale', key, normalizedMeta);
          applyMetadata('tooltip', key, normalizedMeta);
          const normalizedValue = toSafeString(value);
          const localeRecord = ensureRecord('locale', key);
          if (!localeRecord.value) {
            localeRecord.value = normalizedValue;
          }
          const tooltipRecord = ensureRecord('tooltip', key);
          if (!tooltipRecord.value) {
            tooltipRecord.value = normalizedValue;
          }
        }
      } catch {}
    }
  } catch {}

  for (const map of Object.values(data)) {
    for (const [key, record] of map.entries()) {
      record.value = toSafeString(record.value);
      const meta = record.metadata || {};
      record.metadata = {
        module: typeof meta.module === 'string' ? meta.module : '',
        context: typeof meta.context === 'string' ? meta.context : '',
        key: meta.key || key,
      };
    }
  }

  if (store) {
    store.data = data;
  }

  return data;
}

export async function loadTranslations() {
  const langs = new Set([
    ...(await listLangs(localesDir)),
    ...(await listLangs(tooltipDir)),
  ]);
  const entries = {};
  const reviewQueue = [];

  function ensureEntry(id, key, type) {
    if (!entries[id]) {
      entries[id] = {
        key,
        type,
        values: {},
        module: '',
        context: '',
        pendingReview: [],
        needsReview: false,
      };
    }
    return entries[id];
  }

  function queueReview(entry, value, { tenant, reason, detection, lang }) {
    if (!entry.pendingReview) entry.pendingReview = [];
    const reviewItem = {
      value,
      tenant: tenant || '',
      source: 'exportedtexts',
      reason: reason || 'undetermined_language',
    };
    if (typeof lang === 'string') reviewItem.lang = lang;
    if (detection?.reason) reviewItem.detectionReason = detection.reason;
    if (Object.prototype.hasOwnProperty.call(detection ?? {}, 'language')) {
      reviewItem.detectedLanguage = detection.language;
    }
    if (detection?.english) {
      if (Number.isFinite(detection.english.ratio)) {
        reviewItem.englishRatio = detection.english.ratio;
      }
      if (Number.isFinite(detection.english.asciiCount)) {
        reviewItem.englishAsciiCount = detection.english.asciiCount;
      }
      if (Number.isFinite(detection.english.matches)) {
        reviewItem.englishMatches = detection.english.matches;
      }
    }
    entry.pendingReview.push(reviewItem);
    entry.needsReview = true;
    reviewQueue.push({ key: entry.key, type: entry.type, ...reviewItem });
  }

  function applyDetectedLanguage(entry, langCode, value, info) {
    if (!langCode) return;
    if (!langs.has(langCode)) langs.add(langCode);
    const existing = entry.values[langCode];
    const normalizedExisting =
      typeof existing === 'string' ? existing.trim() : existing;
    const normalizedIncoming =
      typeof value === 'string' ? value.trim() : value;
    if (normalizedExisting == null || normalizedExisting === '') {
      entry.values[langCode] = value;
      return;
    }
    if (normalizedExisting === normalizedIncoming) return;
    queueReview(entry, value, {
      ...info,
      lang: langCode,
      reason: 'conflict_with_existing',
    });
  }

  for (const lang of langs) {
    // Load normal locale strings
    try {
      const file = path.join(localesDir, `${lang}.json`);
      const data = JSON.parse(await fs.readFile(file, 'utf8'));
      for (const [k, v] of Object.entries(data)) {
        const id = `locale:${k}`;
        ensureEntry(id, k, 'locale').values[lang] = v;
      }
    } catch {}

    // Load tooltip strings
    try {
      const file = path.join(tooltipDir, `${lang}.json`);
      const data = JSON.parse(await fs.readFile(file, 'utf8'));
      for (const [k, v] of Object.entries(data)) {
        const id = `tooltip:${k}`;
        ensureEntry(id, k, 'tooltip').values[lang] = v;
      }
    } catch {}
  }

  // Load exported text identifiers
  try {
    const tenants = await fs.readdir(configDir, { withFileTypes: true });
    for (const tenant of tenants) {
      if (!tenant.isDirectory()) continue;
      const exportedFile = path.join(configDir, tenant.name, 'exportedtexts.json');
      try {
        const raw = JSON.parse(await fs.readFile(exportedFile, 'utf8'));
        let translationsData = raw;
        let metadata = {};
        if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
          if (raw.translations && typeof raw.translations === 'object') {
            translationsData = raw.translations;
          }
          if (raw.meta && typeof raw.meta === 'object') {
            metadata = raw.meta;
          }
        }
        const flat = {};
        (function walk(obj, prefix) {
          if (typeof obj === 'string') {
            if (prefix) flat[prefix] = obj;
            return;
          }
          if (Array.isArray(obj)) {
            obj.forEach((v, i) => {
              const key = prefix ? `${prefix}.${i}` : String(i);
              walk(v, key);
            });
            return;
          }
          if (obj && typeof obj === 'object') {
            for (const [k, v] of Object.entries(obj)) {
              const key = prefix ? `${prefix}.${k}` : k;
              walk(v, key);
            }
          }
        })(translationsData, '');
        for (const [k, v] of Object.entries(flat)) {
          const localeId = `locale:${k}`;
          const tooltipId = `tooltip:${k}`;
          const meta = metadata[k] || {};
          const localeEntry = ensureEntry(localeId, k, 'locale');
          const tooltipEntry = ensureEntry(tooltipId, k, 'tooltip');
          const detection = detectExportedLanguage(v);
          const tenantInfo = { tenant: tenant.name, detection };
          if (detection.language === 'en' || detection.language === 'mn') {
            applyDetectedLanguage(localeEntry, detection.language, v, tenantInfo);
            applyDetectedLanguage(
              tooltipEntry,
              detection.language,
              v,
              tenantInfo,
            );
          } else {
            queueReview(localeEntry, v, {
              ...tenantInfo,
              reason: detection.reason || 'undetermined_language',
            });
            queueReview(tooltipEntry, v, {
              ...tenantInfo,
              reason: detection.reason || 'undetermined_language',
            });
          }
          if (!localeEntry.module && meta.module) localeEntry.module = meta.module;
          if (!tooltipEntry.module && meta.module) tooltipEntry.module = meta.module;
          if (!localeEntry.context && meta.context) localeEntry.context = meta.context;
          if (!tooltipEntry.context && meta.context) tooltipEntry.context = meta.context;
        }
        if (!langs.has('en')) langs.add('en');
      } catch {}
    }
  } catch {}

  // Ensure all language fields exist
  for (const entry of Object.values(entries)) {
    for (const lang of langs) {
      if (entry.values[lang] == null) entry.values[lang] = '';
    }
    if (entry.module == null) entry.module = '';
    if (entry.context == null) entry.context = '';
    if (!entry.pendingReview) entry.pendingReview = [];
    entry.needsReview = entry.pendingReview.length > 0;
  }

  return {
    languages: Array.from(langs),
    entries: Object.values(entries),
    reviewQueue,
  };
}

export async function saveTranslation(
  { key, type = 'locale', values = {} } = {},
  options = {},
) {
  if (!key) return;
  const valueEntries = Object.entries(values || {});
  if (!valueEntries.length) return;

  const referenceStore = options?.referenceCache;
  const referenceData = await loadEnglishReferenceData(referenceStore);
  const map = type === 'tooltip' ? referenceData.tooltip : referenceData.locale;
  const reference =
    map.get(key) || { value: '', metadata: { module: '', context: '', key } };

  let englishBase = toSafeString(reference.value);
  const metadata = {
    module: reference.metadata?.module ?? '',
    context: reference.metadata?.context ?? '',
    key: reference.metadata?.key || key,
  };

  const operations = [];
  for (const [lang, rawVal] of valueEntries) {
    if (!lang) continue;
    let value = rawVal;
    if (value != null && typeof value !== 'string') {
      value = String(value);
    }
    if (lang === 'en') {
      englishBase = value == null || value === '' ? '' : toSafeString(value);
    }
    operations.push([lang, value]);
  }

  for (const [lang, value] of operations) {
    if (lang === 'en') continue;
    if (value == null || value === '') continue;
    const heuristics = evaluateTranslationCandidate({
      candidate: value,
      base: englishBase,
      lang,
      metadata,
    });
    if (heuristics.status === 'fail') {
      const primaryReason = heuristics.reasons[0] || 'failed_heuristics';
      const error = new Error(
        buildValidationErrorMessage({ key, lang, reason: primaryReason }),
      );
      error.status = 400;
      error.code = 'TRANSLATION_VALIDATION_FAILED';
      error.details = {
        key,
        type,
        lang,
        reason: primaryReason,
        reasons: heuristics.reasons,
        heuristics,
        summary: summarizeHeuristic(heuristics),
      };
      throw error;
    }
  }

  let englishMutated = false;
  for (const [lang, value] of operations) {
    const dir = type === 'tooltip' ? tooltipDir : localesDir;
    const file = path.join(dir, `${lang}.json`);
    let obj = {};
    try {
      obj = JSON.parse(await fs.readFile(file, 'utf8'));
    } catch {}
    if (value == null || value === '') {
      delete obj[key];
    } else {
      obj[key] = value;
    }
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, JSON.stringify(obj, null, 2) + '\n', 'utf8');
    if (lang === 'en') englishMutated = true;
  }

  if (englishMutated && referenceStore) {
    referenceStore.data = null;
  }
}

export async function deleteTranslation(key, type = 'locale') {
  if (!key) return;
  const dir = type === 'tooltip' ? tooltipDir : localesDir;
  for (const lang of await listLangs(dir)) {
    const file = path.join(dir, `${lang}.json`);
    try {
      const obj = JSON.parse(await fs.readFile(file, 'utf8'));
      if (obj[key] != null) {
        delete obj[key];
        await fs.writeFile(file, JSON.stringify(obj, null, 2) + '\n', 'utf8');
      }
    } catch {}
  }
}
