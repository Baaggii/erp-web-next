import fs from 'fs/promises';
import fsSync from 'fs';
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

function walkExported(obj, prefix, callback) {
  if (typeof obj === 'string') {
    if (prefix) callback(prefix, obj);
    return;
  }
  if (Array.isArray(obj)) {
    obj.forEach((value, index) => {
      const key = prefix ? `${prefix}.${index}` : String(index);
      walkExported(value, key, callback);
    });
    return;
  }
  if (obj && typeof obj === 'object') {
    for (const [key, value] of Object.entries(obj)) {
      const next = prefix ? `${prefix}.${key}` : key;
      walkExported(value, next, callback);
    }
  }
}

function readExportedTexts() {
  const exportedEntries = new Map();
  const langs = new Set();
  const configDir = path.join(projectRoot, 'config');
  try {
    const tenants = fsSync.readdirSync(configDir, { withFileTypes: true });
    for (const tenant of tenants) {
      if (!tenant.isDirectory()) continue;
      const exportedFile = path.join(configDir, tenant.name, 'exportedtexts.json');
      try {
        const raw = JSON.parse(fsSync.readFileSync(exportedFile, 'utf8'));
        walkExported(raw, '', (key, value) => {
          exportedEntries.set(key, value);
        });
        langs.add('en');
      } catch {}
    }
  } catch {}
  return { exportedEntries, langs };
}

export async function loadTranslations() {
  const { exportedEntries, langs: exportLangs } = readExportedTexts();
  const entries = {};

  for (const [key, value] of exportedEntries.entries()) {
    const localeId = `locale:${key}`;
    const tooltipId = `tooltip:${key}`;
    entries[localeId] = { key, type: 'locale', values: { en: value } };
    entries[tooltipId] = { key, type: 'tooltip', values: { en: value } };
  }

  const localeLangs = await listLangs(localesDir);
  const tooltipLangs = await listLangs(tooltipDir);
  const langs = new Set([...exportLangs, ...localeLangs, ...tooltipLangs]);

  for (const lang of langs) {
    // Load normal locale strings
    try {
      const file = path.join(localesDir, `${lang}.json`);
      const data = JSON.parse(await fs.readFile(file, 'utf8'));
      for (const [k, v] of Object.entries(data)) {
        const id = `locale:${k}`;
        if (!entries[id]) entries[id] = { key: k, type: 'locale', values: {} };
        entries[id].values[lang] = v;
      }
    } catch {}

    // Load tooltip strings
    try {
      const file = path.join(tooltipDir, `${lang}.json`);
      const data = JSON.parse(await fs.readFile(file, 'utf8'));
      for (const [k, v] of Object.entries(data)) {
        const id = `tooltip:${k}`;
        if (!entries[id]) entries[id] = { key: k, type: 'tooltip', values: {} };
        entries[id].values[lang] = v;
      }
    } catch {}
  }

  for (const [k, v] of exportedEntries.entries()) {
    const localeId = `locale:${k}`;
    const tooltipId = `tooltip:${k}`;
    const existingLocale = entries[localeId];
    if (existingLocale) existingLocale.values.en ??= v;
    const existingTooltip = entries[tooltipId];
    if (existingTooltip) existingTooltip.values.en ??= v;
    for (const lang of langs) {
      entries[localeId].values[lang] ??= '';
      entries[tooltipId].values[lang] ??= '';
    }
  }

  // Ensure all language fields exist
  for (const entry of Object.values(entries)) {
    for (const lang of langs) {
      if (entry.values[lang] == null) entry.values[lang] = '';
    }
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
