const localeCache = {};
const aiCache = {};

async function loadLocale(lang) {
  if (!localeCache[lang]) {
    try {
      localeCache[lang] = (await import(`../locales/${lang}.json`)).default;
    } catch (err) {
      console.error('Failed to load locale', lang, err);
      localeCache[lang] = {};
    }
  }
  return localeCache[lang];
}

function getCache(lang) {
  if (!aiCache[lang]) {
    try {
      aiCache[lang] = JSON.parse(localStorage.getItem(`ai-translations-${lang}`) || '{}');
    } catch {
      aiCache[lang] = {};
    }
  }
  return aiCache[lang];
}

function saveCache(lang) {
  localStorage.setItem(`ai-translations-${lang}`, JSON.stringify(aiCache[lang]));
}

async function requestAI(text, lang) {
  try {
    const res = await fetch('/api/openai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: `Translate the following text to ${lang}: ${text}` }),
    });
    if (!res.ok) throw new Error('AI request failed');
    const data = await res.json();
    return data.response?.trim() || text;
  } catch (err) {
    console.error('AI translation failed', err);
    return text;
  }
}

export default async function translateWithAI(lang, key, fallback) {
  const locales = await loadLocale(lang);
  if (locales[key]) return locales[key];
  const cache = getCache(lang);
  if (cache[key]) return cache[key];
  const text = fallback ?? key;
  const translated = await requestAI(text, lang);
  cache[key] = translated;
  saveCache(lang);
  return translated;
}
