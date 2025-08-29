import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import OpenAI from 'openai';

const languages = ['mn', 'en', 'ja', 'ko', 'zh', 'es', 'de', 'fr', 'ru'];
const headerMappingsPath = path.resolve('config/headerMappings.json');
const localesDir = path.resolve('src/erp.mgt.mn/locales');

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

async function translateWithGoogle(text, to, from) {
  const params = new URLSearchParams({
    client: 'gtx',
    sl: from,
    tl: to,
    dt: 't',
    q: text,
  });
  const url = `https://translate.googleapis.com/translate_a/single?${params.toString()}`;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        return data[0].map((t) => t[0]).join('');
      }
      const status = res.status;
      if (attempt === 0 && (status === 400 || status === 429 || status >= 500)) {
        console.warn(`Google HTTP ${status}; retrying`);
        continue;
      }
      throw new Error(`HTTP ${status}`);
    } catch (err) {
      if (attempt === 0) {
        console.warn(`Google request failed; retrying (${err.message})`);
        continue;
      }
      throw err;
    }
  }
  throw new Error('Google Translate failed');
}

async function translateWithOpenAI(text, to, from) {
  if (!openai) throw new Error('Missing OpenAI API key');

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: `You are a translation engine. Translate the user text from ${from} to ${to}. Return only the translation.`,
      },
      { role: 'user', content: text },
    ],
  });

  const translation = completion.choices?.[0]?.message?.content?.trim();
  if (!translation) throw new Error('Empty translation from OpenAI');
  return translation;
}

async function translate(text, to, from) {
  try {
    const translated = await translateWithGoogle(text, to, from);
    console.log('    using Google');
    return translated;
  } catch (err) {
    console.warn(`Google translation failed (${from} -> ${to}) for "${text}": ${err.message}`);
    try {
      const translated = await translateWithOpenAI(text, to, from);
      console.log('    using OpenAI');
      return translated;
    } catch (err2) {
      console.warn(`OpenAI translation failed (${from} -> ${to}) for "${text}": ${err2.message}`);
      return text;
    }
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
      sourceLang = /[\u0400-\u04FF]/.test(sourceText) ? 'mn' : 'en';
    }

    if (
      typeof sourceText !== 'string' ||
      (!/[\u0400-\u04FF]/.test(sourceText) && !/[A-Za-z]/.test(sourceText)) ||
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
          console.log(`Translating "${baseText}" (${baseLang} -> ${lang})`);
          const translation = await translate(baseText, lang, baseLang);
          locales[lang][key] = translation;
          if (translation === baseText) untranslated[lang].push(key);
        }
      }
    }
  }

  for (const lang of languages) {
    const ordered = Object.keys(locales[lang])
      .sort()
      .reduce((acc, k) => {
        acc[k] = locales[lang][k];
        return acc;
      }, {});
    const file = path.join(localesDir, `${lang}.json`);
    fs.writeFileSync(file, JSON.stringify(ordered, null, 2));
    if (untranslated[lang].length) {
      console.log(`Untranslated keys for ${lang}: ${untranslated[lang].join(', ')}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

