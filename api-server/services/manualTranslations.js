import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { evaluateTranslationCandidate } from '../../utils/translationValidation.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../');

const localesDir = path.join(projectRoot, 'src', 'erp.mgt.mn', 'locales');
const tooltipDir = path.join(localesDir, 'tooltips');

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

export async function saveTranslation({ key, type = 'locale', values = {} }) {
  if (!key) return;
  for (const [lang, val] of Object.entries(values)) {
    const dir = type === 'tooltip' ? tooltipDir : localesDir;
    const file = path.join(dir, `${lang}.json`);
    let obj = {};
    try {
      obj = JSON.parse(await fs.readFile(file, 'utf8'));
    } catch {}
    if (val == null || val === '') {
      delete obj[key];
    } else {
      obj[key] = val;
    }
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, JSON.stringify(obj, null, 2) + '\n', 'utf8');
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
