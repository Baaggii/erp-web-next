import fs from 'fs';
import path from 'path';

const languages = ['mn', 'en', 'ja', 'ko', 'zh', 'es', 'de', 'fr', 'ru'];
const headerMappingsPath = path.resolve('config/headerMappings.json');
const localesDir = path.resolve('src/erp.mgt.mn/locales');

const failedLanguages = new Set();
const writeFailures = new Set();

function appendEnglishFromPages(locales, added) {
  const srcDir = path.resolve('src/erp.mgt.mn');
  const tRegex = /t\(\s*['"]([^'"\)]+)['"]\s*,\s*['"]([^'"\)]+)['"]\s*\)/g;
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name.endsWith('.js') || entry.name.endsWith('.jsx')) {
        const text = fs.readFileSync(full, 'utf8');
        let match;
        while ((match = tRegex.exec(text))) {
          const key = match[1];
          const phrase = match[2];
          if (/[\u0400-\u04FF]/.test(phrase)) continue;
          const existing = locales.en[key];
          if (!existing || /[\u0400-\u04FF]/.test(existing)) {
            locales.en[key] = phrase;
            added.en++;
            console.log(`Added English phrase from pages: ${key} -> "${phrase}"`);
          }
        }
      }
    }
  }
  walk(srcDir);
}

async function translate(text, to, from = 'mn') {
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${from}&tl=${to}&dt=t&q=${encodeURIComponent(text)}`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to translate to ${to}`);
    const data = await res.json();
    return { text: data[0].map((t) => t[0]).join(''), success: true };
  } catch (e) {
    failedLanguages.add(to);
    return { text, success: false, error: e };
  }
}

async function main() {
  const base = JSON.parse(fs.readFileSync(headerMappingsPath, 'utf8'));

  const locales = {};
  const untranslated = {};
  const added = {};
  for (const lang of languages) {
    const file = path.join(localesDir, `${lang}.json`);
    locales[lang] = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
    untranslated[lang] = [];
    added[lang] = 0;
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
      if (lang === 'mn') {
        const existing = locales[lang][key];
        locales[lang][key] = sourceText;
        if (existing !== sourceText) {
          console.log(`Set Mongolian source for ${key}: "${sourceText}"`);
          added[lang]++;
        }
        continue;
      }
      if (!locales[lang][key]) {
        if (lang === baseLang) {
          locales[lang][key] = baseText;
          console.log(`Skipped translation for ${key} (${baseLang})`);
        } else {
          const { text: translation, success, error } = await translate(baseText, lang, baseLang);
          locales[lang][key] = translation;
          if (success) {
            console.log(`Translated "${baseText}" (${baseLang} -> ${lang}): "${translation}"`);
          } else {
            untranslated[lang].push(key);
            console.error(
              `Failed to translate "${baseText}" (${baseLang} -> ${lang}): ${error?.message || 'unknown error'}`
            );
          }
        }
        added[lang]++;
      }
    }
  }

  appendEnglishFromPages(locales, added);

  for (const lang of languages) {
    const ordered = Object.keys(locales[lang])
      .sort()
      .reduce((acc, k) => {
        acc[k] = locales[lang][k];
        return acc;
      }, {});
    const file = path.join(localesDir, `${lang}.json`);
    try {
      fs.writeFileSync(file, JSON.stringify(ordered, null, 2) + '\n');
      if (added[lang]) {
        console.log(`Updated ${lang}.json with ${added[lang]} new translations`);
      } else {
        console.log(`${lang}.json already up to date`);
      }
    } catch (e) {
      writeFailures.add(lang);
      console.error(`Failed to write ${lang}.json: ${e.message}`);
    }
  }

  for (const lang of languages) {
    if (untranslated[lang].length) {
      console.warn(`Untranslated ${untranslated[lang].length} keys for ${lang}`);
    }
  }

  if (failedLanguages.size) {
    console.error(`Translation service unavailable for: ${[...failedLanguages].join(', ')}`);
  } else {
    console.log('All translations completed successfully');
  }

  if (writeFailures.size) {
    console.error(`Failed to update locales for: ${[...writeFailures].join(', ')}`);
  } else {
    console.log('Locale files updated successfully');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
