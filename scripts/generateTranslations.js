// scripts/generateTranslations.js
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

/* ---------------- Utilities ---------------- */
function sortObj(o) {
  return Object.keys(o).sort().reduce((acc, k) => (acc[k] = o[k], acc), {});
}

function writeLocaleFile(lang, obj) {
  const file = path.join(localesDir, `${lang}.json`);
  const ordered = sortObj(obj);
  fs.writeFileSync(file, JSON.stringify(ordered, null, 2));
  console.log(`[gen-i18n] wrote ${file} (${Object.keys(ordered).length} keys)`);
}

function collectPhrasesFromPages(dir) {
  const files = [];
  function walk(d) {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(jsx?|tsx?)$/.test(entry.name)) files.push(full);
    }
  }
  walk(dir);

  const regex = /\bt\(\s*['"]([^'"]+)['"]\s*(?:,\s*['"]([^'"]+)['"])?\s*\)/g;
  const pairs = [];
  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    let match;
    while ((match = regex.exec(content))) {
      pairs.push({ key: match[1], text: match[2] || match[1] });
    }
  }
  return pairs;
}

async function fetchModules() {
  try {
    const db = await import('../db/index.js');
    try {
      const [rows] = await db.pool.query(
        'SELECT module_key AS moduleKey, label FROM modules',
      );
      await db.pool.end();
      return rows.map((r) => ({ moduleKey: r.moduleKey, label: r.label }));
    } catch (err) {
      console.warn(
        `[gen-i18n] DB query failed; falling back to defaults: ${err.message}`,
      );
      try { await db.pool.end(); } catch {}
    }
  } catch (err) {
    console.warn(
      `[gen-i18n] Failed to load DB modules; falling back: ${err.message}`,
    );
  }
  const fallback = await import('../db/defaultModules.js');
  return fallback.default.map(({ moduleKey, label }) => ({ moduleKey, label }));
}

/* ---------------- Providers ---------------- */

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

async function translateWithOpenAI(text, from, to) {
  if (!openai) throw new Error('missing OpenAI API key');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const completion = await openai.chat.completions.create(
      {
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content:
              'You are translating phrases for an ERP application; keep field names professional and domain-specific.',
          },
          {
            role: 'system',
            content:
              'You are a translation assistant. Respond with a JSON object { "translation": "...", "tooltip": "..." }.',
          },
          {
            role: 'user',
            content: `Translate the following ${from}-language ERP system term into ${to}. Use ERP terminology.\n\n${text}`,
          },
        ],
        response_format: { type: 'json_object' },
      },
      { signal: controller.signal }
    );
    clearTimeout(timer);

    const content = completion.choices?.[0]?.message?.content?.trim();
    if (!content) throw new Error('empty response');
    let data;
    try {
      data = JSON.parse(content);
    } catch (err) {
      throw new Error(`Invalid JSON response: ${err.message}`);
    }
    if (!data.translation) throw new Error('missing translation field');
    return { translation: data.translation, tooltip: data.tooltip };
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

/* ---------------- Main ---------------- */

async function main() {
  console.log('[gen-i18n] START');
  const base = JSON.parse(fs.readFileSync(headerMappingsPath, 'utf8'));
  const modules = await fetchModules();
  let headerMappingsUpdated = false;
  const entryMap = new Map();

  function addEntry(key, sourceText, sourceLang) {
    if (
      typeof sourceText !== 'string' ||
      (!/[\u0400-\u04FF]/.test(sourceText) && !/[A-Za-z]/.test(sourceText)) ||
      sourceText.trim().toLowerCase() === key.toLowerCase() ||
      entryMap.has(key)
    ) {
      return;
    }
    entryMap.set(key, { key, sourceText, sourceLang });
  }

  for (const { moduleKey, label } of modules) {
    if (base[moduleKey] === undefined) {
      base[moduleKey] = label;
      headerMappingsUpdated = true;
    }
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
    addEntry(key, sourceText, sourceLang);
  }

  const tPairs = collectPhrasesFromPages(path.resolve('src/erp.mgt.mn'));
  for (const { key, text } of tPairs) {
    const sourceLang = /[\u0400-\u04FF]/.test(text) ? 'mn' : 'en';
    if (base[key] === undefined) {
      base[key] = text;
      headerMappingsUpdated = true;
    }
    addEntry(key, text, sourceLang);
  }

  if (headerMappingsUpdated) {
    const ordered = sortObj(base);
    fs.writeFileSync(headerMappingsPath, JSON.stringify(ordered, null, 2));
    console.log(`[gen-i18n] updated ${headerMappingsPath}`);
  }

  const entries = Array.from(entryMap.values());

  await fs.promises.mkdir(localesDir, { recursive: true });
  const locales = {};

  for (const lang of languages) {
    const file = path.join(localesDir, `${lang}.json`);
    locales[lang] = fs.existsSync(file)
      ? JSON.parse(fs.readFileSync(file, 'utf8'))
      : {};
    if (!locales[lang].tooltip) locales[lang].tooltip = {};
  }

  for (const { key, sourceText, sourceLang } of entries) {
    if (!locales[sourceLang][key]) {
      locales[sourceLang][key] = sourceText;
    }
  }

  ['en', 'mn'].forEach((lng) => {
    if (locales[lng]) writeLocaleFile(lng, locales[lng]);
  });

  for (const lang of languages) {
    let counter = 0;

    for (const { key, sourceText, sourceLang } of entries) {
      if (sourceLang === 'mn' && !/[\u0400-\u04FF]/.test(sourceText)) continue;
      if (sourceLang === 'en' && !/[A-Za-z]/.test(sourceText)) continue;

      const existing = locales[lang][key];
      const existingTooltip = locales[lang].tooltip[key];

      if (lang === 'mn' && sourceLang === 'en') {
        console.log(`Translating "${sourceText}" (en -> mn)`);
        let translation;
        let tooltip;
        let provider = 'OpenAI';
        try {
          ({ translation, tooltip } = await translateWithOpenAI(
            sourceText,
            'en',
            'mn',
          ));
        } catch (err) {
          console.warn(
            `[gen-i18n] OpenAI failed key="${key}" (en->mn): ${err.message}`,
          );
          provider = undefined;
        }

        if (!translation) {
          try {
            translation = await translateWithGoogle(sourceText, 'mn', 'en', key);
            provider = provider || 'Google';
          } catch (err) {
            console.warn(
              `[gen-i18n] Google failed key="${key}" (en->mn): ${err.message}`,
            );
            translation = sourceText;
          }
        }

        if (!existing) {
          locales.mn[key] = translation;
        } else if (translation.trim() !== existing.trim()) {
          console.log(
            `[gen-i18n] replaced mn.${key}: "${existing}" -> "${translation}"`,
          );
          locales.mn[key] = translation;
        }
        if (tooltip) {
          if (!existingTooltip) {
            locales.mn.tooltip[key] = tooltip;
          } else if (tooltip.trim() !== existingTooltip.trim()) {
            console.log(
              `[gen-i18n] replaced tooltip for mn.${key}: "${existingTooltip}" -> "${tooltip}"`,
            );
            locales.mn.tooltip[key] = tooltip;
          }
        }
        if (translation === sourceText) {
          console.log(
            `[gen-i18n] Mongolian translation for ${key} fell back to English`,
          );
        } else {
          console.log(
            `[gen-i18n] Mongolian translation for ${key} succeeded`,
          );
        }
      } else if (lang === sourceLang) {
        locales[lang][key] = sourceText;
      } else {
        let baseText = sourceText;
        let fromLang = sourceLang;
        if (lang !== 'en' && locales.en && locales.en[key]) {
          baseText = locales.en[key];
          fromLang = 'en';
        }

        console.log(`Translating "${baseText}" (${fromLang} -> ${lang})`);
        let provider = 'OpenAI';
        try {
          const { translation, tooltip } = await translateWithOpenAI(
            baseText,
            fromLang,
            lang,
          );
          if (!existing) {
            locales[lang][key] = translation;
          } else if (translation.trim() !== existing.trim()) {
            console.log(
              `[gen-i18n] replaced ${lang}.${key}: "${existing}" -> "${translation}"`,
            );
            locales[lang][key] = translation;
          }
          if (tooltip) {
            if (!existingTooltip) {
              locales[lang].tooltip[key] = tooltip;
            } else if (tooltip.trim() !== existingTooltip.trim()) {
              console.log(
                `[gen-i18n] replaced tooltip for ${lang}.${key}: "${existingTooltip}" -> "${tooltip}"`,
              );
              locales[lang].tooltip[key] = tooltip;
            }
          }
        } catch (err) {
          console.warn(
            `[gen-i18n] OpenAI failed key="${key}" (${fromLang}->${lang}): ${err.message}`,
          );
          provider = undefined;
        }

        if (!provider) {
          const t = await translateWithGoogle(baseText, lang, fromLang, key);
          if (!existing) {
            locales[lang][key] = t;
          } else if (t.trim() !== existing.trim()) {
            console.log(
              `[gen-i18n] replaced ${lang}.${key}: "${existing}" -> "${t}"`,
            );
            locales[lang][key] = t;
          }
          provider = 'Google';
        }
        console.log(`    using ${provider}`);
      }

      counter++;
      if (counter % 10 === 0) {
        writeLocaleFile(lang, locales[lang]);
      }
    }

    writeLocaleFile(lang, locales[lang]);
  }

  console.log('[gen-i18n] DONE');
}

/* ---------------- Error Guards ---------------- */

process.on('unhandledRejection', (err) => {
  console.error('[gen-i18n] UNHANDLED REJECTION', err);
  process.exit(2);
});
process.on('uncaughtException', (err) => {
  console.error('[gen-i18n] UNCAUGHT EXCEPTION', err);
  process.exit(3);
});

main().catch((err) => {
  console.error('[gen-i18n] FATAL', err);
  process.exit(1);
});
