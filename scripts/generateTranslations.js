import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import OpenAI from 'openai';

const languages = ['en', 'mn', 'ja', 'ko', 'zh', 'es', 'de', 'fr', 'ru'];
const headerMappingsPath = path.resolve('config/headerMappings.json');
const localesDir = path.resolve('src/erp.mgt.mn/locales');
const TIMEOUT_MS = 7000;

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

/* ------------------------- Providers ------------------------- */

async function translateWithGoogle(text, to, from, key) {
  const params = new URLSearchParams({
    client: 'gtx',
    sl: from,
    tl: to,
    dt: 't',
    q: text,
  });
  const url = `https://translate.googleapis.com/translate_a/single?${params.toString()}`;

  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);

      if (!res.ok) {
        const status = res.status;
        if (
          attempt === 0 &&
          (status === 400 || status === 429 || status >= 500)
        ) {
          console.warn(`[gen-i18n] Google HTTP ${status}; retrying`);
          continue;
        }
        throw new Error(`HTTP ${status}`);
      }

      let data;
      try {
        data = await res.json();
      } catch (err) {
        throw new Error(
          `parse error for key="${key}" (${from}->${to}): ${err.message}`,
        );
      }
      if (!Array.isArray(data) || !Array.isArray(data[0])) {
        throw new Error(
          `unexpected response for key="${key}" (${from}->${to})`,
        );
      }
      return data[0].map((seg) => seg[0]).join('');
    } catch (err) {
      clearTimeout(timer);
      if (attempt === 0 && err.name === 'AbortError') {
        console.warn('[gen-i18n] Google request timeout; retrying');
        continue;
      }
      throw err;
    }
  }
  throw new Error(
    `Google translate failed for key="${key}" (${from}->${to})`,
  );
}

async function translateWithOpenAI(text, to, from, key) {
  if (!openai) throw new Error('missing OpenAI API key');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are a translation engine. Translate the user text from ${from} to ${to}. Return only the translation.`,
        },
        { role: 'user', content: text },
      ],
      signal: controller.signal,
    });
    clearTimeout(timer);

    const translation = completion.choices?.[0]?.message?.content?.trim();
    if (!translation) throw new Error('empty response');
    return translation;
  } catch (err) {
    clearTimeout(timer);
    throw new Error(
      `OpenAI error for key="${key}" (${from}->${to}): ${err.message}`,
    );
  }
}

/* ---------------------- Translate wrapper -------------------- */

async function translate(text, to, from, key) {
  try {
    const t = await translateWithGoogle(text, to, from, key);
    console.log('    using Google');
    return t;
  } catch (err) {
    console.warn(
      `[gen-i18n] Google failed key="${key}" (${from}->${to}): ${err.message}`,
    );
    try {
      const t = await translateWithOpenAI(text, to, from, key);
      console.log('    using OpenAI');
      return t;
    } catch (err2) {
      console.warn(
        `[gen-i18n] FAILED key="${key}" (${from}->${to}): ${err2.message}`,
      );
      console.warn('    falling back to source');
      return text;
    }
  }
}

/* --------------------------- Main ---------------------------- */

async function main() {
  console.log('[gen-i18n] START');

  const base = JSON.parse(fs.readFileSync(headerMappingsPath, 'utf8'));
  const entries = [];

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
    entries.push({ key, sourceText, sourceLang });
  }

  await fs.promises.mkdir(localesDir, { recursive: true });
  const locales = {};

  for (const lang of languages) {
    const file = path.join(localesDir, `${lang}.json`);
    locales[lang] = fs.existsSync(file)
      ? JSON.parse(fs.readFileSync(file, 'utf8'))
      : {};

    for (const { key, sourceText, sourceLang } of entries) {
      if (locales[lang][key]) continue;

      if (lang === sourceLang) {
        locales[lang][key] = sourceText;
        continue;
      }

      let baseText = sourceText;
      let fromLang = sourceLang;
      if (lang !== 'en' && locales.en && locales.en[key]) {
        baseText = locales.en[key];
        fromLang = 'en';
      }

      console.log(`Translating "${baseText}" (${fromLang} -> ${lang})`);
      const translated = await translate(baseText, lang, fromLang, key);
      locales[lang][key] = translated;
    }

    const ordered = Object.keys(locales[lang])
      .sort()
      .reduce((acc, k) => {
        acc[k] = locales[lang][k];
        return acc;
      }, {});
    await fs.promises.writeFile(file, JSON.stringify(ordered, null, 2));
    console.log(
      `[gen-i18n] wrote ${lang}.json (${Object.keys(ordered).length} keys)`,
    );
  }

  console.log('[gen-i18n] DONE');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

