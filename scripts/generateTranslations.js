// scripts/generateTranslations.js
import fs from 'fs';
import path from 'path';
import {
  tenantConfigPath,
  getConfigPathSync,
} from '../api-server/utils/configPaths.js';
let OpenAI;
try {
  ({ default: OpenAI } = await import('../api-server/utils/openaiClient.js'));
} catch {}
import { slugify } from '../api-server/utils/slugify.js';
import {
  collectPhrasesFromPages,
  fetchModules,
  sortObj,
} from '../api-server/utils/translationHelpers.js';

let log = console.log;

const languages = ['en', 'mn', 'ja', 'ko', 'zh', 'es', 'de', 'fr', 'ru'];
const languageNames = {
  en: 'English',
  mn: 'Mongolian',
  ja: 'Japanese',
  ko: 'Korean',
  zh: 'Chinese',
  es: 'Spanish',
  de: 'German',
  fr: 'French',
  ru: 'Russian',
};
const companyId = process.env.COMPANY_ID || 0;
const { path: headerMappingsPath } = getConfigPathSync(
  'headerMappings.json',
  companyId,
);
const { path: transactionFormsPath } = getConfigPathSync(
  'transactionForms.json',
  companyId,
);
const localesDir = tenantConfigPath('locales', companyId);
const tooltipsDir = path.join(localesDir, 'tooltips');
const TIMEOUT_MS = 7000;

/* ---------------- Utilities ---------------- */

function syncKeys(targetA, targetB, label) {
  const keysA = Object.keys(targetA || {});
  const keysB = Object.keys(targetB || {});
  const missingFromA = keysB.filter((k) => !(k in targetA));
  const missingFromB = keysA.filter((k) => !(k in targetB));

  for (const key of missingFromA) targetA[key] = targetB[key];
  for (const key of missingFromB) targetB[key] = targetA[key];

  if (missingFromA.length || missingFromB.length) {
    console.warn(
      `[gen-i18n] WARNING: en and mn ${label} key sets differ (missing in en: ${missingFromA.length}, missing in mn: ${missingFromB.length})`,
    );
  }

  const aCount = Object.keys(targetA).length;
  const bCount = Object.keys(targetB).length;
  if (aCount !== bCount) {
    console.warn(
      `[gen-i18n] WARNING: en and mn ${label} key counts differ (${aCount} vs ${bCount})`,
    );
  }
}

function hasRepeatedPunctuation(str) {
  return /([!?,.])\1{1,}/.test(str);
}

function hasPlaceholderPhrase(str) {
  return /translated term is not found/i.test(str);
}

function hasMixedScripts(str) {
  let count = 0;
  if (/[A-Za-z]/.test(str)) count++;
  if (/[\u0400-\u04FF]/.test(str)) count++;
  if (/[\u4E00-\u9FFF\u3400-\u4DBF\uF900-\uFAFF\u3040-\u30FF\u31F0-\u31FF\uAC00-\uD7AF]/.test(str))
    count++;
  return count > 1;
}

function isInvalidString(str) {
  return (
    hasRepeatedPunctuation(str) ||
    hasPlaceholderPhrase(str) ||
    hasMixedScripts(str)
  );
}
function detectLang(str) {
  if (/\u0400-\u04FF/.test(str)) return 'mn';
  if (/[A-Za-z]/.test(str)) return 'en';
  return undefined;
}

function getNested(obj, keyPath) {
  return keyPath.split('.').reduce((o, k) => (o && o[k] !== undefined ? o[k] : undefined), obj);
}

function writeLocaleFile(lang, obj) {
  const file = path.join(localesDir, `${lang}.json`);
  const ordered = sortObj(obj);
  if (ordered.tooltip) {
    ordered.tooltip = sortObj(ordered.tooltip);
  }
  fs.writeFileSync(file, JSON.stringify(ordered, null, 2));
  log(`[gen-i18n] wrote ${file} (${Object.keys(ordered).length} keys)`);
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
  if (!OpenAI) throw new Error('missing OpenAI API key');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const sourceLang = from === 'mn' ? 'Mongolian' : 'English';
  const targetLang = languageNames[to] || to;
  const prompt = `Translate this ${sourceLang} ERP term into ${targetLang}. Respond only with a JSON object like {"translation":"...", "tooltip":"..."} and no additional commentary. The text is ${sourceLang}, not Russian.\n\n${text}`;
  try {
    const completion = await OpenAI.chat.completions.create(
      {
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
      },
      { signal: controller.signal }
    );
    clearTimeout(timer);
    const content = completion.choices?.[0]?.message?.content?.trim();
    if (!content) throw new Error('empty response');
    let parsed;
    try {
      const json = content.replace(/```json|```/g, '').trim();
      parsed = JSON.parse(json);
    } catch (err) {
      throw new Error(`invalid JSON response: ${err.message}`);
    }
    const { translation, tooltip } = parsed;
    if (typeof translation !== 'string' || typeof tooltip !== 'string') {
      throw new Error('missing fields in response');
    }
    return { translation: translation.trim(), tooltip: tooltip.trim() };
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

/* ---------------- Main ---------------- */

export async function generateTranslations({ onLog = console.log, signal } = {}) {
  log = onLog;
  const checkAbort = () => {
    if (signal?.aborted) throw new Error('Aborted');
  };

  try {
    log('[gen-i18n] START');
    const base = JSON.parse(fs.readFileSync(headerMappingsPath, 'utf8'));
    const modules = await fetchModules();
    let headerMappingsUpdated = false;
    const entryMap = new Map();

  function addEntry(key, sourceText, sourceLang, origin) {
    if (
      typeof sourceText !== 'string' ||
      (!/[\u0400-\u04FF]/.test(sourceText) && !/[A-Za-z]/.test(sourceText)) ||
      sourceText.trim().toLowerCase() === key.toLowerCase() ||
      entryMap.has(key)
    ) {
      return;
    }
    entryMap.set(key, { key, sourceText, sourceLang, origin });
  }

  for (const { moduleKey, label } of modules) {
    checkAbort();
    if (base[moduleKey] === undefined) {
      base[moduleKey] = label;
      headerMappingsUpdated = true;
    }
    const sourceLang = /[\u0400-\u04FF]/.test(label) ? 'mn' : 'en';
    addEntry(moduleKey, label, sourceLang, 'module');
  }

  for (const key of Object.keys(base)) {
    checkAbort();
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
    addEntry(key, sourceText, sourceLang, 'table');
  }

  const tPairs = collectPhrasesFromPages(path.resolve('src/erp.mgt.mn'));
  for (const { key, text } of tPairs) {
    checkAbort();
    const sourceLang = /[\u0400-\u04FF]/.test(text) ? 'mn' : 'en';
    if (base[key] === undefined) {
      base[key] = text;
      headerMappingsUpdated = true;
    }
    addEntry(key, text, sourceLang, 'page');
  }

  try {
    const formConfigs = JSON.parse(
      fs.readFileSync(transactionFormsPath, 'utf8'),
    );
    for (const forms of Object.values(formConfigs)) {
      checkAbort();
      if (!forms || typeof forms !== 'object') continue;
      for (const [formName, config] of Object.entries(forms)) {
        checkAbort();
        const formSlug = slugify(formName);
        const sourceLang = /[\u0400-\u04FF]/.test(formName) ? 'mn' : 'en';
        addEntry(`form.${formSlug}`, formName, sourceLang, 'form');

        function walk(obj, pathSegs) {
          if (!obj || typeof obj !== 'object') return;
          for (const [k, v] of Object.entries(obj)) {
            const segs = [...pathSegs, slugify(k)];
            if (typeof v === 'string') {
              if (/^[a-z0-9_.]+$/.test(v)) continue;
              const lang = /[\u0400-\u04FF]/.test(v) ? 'mn' : 'en';
              addEntry(`form.${segs.join('.')}`, v, lang, 'form');
            } else if (Array.isArray(v)) {
              for (const item of v) {
                if (item && typeof item === 'object') {
                  walk(item, segs);
                } else if (typeof item === 'string' && !/^[a-z0-9_.]+$/.test(item)) {
                  const lang = /[\u0400-\u04FF]/.test(item) ? 'mn' : 'en';
                  addEntry(
                    `form.${segs.join('.')}.${slugify(item)}`,
                    item,
                    lang,
                    'form',
                  );
                }
              }
            } else {
              walk(v, segs);
            }
          }
        }
        walk(config, [formSlug]);
      }
    }
  } catch (err) {
    console.warn(`[gen-i18n] Failed to load forms: ${err.message}`);
  }

  const skipString = /^[a-z0-9_.\/:-]+$/;

  try {
    const ulaConfig = JSON.parse(
      fs.readFileSync(
        getConfigPathSync('userLevelActions.json', companyId).path,
        'utf8',
      ),
    );
    function walkUla(obj, pathSegs) {
      if (!obj || typeof obj !== 'object') return;
      if (Array.isArray(obj)) {
        for (const item of obj) {
          if (item && typeof item === 'object') {
            walkUla(item, pathSegs);
          } else if (typeof item === 'string' && !skipString.test(item)) {
            const lang = /[\u0400-\u04FF]/.test(item) ? 'mn' : 'en';
            const baseKey = pathSegs.length
              ? `userLevelActions.${pathSegs.join('.')}`
              : 'userLevelActions';
            addEntry(
              `${baseKey}.${slugify(item)}`,
              item,
              lang,
              'userLevelActions',
            );
          }
        }
      } else {
        for (const [k, v] of Object.entries(obj)) {
          const segs = [...pathSegs, slugify(k)];
          if (typeof v === 'string') {
            if (skipString.test(v)) continue;
            const lang = /[\u0400-\u04FF]/.test(v) ? 'mn' : 'en';
            addEntry(
              `userLevelActions.${segs.join('.')}`,
              v,
              lang,
              'userLevelActions',
            );
          } else {
            walkUla(v, segs);
          }
        }
      }
    }
    walkUla(ulaConfig, []);
  } catch (err) {
    console.warn(`[gen-i18n] Failed to load user level actions: ${err.message}`);
  }

  try {
    const posConfig = JSON.parse(
      fs.readFileSync(
        getConfigPathSync('posTransactionConfig.json', companyId).path,
        'utf8',
      ),
    );
    function walkPos(obj, pathSegs) {
      if (!obj || typeof obj !== 'object') return;
      if (Array.isArray(obj)) {
        for (const item of obj) {
          if (item && typeof item === 'object') {
            const itemSeg = slugify(
              item.name || item.key || item.id || item.table || item.form || '',
            );
            walkPos(item, itemSeg ? [...pathSegs, itemSeg] : pathSegs);
          } else if (typeof item === 'string' && !skipString.test(item)) {
            const lang = /[\u0400-\u04FF]/.test(item) ? 'mn' : 'en';
            const baseKey = pathSegs.length
              ? `posTransactionConfig.${pathSegs.join('.')}`
              : 'posTransactionConfig';
            addEntry(
              `${baseKey}.${slugify(item)}`,
              item,
              lang,
              'posTransactionConfig',
            );
          }
        }
      } else {
        for (const [k, v] of Object.entries(obj)) {
          const segs = [...pathSegs, slugify(k)];
          if (typeof v === 'string') {
            if (skipString.test(v)) continue;
            const lang = /[\u0400-\u04FF]/.test(v) ? 'mn' : 'en';
            addEntry(
              `posTransactionConfig.${segs.join('.')}`,
              v,
              lang,
              'posTransactionConfig',
            );
          } else {
            walkPos(v, segs);
          }
        }
      }
    }
    walkPos(posConfig, []);
  } catch (err) {
    console.warn(`[gen-i18n] Failed to load POS config: ${err.message}`);
  }

  if (headerMappingsUpdated) {
    const ordered = sortObj(base);
    fs.writeFileSync(headerMappingsPath, JSON.stringify(ordered, null, 2));
    log(`[gen-i18n] updated ${headerMappingsPath}`);
  }

  const entries = Array.from(entryMap.values());

  await fs.promises.mkdir(localesDir, { recursive: true });
  await fs.promises.mkdir(tooltipsDir, { recursive: true });
  const locales = {};
  const fixedKeys = new Set();

  for (const lang of languages) {
    const file = path.join(localesDir, `${lang}.json`);
    locales[lang] = fs.existsSync(file)
      ? JSON.parse(fs.readFileSync(file, 'utf8'))
      : {};
    if (!locales[lang].tooltip) locales[lang].tooltip = {};
  }

  // Load existing English and Mongolian tooltips before syncing keys
  const enTipPath = path.join(tooltipsDir, 'en.json');
  if (locales.en && fs.existsSync(enTipPath)) {
    locales.en.tooltip = JSON.parse(fs.readFileSync(enTipPath, 'utf8'));
  }
  const mnTipPath = path.join(tooltipsDir, 'mn.json');
  if (locales.mn && fs.existsSync(mnTipPath)) {
    locales.mn.tooltip = JSON.parse(fs.readFileSync(mnTipPath, 'utf8'));
  }

  async function ensureLanguage(localeObj, lang, prefix = '', skip = []) {
    if (!localeObj || typeof localeObj !== 'object') return;
    for (const [k, v] of Object.entries(localeObj)) {
      if (skip.includes(k)) continue;
      const keyPath = prefix ? `${prefix}.${k}` : k;
      if (typeof v === 'string') {
        const sourceLang = detectLang(v);
        const needsFix = (sourceLang && sourceLang !== lang) || isInvalidString(v);
        if (needsFix) {
          const candidates = [];
          const enVal = lang !== 'en' ? getNested(locales.en, keyPath) : undefined;
          const mnVal = lang !== 'mn' ? getNested(locales.mn, keyPath) : undefined;
          if (enVal) candidates.push({ text: enVal, lang: 'en' });
          if (mnVal) candidates.push({ text: mnVal, lang: 'mn' });
          candidates.push({ text: v, lang: sourceLang || lang });

          let translated = null;
          for (const src of candidates) {
            try {
              const res = await translateWithGoogle(
                src.text,
                lang,
                src.lang,
                keyPath,
              );
              const resLang = detectLang(res);
              if (isInvalidString(res) || (resLang && resLang !== lang)) {
                continue;
              }
              translated = res;
              console.warn(
                `[gen-i18n] WARNING: corrected ${lang}.${keyPath}: "${v}" -> "${translated}"`,
              );
              break;
            } catch (err) {
              console.warn(
                `[gen-i18n] ensureLanguage translation failed ${src.lang}->${lang} for ${keyPath}: ${err.message}`,
              );
            }
          }

          if (!translated) {
            const fallback = candidates[0]?.text ?? v;
            translated = fallback;
            console.warn(
              `[gen-i18n] WARNING: fallback ${lang}.${keyPath}: "${v}" -> "${translated}"`,
            );
          }

          localeObj[k] = translated;
          fixedKeys.add(`${lang}.${keyPath}`);
        }
      } else if (v && typeof v === 'object') {
        await ensureLanguage(v, lang, keyPath);
      }
    }
  }

  async function saveLocale(lang) {
    await ensureLanguage(locales[lang], lang, '', ['tooltip']);
    if (locales[lang].tooltip) {
      await ensureLanguage(locales[lang].tooltip, lang, 'tooltip');
    }
    writeLocaleFile(lang, locales[lang]);
  }

  // Ensure English and Mongolian locales contain the same keys
  if (locales.en && locales.mn) {
    syncKeys(locales.en, locales.mn, 'locale');
    syncKeys(locales.en.tooltip, locales.mn.tooltip, 'tooltip');
  }

  for (const { key, sourceText, sourceLang } of entries) {
    if (!locales[sourceLang][key]) {
      locales[sourceLang][key] = sourceText;
    }
  }

  if (locales.en && locales.mn) {
    syncKeys(locales.en, locales.mn, 'locale');
    syncKeys(locales.en.tooltip, locales.mn.tooltip, 'tooltip');
  }

  for (const lng of ['en', 'mn']) {
    if (locales[lng]) await saveLocale(lng);
  }

  // Generate missing English and Mongolian tooltips
  if (locales.en && locales.mn) {
    const allKeys = new Set([
      ...Object.keys(locales.en || {}),
      ...Object.keys(locales.mn || {}),
    ]);
    for (const key of allKeys) {
      checkAbort();
      // Ensure English tooltip
      if (!locales.en.tooltip[key]) {
        try {
          const { tooltip } = await translateWithOpenAI(
            locales.en[key] || locales.mn[key],
            'en',
            'en',
          );
          locales.en.tooltip[key] = tooltip;
        } catch (err) {
          console.warn(
            `[gen-i18n] failed to generate English tooltip for key="${key}": ${err.message}`,
          );
        }
      }

      // Ensure Mongolian tooltip translated from English
      if (!locales.mn.tooltip[key] && locales.en.tooltip[key]) {
        try {
          const { translation } = await translateWithOpenAI(
            locales.en.tooltip[key],
            'en',
            'mn',
          );
          locales.mn.tooltip[key] = translation;
        } catch (err) {
          try {
            const t = await translateWithGoogle(
              locales.en.tooltip[key],
              'mn',
              'en',
              key,
            );
            locales.mn.tooltip[key] = t;
          } catch (err2) {
            console.warn(
              `[gen-i18n] failed to generate Mongolian tooltip for key="${key}": ${err2.message}`,
            );
            locales.mn.tooltip[key] = locales.en.tooltip[key];
          }
        }
      }
    }
  }

  // After sanitizing English and Mongolian locales, update tooltip bases
  fs.writeFileSync(
    path.join(tooltipsDir, 'en.json'),
    JSON.stringify(sortObj(locales.en.tooltip), null, 2),
  );
  fs.writeFileSync(
    path.join(tooltipsDir, 'mn.json'),
    JSON.stringify(sortObj(locales.mn.tooltip), null, 2),
  );

  // Regenerate other tooltip languages from sanitized bases
  await generateTooltipTranslations({ onLog: log, signal });

  for (const lang of languages) {
    checkAbort();
    let counter = 0;

    for (const { key, sourceText, sourceLang, origin } of entries) {
      checkAbort();
      if (sourceLang === 'mn' && !/[\u0400-\u04FF]/.test(sourceText)) continue;
      if (sourceLang === 'en' && !/[A-Za-z]/.test(sourceText)) continue;

      const existing = locales[lang][key];

      if (lang !== sourceLang && existing && existing.trim()) {
        const prefix = `[gen-i18n]${origin ? `[${origin}]` : ''}`;
        log(`${prefix} Skipping ${lang}.${key}, already translated`);
        continue;
      }

      if (lang === 'mn' && sourceLang === 'en') {
        const prefix = `[gen-i18n]${origin ? `[${origin}]` : ''}`;
        log(`${prefix} Translating "${sourceText}" (en -> mn)`);
        let translation;
        let tooltip;
        let provider = 'OpenAI';
        try {
          const result = await translateWithOpenAI(
            sourceText,
            'en',
            'mn',
          );
          translation = result.translation;
          tooltip = result.tooltip;
        } catch (err) {
          console.warn(
            `${prefix} OpenAI failed key="${key}" (en->mn): ${err.message}`,
          );
          provider = undefined;
        }

        if (!translation) {
          try {
            translation = await translateWithGoogle(sourceText, 'mn', 'en', key);
            provider = 'Google';
          } catch (err) {
            console.warn(
              `${prefix} Google failed key="${key}" (en->mn): ${err.message}`,
            );
            translation = sourceText;
          }
        }

        if (!existing) {
          locales.mn[key] = translation;
        } else if (translation.trim() !== existing.trim()) {
          log(
            `${prefix} replaced mn.${key}: "${existing}" -> "${translation}"`,
          );
          locales.mn[key] = translation;
        }

        if (tooltip) {
          const existingTip = locales.mn.tooltip[key];
          if (!existingTip) {
            locales.mn.tooltip[key] = tooltip;
          } else if (tooltip.trim() !== existingTip.trim()) {
            log(
              `${prefix} replaced mn.tooltip.${key}: "${existingTip}" -> "${tooltip}"`,
            );
            locales.mn.tooltip[key] = tooltip;
          }
        }

        if (translation === sourceText) {
          log(
            `${prefix} Mongolian translation for ${key} fell back to English`,
          );
        } else {
          log(
            `${prefix} Mongolian translation for ${key} succeeded`,
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

        log(`Translating "${baseText}" (${fromLang} -> ${lang})`);
        let provider = 'OpenAI';
        let translation;
        let tooltip;
        try {
          const result = await translateWithOpenAI(
            baseText,
            fromLang,
            lang,
          );
          translation = result.translation;
          tooltip = result.tooltip;
          if (!existing) {
            locales[lang][key] = translation;
          } else if (translation.trim() !== existing.trim()) {
            log(
              `[gen-i18n] replaced ${lang}.${key}: "${existing}" -> "${translation}"`,
            );
            locales[lang][key] = translation;
          }
          if (tooltip) {
            const existingTip = locales[lang].tooltip[key];
            if (!existingTip) {
              locales[lang].tooltip[key] = tooltip;
            } else if (tooltip.trim() !== existingTip.trim()) {
              log(
                `[gen-i18n] replaced ${lang}.tooltip.${key}: "${existingTip}" -> "${tooltip}"`,
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
          let t;
          try {
            t = await translateWithGoogle(baseText, lang, fromLang, key);
          } catch (err) {
            console.warn(
              `[gen-i18n] Google failed key="${key}" (${fromLang}->${lang}): ${err.message}; using source text`,
            );
            t = sourceText;
          }
          if (!existing) {
            locales[lang][key] = t;
          } else if (t.trim() !== existing.trim()) {
            log(
              `[gen-i18n] replaced ${lang}.${key}: "${existing}" -> "${t}"`,
            );
            locales[lang][key] = t;
          }
          provider = 'Google';
        }
        log(`    using ${provider}`);
      }

      counter++;
      if (counter % 10 === 0) {
        await saveLocale(lang);
      }
    }

    await saveLocale(lang);
  }

  // Finalize tooltip bases and ensure parity
  if (locales.en && locales.mn) {
    syncKeys(locales.en.tooltip, locales.mn.tooltip, 'tooltip');
    writeLocaleFile('en', locales.en);
    writeLocaleFile('mn', locales.mn);
    fs.writeFileSync(
      path.join(tooltipsDir, 'en.json'),
      JSON.stringify(sortObj(locales.en.tooltip), null, 2),
    );
    fs.writeFileSync(
      path.join(tooltipsDir, 'mn.json'),
      JSON.stringify(sortObj(locales.mn.tooltip), null, 2),
    );
  }

  if (fixedKeys.size) {
    log('[gen-i18n] corrected invalid translations:');
    for (const k of fixedKeys) {
      log(`  - ${k}`);
    }
  }
  log('[gen-i18n] DONE');
  } finally {
    try {
      const db = await import('../db/index.js');
      await db.pool.end();
    } catch {}
  }
}

export async function generateTooltipTranslations({ onLog = console.log, signal } = {}) {
  log = onLog;
  const checkAbort = () => {
    if (signal?.aborted) throw new Error('Aborted');
  };

  await fs.promises.mkdir(tooltipsDir, { recursive: true });

  const tipData = {};
  for (const lang of languages) {
    const p = path.join(tooltipsDir, `${lang}.json`);
    tipData[lang] = fs.existsSync(p)
      ? JSON.parse(fs.readFileSync(p, 'utf8'))
      : {};
  }

  if (tipData.en && tipData.mn) {
    syncKeys(tipData.en, tipData.mn, 'tooltip');
    fs.writeFileSync(
      path.join(tooltipsDir, 'en.json'),
      JSON.stringify(sortObj(tipData.en), null, 2),
    );
    fs.writeFileSync(
      path.join(tooltipsDir, 'mn.json'),
      JSON.stringify(sortObj(tipData.mn), null, 2),
    );
  }

  const baseKeys = Array.from(
    new Set([
      ...Object.keys(tipData.en || {}),
      ...Object.keys(tipData.mn || {}),
    ]),
  );

  async function ensureTooltipLanguage(obj, lang) {
    let changed = false;
    for (const [k, v] of Object.entries(obj)) {
      if (typeof v !== 'string') continue;
      const sourceLang = detectLang(v);
      if (sourceLang && sourceLang !== lang) {
        try {
          const translated = await translateWithGoogle(v, lang, sourceLang, k);
          obj[k] = translated;
          console.warn(
            `[gen-tooltips] WARNING: corrected ${lang}.${k}: "${v}" -> "${translated}"`,
          );
          changed = true;
        } catch (err) {
          console.warn(
            `[gen-tooltips] ensureLanguage failed for ${lang}.${k}: ${err.message}`,
          );
        }
      }
    }
    return changed;
  }

  if (tipData.en) await ensureTooltipLanguage(tipData.en, 'en');
  if (tipData.mn) await ensureTooltipLanguage(tipData.mn, 'mn');

  for (const lang of languages) {
    checkAbort();
    const langPath = path.join(tooltipsDir, `${lang}.json`);
    const current = tipData[lang] || {};
    // remove keys not in base to keep key counts aligned
    for (const k of Object.keys(current)) {
      if (!baseKeys.includes(k)) delete current[k];
    }
    let updated = lang === 'en' || lang === 'mn';

    for (const key of baseKeys) {
      if (current[key]) continue;
      checkAbort();
      const sourceText =
        (tipData.en && tipData.en[key]) || (tipData.mn && tipData.mn[key]);
      const sourceLang = tipData.en && tipData.en[key] ? 'en' : 'mn';
      let translation;
      try {
        const res = await translateWithOpenAI(sourceText, sourceLang, lang);
        translation = res.translation;
      } catch (err) {
        try {
          translation = await translateWithGoogle(
            sourceText,
            lang,
            sourceLang,
            key,
          );
        } catch (err2) {
          console.warn(
            `[gen-tooltips] failed ${sourceLang}->${lang} for key="${key}": ${err2.message}`,
          );
          translation = sourceText;
        }
      }
      current[key] = translation;
      updated = true;
    }

    if (lang === 'en' || lang === 'mn') {
      const corrected = await ensureTooltipLanguage(current, lang);
      if (corrected) updated = true;
    }
    const baseCount = baseKeys.length;
    const currentCount = Object.keys(current).length;
    if (currentCount !== baseCount) {
      console.warn(
        `[gen-tooltips] WARNING: ${lang} tooltip key count differs (${currentCount} vs ${baseCount})`,
      );
    }

    if (updated || currentCount !== baseCount) {
      const ordered = sortObj(current);
      fs.writeFileSync(langPath, JSON.stringify(ordered, null, 2));
      log(`[gen-tooltips] wrote ${langPath}`);
    }
  }
  log('[gen-tooltips] DONE');
}

