const localeCache = {};
const aiCache = {};
let aiDisabled = false;

function getCompanyId() {
  try {
    const stored = localStorage.getItem('erp_session_ids');
    if (stored) return JSON.parse(stored).company ?? 0;
  } catch {}
  return 0;
}

async function loadLocale(lang) {
  if (!localeCache[lang]) {
    const companyId = getCompanyId();
    const ids = companyId != null ? [companyId, 0] : [0];
    for (const id of ids) {
      try {
        const res = await fetch(`/config/${id}/locales/${lang}.json`);
        if (res.ok) {
          localeCache[lang] = await res.json();
          break;
        }
      } catch {}
    }
    if (!localeCache[lang]) localeCache[lang] = {};
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
  if (aiDisabled) return text;
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
      return text;
    }
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
