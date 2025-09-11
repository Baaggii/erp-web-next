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

export async function loadTranslations() {
  const langs = new Set([
    ...(await listLangs(localesDir)),
    ...(await listLangs(tooltipDir)),
  ]);
  const entries = {};

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

  // Merge keys from exported hardcoded texts
  try {
    const configDir = path.join(projectRoot, 'config');
    const tenants = await fs.readdir(configDir, { withFileTypes: true });
    for (const dirent of tenants) {
      if (!dirent.isDirectory()) continue;
      const file = path.join(configDir, dirent.name, 'exportedtexts.json');
      try {
        const data = JSON.parse(await fs.readFile(file, 'utf8'));
        for (const [k, v] of Object.entries(data)) {
          const id = `locale:${k}`;
          if (!entries[id]) entries[id] = { key: k, type: 'locale', values: {} };
          if (v && typeof v === 'object') {
            for (const [lng, text] of Object.entries(v)) {
              langs.add(lng);
              if (entries[id].values[lng] === undefined) {
                entries[id].values[lng] = text;
              }
            }
          } else if (v != null && entries[id].values.en === undefined) {
            langs.add('en');
            entries[id].values.en = v;
          }
        }
      } catch {}
    }
  } catch {}

  const langList = Array.from(langs);
  for (const entry of Object.values(entries)) {
    for (const lang of langList) {
      if (entry.values[lang] === undefined) entry.values[lang] = '';
    }
  }

  return { languages: langList, entries: Object.values(entries) };
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
