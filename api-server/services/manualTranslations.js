import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../');

const localesDir = path.join(projectRoot, 'src', 'erp.mgt.mn', 'locales');
const tooltipDir = path.join(localesDir, 'tooltips');

async function listLangs(dir) {
  try {
    const files = await fs.readdir(dir);
    return files.filter((f) => f.endsWith('.json')).map((f) => path.basename(f, '.json'));
  } catch {
    return [];
  }
}

const cyrillicRegex = /[\u0400-\u04FF]/;
const latinRegex = /[A-Za-z]/;

function detectLang(str) {
  if (typeof str !== 'string') return undefined;
  if (cyrillicRegex.test(str)) return 'mn';
  if (latinRegex.test(str)) return 'en';
  return undefined;
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
          const detectedLang = detectLang(v);
          const targetLangs = detectedLang ? [detectedLang] : ['en'];
          for (const langKey of targetLangs) {
            langs.add(langKey);
            if (localeEntry.values[langKey] == null) localeEntry.values[langKey] = v;
            if (tooltipEntry.values[langKey] == null) tooltipEntry.values[langKey] = v;
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
  }

  return { languages: Array.from(langs), entries: Object.values(entries) };
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
