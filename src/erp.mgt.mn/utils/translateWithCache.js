let nodeCache;
let nodeCachePath;

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
  try {
    const res = await fetch('/api/openai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: `Translate the following text to ${lang}: ${text}` }),
      skipErrorToast: true,
      skipLoader: true,
    });
    if (!res.ok) throw new Error('openai request failed');
    const data = await res.json();
    return data.response?.trim() || text;
  } catch (err) {
    console.error('AI translation failed', err);
    return text;
  }
}

export default async function translateWithCache(lang, text) {
  const key = `${lang}|${text}`;
  let cached = getLS(key);
  if (!cached) cached = await idbGet(key);
  if (!cached) {
    const cache = await loadNodeCache();
    cached = cache[key];
  }
  if (cached) {
    if (!getLS(key)) setLS(key, cached);
    return cached;
  }
  const translated = await requestTranslation(text, lang);
  setLS(key, translated);
  await idbSet(key, translated);
  const cache = await loadNodeCache();
  cache[key] = translated;
  await saveNodeCache();
  return translated;
}
