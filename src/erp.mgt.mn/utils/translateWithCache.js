let nodeCache;
let nodeCachePath;
const localeCache = {};
let aiDisabled = false;

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

async function requestTranslation(text, lang) {
  if (aiDisabled) return null;
  try {
    const res = await fetch('/api/openai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: `Translate the following text to ${lang}: ${text}` }),
      skipErrorToast: true,
      skipLoader: true,
    });
    if (res.status === 404) {
      aiDisabled = true;
      return null;
    }
    if (!res.ok) throw new Error('openai request failed');
    const data = await res.json();
    return data.response?.trim() || null;
  } catch (err) {
    console.error('AI translation failed', err);
    return null;
  }
}

function describe(key) {
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export default async function translateWithCache(lang, key, fallback) {
  const locales = await loadLocale(lang);
  if (locales[key]) return locales[key];

  const enLocales = await loadLocale('en');
  const base = enLocales[key] || fallback || describe(key);
  if (lang === 'en') return base;

  const cacheKey = `${lang}|${base}`;
  let cached = getLS(cacheKey);
  if (!cached) cached = await idbGet(cacheKey);
  if (!cached) {
    const cache = await loadNodeCache();
    cached = cache[cacheKey];
  }
  if (cached) {
    if (!getLS(cacheKey)) setLS(cacheKey, cached);
    return cached;
  }

  const translated = await requestTranslation(base, lang);
  if (!translated) return base;

  setLS(cacheKey, translated);
  await idbSet(cacheKey, translated);
  const cache = await loadNodeCache();
  cache[cacheKey] = translated;
  await saveNodeCache();
  return translated;
}
