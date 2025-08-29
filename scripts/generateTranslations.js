import fs from 'fs';
import path from 'path';

const languages = ['mn','en','ja','ko','zh','es','de','fr','ru'];
const headerMappingsPath = path.resolve('config/headerMappings.json');
const localesDir = path.resolve('src/erp.mgt.mn/locales');

async function translate(text, to, from = 'mn') {
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${from}&tl=${to}&dt=t&q=${encodeURIComponent(text)}`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to translate to ${to}`);
    const data = await res.json();
    return data[0].map((t) => t[0]).join('');
  } catch (e) {
    console.warn(`Translation service unavailable for ${to}, using source text`);
    return text;
  }
}

async function main() {
  const base = JSON.parse(fs.readFileSync(headerMappingsPath, 'utf8'));

  const locales = {};
  const untranslated = {};
  for (const lang of languages) {
    const file = path.join(localesDir, `${lang}.json`);
    locales[lang] = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
    untranslated[lang] = [];
  }

  for (const key of Object.keys(base)) {
    const value = base[key];
    let sourceText;
    let sourceLang;
    if (value && typeof value === 'object') {
      sourceText = value.mn || value.en;
      sourceLang = value.mn ? 'mn' : 'en';
    } else {
      sourceText = value;
      sourceLang = 'mn';
    }

    if (
      typeof sourceText !== 'string' ||
      !/[\u0400-\u04FF]/.test(sourceText) ||
      sourceText.trim().toLowerCase() === key.toLowerCase()
    ) {
      continue;
    }

    const baseText = locales.en[key] || sourceText;
    const baseLang = locales.en[key] ? 'en' : sourceLang;

    for (const lang of languages) {
      if (!locales[lang][key]) {
        if (lang === baseLang) {
          locales[lang][key] = baseText;
        } else {
          const translation = await translate(baseText, lang, baseLang);
          locales[lang][key] = translation;
          if (translation === baseText) untranslated[lang].push(key);
          console.log(`Translated ${key}: "${baseText}" -> ${lang}`);
        }
      }
    }
  }

  for (const lang of languages) {
    const ordered = Object.keys(locales[lang]).sort().reduce((acc, k) => {
      acc[k] = locales[lang][k];
      return acc;
    }, {});
    const file = path.join(localesDir, `${lang}.json`);
    fs.writeFileSync(file, JSON.stringify(ordered, null, 2));
  }

  for (const lang of languages) {
    if (untranslated[lang].length) {
      console.log(`Untranslated keys for ${lang}: ${untranslated[lang].join(', ')}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
