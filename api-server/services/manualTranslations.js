import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { CYRILLIC_REGEX, detectLang } from '../utils/translationHelpers.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../');

const localesDir = path.join(projectRoot, 'src', 'erp.mgt.mn', 'locales');
const tooltipDir = path.join(localesDir, 'tooltips');
const SUPPORTED_LANGS = ['en', 'mn', 'ja', 'ko', 'zh', 'es', 'de', 'fr', 'ru'];
const LOCALE_FILE_LABEL = 'Locale file';
const TOOLTIP_FILE_LABEL = 'Tooltip file';
const MANUAL_ENTRY_LABEL = 'Manual entry';
const translationsMetaFile = path.join(
  projectRoot,
  'docs',
  'manuals',
  'manual-translation-sources.json',
);

const NORMALIZE_MEANING_REGEX = /[\s\p{P}\p{S}_]+/gu;

function normalizeForMeaning(value) {
  if (value == null) return '';
  return String(value).toLowerCase().replace(NORMALIZE_MEANING_REGEX, '');
}

function analyzeMeaning(key, value) {
  const normalizedKey = normalizeForMeaning(key);
  const normalizedValue = normalizeForMeaning(value);
  const isMeaningful = normalizedValue.length > 0 && normalizedValue !== normalizedKey;
  return { normalizedKey, normalizedValue, isMeaningful };
}

async function listLangs(dir) {
  try {
    const files = await fs.readdir(dir);
    return files.filter((f) => f.endsWith('.json')).map((f) => path.basename(f, '.json'));
  } catch {
    return [];
  }
}

async function loadTranslatedByStore() {
  try {
    const raw = await fs.readFile(translationsMetaFile, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    const normalized = {};
    for (const [entryId, entryValue] of Object.entries(parsed)) {
      if (!entryValue || typeof entryValue !== 'object') continue;
      const translatedBy = {};
      for (const [lang, label] of Object.entries(entryValue)) {
        if (typeof label !== 'string') continue;
        const trimmed = label.trim();
        if (trimmed) {
          translatedBy[lang] = trimmed;
        }
      }
      if (Object.keys(translatedBy).length) {
        normalized[entryId] = translatedBy;
      }
    }
    return normalized;
  } catch {
    return {};
  }
}

async function saveTranslatedByStore(store) {
  try {
    await fs.mkdir(path.dirname(translationsMetaFile), { recursive: true });
    await fs.writeFile(
      translationsMetaFile,
      JSON.stringify(store, null, 2) + '\n',
      'utf8',
    );
  } catch {}
}

function cloneTranslatedBy(entryId, store) {
  const record = store[entryId];
  if (!record || typeof record !== 'object') return {};
  const clone = {};
  for (const [lang, label] of Object.entries(record)) {
    if (typeof label !== 'string') continue;
    const trimmed = label.trim();
    if (trimmed) clone[lang] = trimmed;
  }
  return clone;
}

export async function loadTranslations() {
  const entries = {};
  const translatedByStore = await loadTranslatedByStore();

  function ensureEntry(id, key, type) {
    if (!entries[id]) {
      entries[id] = {
        key,
        type,
        values: {},
        module: '',
        context: '',
        page: '',
        pageEditable: true,
        translatedBy: cloneTranslatedBy(id, translatedByStore),
      };
    }
    return entries[id];
  }

  const configDir = path.join(projectRoot, 'config');
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
          const { isMeaningful } = analyzeMeaning(k, v);
          if (!isMeaningful) continue;
          const localeId = `locale:${k}`;
          const tooltipId = `tooltip:${k}`;
          const meta = metadata[k] || {};
          const localeEntry = ensureEntry(localeId, k, 'locale');
          const tooltipEntry = ensureEntry(tooltipId, k, 'tooltip');
          const hasCyrillic = typeof v === 'string' && CYRILLIC_REGEX.test(v);
          const initialLangKey = hasCyrillic ? 'mn' : 'en';
          const detectedLang = detectLang(v);
          const langKey =
            detectedLang === 'mn' || detectedLang === 'en'
              ? detectedLang
              : initialLangKey;
          if (localeEntry.values[langKey] == null) localeEntry.values[langKey] = v;
          if (tooltipEntry.values[langKey] == null) tooltipEntry.values[langKey] = v;
          if (!localeEntry.module && meta.module) localeEntry.module = meta.module;
          if (!tooltipEntry.module && meta.module) tooltipEntry.module = meta.module;
          if (!localeEntry.context && meta.context) localeEntry.context = meta.context;
          if (!tooltipEntry.context && meta.context) tooltipEntry.context = meta.context;
          if (!localeEntry.page && meta.page) {
            localeEntry.page = meta.page;
            localeEntry.pageEditable = false;
          }
          if (!tooltipEntry.page && meta.page) {
            tooltipEntry.page = meta.page;
            tooltipEntry.pageEditable = false;
          }
        }
      } catch {}
    }
  } catch {}

  const seedLangs = new Set([
    ...(await listLangs(localesDir)),
    ...(await listLangs(tooltipDir)),
  ]);
  for (const lang of SUPPORTED_LANGS) {
    seedLangs.add(lang);
  }

  const langs = new Set(seedLangs);

  for (const lang of seedLangs) {
    langs.add(lang);
    // Load normal locale strings
    try {
      const file = path.join(localesDir, `${lang}.json`);
      const data = JSON.parse(await fs.readFile(file, 'utf8'));
      for (const [k, v] of Object.entries(data)) {
        const { isMeaningful } = analyzeMeaning(k, v);
        if (!isMeaningful) continue;
        const id = `locale:${k}`;
        const entry = ensureEntry(id, k, 'locale');
        entry.values[lang] = v;
        if (
          v != null &&
          String(v).trim() &&
          (!entry.translatedBy?.[lang] || !entry.translatedBy[lang].trim())
        ) {
          entry.translatedBy[lang] = LOCALE_FILE_LABEL;
        }
      }
    } catch {}

    // Load tooltip strings
    try {
      const file = path.join(tooltipDir, `${lang}.json`);
      const data = JSON.parse(await fs.readFile(file, 'utf8'));
      for (const [k, v] of Object.entries(data)) {
        const { isMeaningful } = analyzeMeaning(k, v);
        if (!isMeaningful) continue;
        const id = `tooltip:${k}`;
        const entry = ensureEntry(id, k, 'tooltip');
        entry.values[lang] = v;
        if (
          v != null &&
          String(v).trim() &&
          (!entry.translatedBy?.[lang] || !entry.translatedBy[lang].trim())
        ) {
          entry.translatedBy[lang] = TOOLTIP_FILE_LABEL;
        }
      }
    } catch {}
  }

  langs.add('en');
  langs.add('mn');

  // Ensure all language fields exist
  for (const entry of Object.values(entries)) {
    for (const lang of langs) {
      if (entry.values[lang] == null) entry.values[lang] = '';
      if (!entry.translatedBy || typeof entry.translatedBy !== 'object') {
        entry.translatedBy = {};
      }
      const label = entry.translatedBy[lang];
      if (typeof label !== 'string') {
        entry.translatedBy[lang] = '';
      }
    }
    if (entry.module == null) entry.module = '';
    if (entry.context == null) entry.context = '';
    if (entry.page == null) entry.page = '';
    if (entry.pageEditable == null) entry.pageEditable = true;
  }

  return { languages: Array.from(langs), entries: Object.values(entries) };
}

function normalizeTranslatedByMap(map) {
  if (!map || typeof map !== 'object') return {};
  const normalized = {};
  for (const [lang, label] of Object.entries(map)) {
    if (typeof label !== 'string') continue;
    const trimmed = label.trim();
    if (trimmed) normalized[lang] = trimmed;
  }
  return normalized;
}

function translatedByEqual(a, b) {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const key of aKeys) {
    if (a[key] !== b[key]) return false;
  }
  return true;
}

export async function saveTranslation({
  key,
  type = 'locale',
  values = {},
  translatedBy = {},
}) {
  if (!key) return;
  const entryId = `${type}:${key}`;
  const translatedByStore = await loadTranslatedByStore();
  const existingTranslatedBy = { ...(translatedByStore[entryId] || {}) };
  const incomingTranslatedBy = normalizeTranslatedByMap(translatedBy);

  for (const [lang, val] of Object.entries(values)) {
    const dir = type === 'tooltip' ? tooltipDir : localesDir;
    const file = path.join(dir, `${lang}.json`);
    let obj = {};
    try {
      obj = JSON.parse(await fs.readFile(file, 'utf8'));
    } catch {}
    if (val == null || val === '') {
      delete obj[key];
      if (existingTranslatedBy[lang] != null) {
        delete existingTranslatedBy[lang];
      }
    } else {
      obj[key] = val;
      if (!incomingTranslatedBy[lang]) {
        incomingTranslatedBy[lang] = MANUAL_ENTRY_LABEL;
      }
    }
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, JSON.stringify(obj, null, 2) + '\n', 'utf8');
  }

  for (const [lang, label] of Object.entries(incomingTranslatedBy)) {
    existingTranslatedBy[lang] = label;
  }

  const normalizedExisting = normalizeTranslatedByMap(existingTranslatedBy);
  const previous = translatedByStore[entryId] || {};
  const hasExisting = Object.keys(normalizedExisting).length > 0;
  const hasPrevious = Object.keys(previous).length > 0;
  const changed = hasExisting
    ? !translatedByEqual(previous, normalizedExisting)
    : hasPrevious;

  if (changed) {
    if (hasExisting) {
      translatedByStore[entryId] = normalizedExisting;
    } else {
      delete translatedByStore[entryId];
    }
    await saveTranslatedByStore(translatedByStore);
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

  const entryId = `${type}:${key}`;
  const translatedByStore = await loadTranslatedByStore();
  if (translatedByStore[entryId]) {
    delete translatedByStore[entryId];
    await saveTranslatedByStore(translatedByStore);
  }
}
