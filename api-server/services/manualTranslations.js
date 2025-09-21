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

  function ensureEntry(id, key, type) {
    if (!entries[id]) {
      entries[id] = { key, type, values: {}, module: '', context: '' };
    }
    return entries[id];
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
          if (localeEntry.values.en == null) localeEntry.values.en = v;
          if (tooltipEntry.values.en == null) tooltipEntry.values.en = v;
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
  }

  return { languages: Array.from(langs), entries: Object.values(entries) };
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
