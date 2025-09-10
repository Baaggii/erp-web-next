import fs from 'fs/promises';
import path from 'path';

const localesDir = path.resolve(process.cwd(), 'src', 'erp.mgt.mn', 'locales');
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
