// scripts/generateTranslations.js
import fs from 'fs';
import path from 'path';
import { getConfigPathSync } from '../api-server/utils/configPaths.js';
let OpenAI;
try {
  ({ default: OpenAI } = await import('../api-server/utils/openaiClient.js'));
} catch {}
import { slugify } from '../api-server/utils/slugify.js';
import {
  collectPhrasesFromPages,
  fetchModules,
  detectLang,
  sortObj,
  isValidMongolianCyrillic,
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
const localesDir = path.resolve('src/erp.mgt.mn/locales');
const tooltipsDir = path.join(localesDir, 'tooltips');
const TIMEOUT_MS = 7000;

function normalizeForComparison(value) {
  if (value == null) return '';
  return String(value)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\s\p{P}_-]+/gu, '');
}

function isNormalizedKeyMatch(key, value) {
  if (typeof value !== 'string') return false;
  const normalizedKey = normalizeForComparison(key);
  const normalizedValue = normalizeForComparison(value);
  if (!normalizedKey || !normalizedValue) return false;
  return normalizedKey === normalizedValue;
}

const METADATA_LABELS = {
  module: 'Module',
  context: 'Context',
  form: 'Form',
  fieldPath: 'Field Path',
  page: 'Page',
  source: 'Source',
};

function pushMetadataValue(target, field, value) {
  if (!value) return;
  const values = Array.isArray(value) ? value : [value];
  for (const val of values) {
    if (val == null) continue;
    const normalized = String(val).trim();
    if (!normalized) continue;
    if (!target[field]) target[field] = [];
    if (!target[field].includes(normalized)) {
      target[field].push(normalized);
    }
  }
}

function mergeMetadataValues(target = {}, updates = {}) {
  for (const [field, value] of Object.entries(updates)) {
    pushMetadataValue(target, field, value);
  }
  return target;
}

function deriveModuleFromKey(key) {
  if (typeof key !== 'string') return '';
  if (!key.includes('.')) return '';
  const [firstSegment] = key.split('.');
  if (!firstSegment || /^\d+$/.test(firstSegment)) return '';
  return firstSegment;
}

function buildEntryMetadata(key, origin, extra = {}) {
  const metadata = {};
  if (origin) {
    pushMetadataValue(metadata, 'context', origin);
    pushMetadataValue(metadata, 'source', origin);
  }
  if (extra && typeof extra === 'object') {
    const { context, ...rest } = extra;
    if (context) pushMetadataValue(metadata, 'context', context);
    mergeMetadataValues(metadata, rest);
  }
  const guessedModule = deriveModuleFromKey(key);
  if (guessedModule) {
    pushMetadataValue(metadata, 'module', guessedModule);
  }
  return metadata;
}

function formatMetadataForPrompt(metadata) {
  if (!metadata || typeof metadata !== 'object') return '';
  const lines = [];
  for (const [field, values] of Object.entries(metadata)) {
    if (!Array.isArray(values) || values.length === 0) continue;
    const label = METADATA_LABELS[field] || field;
    lines.push(`- ${label}: ${values.join(', ')}`);
  }
  return lines.join('\n');
}

/* ---------------- Utilities ---------------- */

function syncKeys(targetA, targetB, label) {
  if (!targetA || !targetB) return;

  const keysA = Object.keys(targetA);
  const keysB = Object.keys(targetB);
  const missingFromA = keysB.filter((k) => !(k in targetA));
  const missingFromB = keysA.filter((k) => !(k in targetB));

  for (const key of missingFromA) targetA[key] = '';
  for (const key of missingFromB) targetB[key] = '';

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

const LATIN_LANGS = new Set(['en']);
const KANA_REGEX = /[\p{Script=Hiragana}\p{Script=Katakana}]/u;
const NON_LETTER_HAN_STRIP_REGEX = /[\p{P}\p{S}\p{Number}\s]/gu;

function hasKana(text) {
  return typeof text === 'string' && KANA_REGEX.test(text);
}

function hasOnlyHan(text) {
  if (typeof text !== 'string') return false;
  const cleaned = text.replace(NON_LETTER_HAN_STRIP_REGEX, '');
  if (!cleaned) return false;
  return /^[\p{Script=Han}]+$/u.test(cleaned);
}

function isDetectedLangMatch(detected, targetLang, text = '') {
  if (!detected) return false;

  if (targetLang === 'ja') {
    if (!hasKana(text)) return false;
    return detected === 'ja' || detected === 'cjk';
  }

  if (targetLang === 'zh') {
    if (hasKana(text)) return false;
    return detected === 'zh' || detected === 'cjk';
  }

  if (detected === targetLang) return true;
  if (detected === 'latin') return LATIN_LANGS.has(targetLang);
  if (detected === 'cjk') return targetLang === 'zh';
  return false;
}

function shouldFlagLangMismatch(detected, targetLang, text = '') {
  return !!detected && !isDetectedLangMatch(detected, targetLang, text);
}

function describeDetectedLang(code) {
  switch (code) {
    case 'latin':
      return 'Latin script text (likely English)';
    case 'cjk':
      return 'CJK characters';
    case 'en':
      return 'English text';
    case 'es':
      return 'Spanish text';
    case 'de':
      return 'German text';
    case 'fr':
      return 'French text';
    default:
      return code || 'unknown language';
  }
}

function resolveDetectedLocale(code, text = '') {
  if (!code) return null;
  if (code === 'latin') return 'en';
  if (code === 'cjk') {
    if (hasKana(text)) return 'ja';
    if (hasOnlyHan(text)) return 'zh';
    return null;
  }
  if (code === 'ja' && !hasKana(text)) {
    // Avoid forcing relocations when the text no longer signals Japanese.
    return null;
  }
  if (code === 'zh' && hasKana(text)) {
    return 'ja';
  }
  return code;
}

function validateTranslatedText(value, targetLang, options = {}) {
  const { validator, invalidReason } = options;
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) {
    return { ok: false, text: '', reason: 'empty result' };
  }
  if (isInvalidString(text)) {
    return { ok: false, text: '', reason: 'failed safety checks' };
  }
  if (validator && !validator(text)) {
    return {
      ok: false,
      text: '',
      reason: invalidReason || 'failed validation',
    };
  }
  const detected = detectLang(text);
  if (!detected) {
    return { ok: false, text: '', reason: 'unable to detect language' };
  }
  if (!isDetectedLangMatch(detected, targetLang, text)) {
    return {
      ok: false,
      text: '',
      reason: `detected ${describeDetectedLang(detected)}`,
    };
  }
  return { ok: true, text, detected };
}

function createManualReviewTracker(contextLabel) {
  const localeIssues = new Map();
  const tooltipIssues = new Map();
  return {
    track(type, lang, key, reason) {
      const bucket = type === 'tooltip' ? tooltipIssues : localeIssues;
      const composite = `${lang}.${key}`;
      if (!bucket.has(composite)) {
        bucket.set(composite, reason);
      }
    },
    flush(logger = console.log) {
      const prefix = `[${contextLabel}]`;
      if (localeIssues.size) {
        logger(`${prefix} locales flagged for manual QA:`);
        for (const [entry, reason] of localeIssues) {
          logger(`  - ${entry}: ${reason}`);
        }
      }
      if (tooltipIssues.size) {
        logger(`${prefix} tooltips flagged for manual QA:`);
        for (const [entry, reason] of tooltipIssues) {
          logger(`  - ${entry}: ${reason}`);
        }
      }
    },
  };
}
function getNested(obj, keyPath) {
  return keyPath.split('.').reduce((o, k) => (o && o[k] !== undefined ? o[k] : undefined), obj);
}

function setNested(obj, keyPath, value) {
  if (!obj || !keyPath) return;
  const keys = keyPath.split('.');
  let current = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (!current[key] || typeof current[key] !== 'object') {
      current[key] = {};
    }
    current = current[key];
  }
  current[keys[keys.length - 1]] = value;
}

function getEnglishTooltipSource(locales, key, fallbackLangs = []) {
  const candidate = locales?.en?.tooltip?.[key];
  if (typeof candidate === 'string') {
    const trimmed = candidate.trim();
    if (trimmed) return trimmed;
  }

  const seen = new Set();
  for (const lang of fallbackLangs || []) {
    if (!lang || seen.has(lang)) continue;
    seen.add(lang);
    const value = locales?.[lang]?.tooltip?.[key];
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (!trimmed) continue;
    if (/[A-Za-z]/.test(trimmed)) return trimmed;
  }
  return '';
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

async function getOpenAIJsonResponse(prompt) {
  if (!OpenAI) throw new Error('missing OpenAI API key');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const completion = await OpenAI.chat.completions.create(
      {
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
      },
      { signal: controller.signal },
    );
    const content = completion.choices?.[0]?.message?.content?.trim();
    if (!content) throw new Error('empty response');
    const json = content.replace(/```json|```/g, '').trim();
    try {
      return JSON.parse(json);
    } catch (err) {
      throw new Error(`invalid JSON response: ${err.message}`);
    }
  } finally {
    clearTimeout(timer);
  }
}

async function verifyTranslationWithOpenAI({
  sourceText,
  sourceLang,
  targetLang,
  translation,
  tooltip,
  metadata,
  purpose,
  key,
  baseEnglish,
  tooltipSourceText,
  tooltipSourceLang,
  providerName,
}) {
  const sourceLangName = languageNames[sourceLang] || sourceLang || 'English';
  const targetLangName = languageNames[targetLang] || targetLang || 'English';
  const tooltipLangName =
    languageNames[tooltipSourceLang] || tooltipSourceLang || 'English';
  const metadataText = formatMetadataForPrompt(metadata);
  const sections = [
    'You are an ERP localization QA assistant.',
    `Confirm that the proposed ${targetLangName} output is meaningful, professional, and written in ${targetLangName}.`,
    'Ensure the text fits ERP product terminology and avoids literal or nonsensical translations.',
    'Respond only with JSON like {"ok":true|false,"feedback":"...","correctedTranslation":"...","correctedTooltip":"..."}.',
    `If ok is false, provide concise feedback (under 120 characters). Include correctedTranslation and/or correctedTooltip only when you can confidently supply a better ${targetLangName} result.`,
    `Source text (${sourceLangName}): ${sourceText || '(empty)'}`,
    `Proposed translation (${targetLangName}): ${translation || '(empty)'}`,
  ];
  if (purpose === 'tooltip' || (tooltip && tooltip.trim())) {
    sections.push(
      `Proposed tooltip (${targetLangName}): ${tooltip || '(empty)'}`,
    );
  }
  if (baseEnglish) {
    sections.push(`Base English label: ${baseEnglish}`);
  }
  if (tooltipSourceText) {
    sections.push(
      `Reference tooltip (${tooltipLangName}): ${tooltipSourceText}`,
    );
  }
  if (key) sections.push(`Translation key: ${key}`);
  if (metadataText) sections.push(`Metadata:\n${metadataText}`);
  if (providerName) sections.push(`Provider attempt: ${providerName}`);

  const prompt = sections.join('\n\n');
  try {
    const result = await getOpenAIJsonResponse(prompt);
    const ok = Boolean(result?.ok);
    const feedback =
      typeof result?.feedback === 'string' ? result.feedback.trim() : '';
    const correctedTranslation =
      result?.correctedTranslation !== undefined &&
      result?.correctedTranslation !== null
        ? String(result.correctedTranslation).trim()
        : undefined;
    const correctedTooltip =
      result?.correctedTooltip !== undefined &&
      result?.correctedTooltip !== null
        ? String(result.correctedTooltip).trim()
        : undefined;
    const response = { ok, feedback };
    if (correctedTranslation !== undefined) {
      response.correctedTranslation = correctedTranslation;
    }
    if (correctedTooltip !== undefined) {
      response.correctedTooltip = correctedTooltip;
    }
    return response;
  } catch (err) {
    throw new Error(`verification request failed: ${err.message}`);
  }
}

async function applyVerificationCorrections({
  sourceText,
  sourceLang,
  targetLang,
  translation,
  tooltip,
  metadata,
  purpose,
  key,
  baseEnglish,
  tooltipSourceText,
  tooltipSourceLang,
  providerName,
}) {
  let currentTranslation = typeof translation === 'string' ? translation : '';
  let currentTooltip = typeof tooltip === 'string' ? tooltip : '';
  let correctionsApplied = false;
  let attempts = 0;
  let lastFeedback = '';

  while (attempts < 3) {
    const verification = await verifyTranslationWithOpenAI({
      sourceText,
      sourceLang,
      targetLang,
      translation: currentTranslation,
      tooltip: currentTooltip,
      metadata,
      purpose,
      key,
      baseEnglish,
      tooltipSourceText,
      tooltipSourceLang,
      providerName,
    });

    const feedback = verification.feedback || '';

    if (verification.ok) {
      return {
        ok: true,
        value: {
          translation: currentTranslation.trim(),
          tooltip: currentTooltip.trim(),
        },
        correctionsApplied,
        feedback,
      };
    }

    lastFeedback = feedback || 'verification rejected output';

    const hasTranslationUpdate =
      verification.correctedTranslation !== undefined;
    const hasTooltipUpdate =
      verification.correctedTooltip !== undefined;

    if (hasTranslationUpdate || hasTooltipUpdate) {
      if (hasTranslationUpdate) {
        currentTranslation = String(
          verification.correctedTranslation ?? currentTranslation,
        ).trim();
      }
      if (hasTooltipUpdate) {
        currentTooltip = String(
          verification.correctedTooltip ?? currentTooltip,
        ).trim();
      }
      correctionsApplied = true;
      attempts++;
      continue;
    }

    return { ok: false, feedback: lastFeedback };
  }

  return { ok: false, feedback: lastFeedback || 'verification rejected output' };
}

async function translateWithGoogle(text, to, from, key, options = {}) {
  const {
    metadata = null,
    purpose = '',
    baseEnglish = '',
    tooltipSourceText = '',
    tooltipSourceLang = 'en',
    resultType = 'translation',
  } = options || {};
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
      const rawValue = data[0].map((seg) => seg[0]).join('');
      const mode = resultType === 'tooltip' ? 'tooltip' : 'translation';
      const verification = await applyVerificationCorrections({
        sourceText: text,
        sourceLang: from,
        targetLang: to,
        translation: mode === 'translation' ? rawValue : '',
        tooltip: mode === 'tooltip' ? rawValue : '',
        metadata,
        purpose: purpose || (mode === 'tooltip' ? 'tooltip' : ''),
        key,
        baseEnglish,
        tooltipSourceText,
        tooltipSourceLang,
        providerName: 'Google',
      });
      if (!verification.ok) {
        throw new Error(`verification failed: ${verification.feedback}`);
      }
      const { translation, tooltip } = verification.value;
      return {
        translation: mode === 'translation' ? translation : tooltip,
        tooltip,
        correctionsApplied: verification.correctionsApplied,
      };
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

async function requestOpenAITranslation(text, from, to, options = {}) {
  if (!OpenAI) throw new Error('missing OpenAI API key');
  const sourceLang = languageNames[from] || from || 'English';
  const targetLang = languageNames[to] || to || 'English';
  const {
    metadata = null,
    baseEnglish = '',
    key = '',
    purpose = '',
    tooltipSourceText = '',
    tooltipSourceLang = 'en',
    retryFeedback = '',
  } = options || {};
  let prompt;
  if (purpose === 'tooltip') {
    const normalizedBaseEnglish =
      typeof baseEnglish === 'string' ? baseEnglish.trim() : '';
    const metadataText = formatMetadataForPrompt(metadata);
    const sections = [
      'You are an ERP localization expert creating helpful tooltips for end users.',
      `Provide the ${targetLang} translation of the label in the "translation" field.`,
      `Use the available metadata to write a concise tooltip in ${targetLang} that explains how the field is used within the ERP. Do not simply repeat the label; add meaningful guidance or context for users.`,
      'Respond only with a JSON object like {"translation":"...", "tooltip":"..."} and no additional commentary.',
      `Base label (${sourceLang}): ${text}`,
    ];
    if (retryFeedback) {
      sections.push(
        `Address the following QA feedback from the previous attempt and correct any issues: ${retryFeedback}`,
      );
    }
    if (normalizedBaseEnglish) {
      sections.push(`English UI label: ${normalizedBaseEnglish}`);
    }
    if (key) sections.push(`Translation key: ${key}`);
    if (metadataText) sections.push(`Context:\n${metadataText}`);
    prompt = sections.join('\n\n');
  } else {
    const normalizedBaseEnglish =
      typeof baseEnglish === 'string' ? baseEnglish.trim() : '';
    const normalizedTooltip =
      typeof tooltipSourceText === 'string' ? tooltipSourceText.trim() : '';
    const metadataText = formatMetadataForPrompt(metadata);
    if (normalizedTooltip || normalizedBaseEnglish || metadataText) {
      const tooltipLangName =
        languageNames[tooltipSourceLang] || tooltipSourceLang || 'English';
      const sections = [
        'You are an ERP localization expert creating localized UI strings.',
        `Provide the ${targetLang} translation of the label in the "translation" field.`,
      ];
      if (normalizedTooltip) {
        sections.push(
          `Translate the following ${tooltipLangName} tooltip into ${targetLang} and place the result in the "tooltip" field while preserving its guidance for end users.`,
        );
      } else {
        sections.push(
          `Write a concise tooltip in ${targetLang} that helps end users understand the field. Do not simply repeat the label.`,
        );
      }
      sections.push(
        'Respond only with a JSON object like {"translation":"...", "tooltip":"..."} and no additional commentary.',
        `Label (${sourceLang}): ${text}`,
      );
      if (retryFeedback) {
        sections.push(
          `Address the following QA feedback from the previous attempt and correct any issues: ${retryFeedback}`,
        );
      }
      if (normalizedBaseEnglish) {
        sections.push(`English UI label: ${normalizedBaseEnglish}`);
      }
      if (normalizedTooltip) {
        sections.push(`${tooltipLangName} tooltip: ${normalizedTooltip}`);
      }
      if (key) sections.push(`Translation key: ${key}`);
      if (metadataText) sections.push(`Context:\n${metadataText}`);
      prompt = sections.join('\n\n');
    } else {
      const feedbackInstruction = retryFeedback
        ? `\n\nAddress the following QA feedback from the previous attempt and correct any issues: ${retryFeedback}`
        : '';
      prompt = `Translate this ${sourceLang} ERP term into ${targetLang}. Respond only with a JSON object like {"translation":"...", "tooltip":"..."} and no additional commentary. The text is ${sourceLang}, not Russian.${feedbackInstruction}\n\n${text}`;
    }
  }
  const parsed = await getOpenAIJsonResponse(prompt);
  const { translation, tooltip } = parsed;
  if (typeof translation !== 'string' || typeof tooltip !== 'string') {
    throw new Error('missing fields in response');
  }
  return { translation: translation.trim(), tooltip: tooltip.trim() };
}

async function translateWithOpenAI(text, from, to, options = {}) {
  if (!OpenAI) throw new Error('missing OpenAI API key');
  const maxAttempts = 3;
  let attempt = 0;
  let feedback = '';

  while (attempt < maxAttempts) {
    const result = await requestOpenAITranslation(text, from, to, {
      ...options,
      retryFeedback: feedback,
    });

    const verification = await applyVerificationCorrections({
      sourceText: text,
      sourceLang: from,
      targetLang: to,
      translation: result.translation,
      tooltip: result.tooltip,
      metadata: options?.metadata,
      purpose: options?.purpose,
      key: options?.key,
      baseEnglish: options?.baseEnglish,
      tooltipSourceText: options?.tooltipSourceText,
      tooltipSourceLang: options?.tooltipSourceLang,
      providerName: 'OpenAI',
    });

    if (verification.ok) {
      return {
        translation: verification.value.translation,
        tooltip: verification.value.tooltip,
        correctionsApplied: verification.correctionsApplied,
      };
    }

    feedback = verification.feedback || 'translation failed verification';
    attempt++;
  }

  throw new Error(
    feedback
      ? `verification failed after ${maxAttempts} attempts: ${feedback}`
      : 'verification failed after multiple attempts',
  );
}

async function translateWithPreferredProviders(
  text,
  from,
  to,
  keyPath,
  context = 'gen-i18n',
  options = {},
) {
  if (!text || !from || !to || from === to) return null;
  const label = keyPath || '(root)';
  const {
    validator,
    invalidReason,
    metadata = null,
    baseEnglish = '',
    purpose = '',
    tooltipSourceText = '',
    tooltipSourceLang = 'en',
  } = options || {};
  const providers = [
    {
      name: 'OpenAI',
      exec: async () => {
        return translateWithOpenAI(text, from, to, {
          metadata,
          baseEnglish,
          key: keyPath,
          purpose,
          tooltipSourceText,
          tooltipSourceLang,
        });
      },
    },
    {
      name: 'Google',
      exec: async () =>
        translateWithGoogle(text, to, from, label, {
          metadata,
          baseEnglish,
          key: keyPath,
          purpose,
          tooltipSourceText,
          tooltipSourceLang,
          resultType: 'translation',
        }),
    },
  ];

  for (const provider of providers) {
    try {
      const result = await provider.exec();
      const validation = validateTranslatedText(result.translation, to, {
        validator,
        invalidReason,
      });
      if (!validation.ok) {
        console.warn(
          `[${context}] rejected ${provider.name} ${from}->${to} for ${label}: ${validation.reason}`,
        );
        continue;
      }
      const providerLabel = result.correctionsApplied
        ? `${provider.name} (QA corrected)`
        : provider.name;
      return { text: validation.text, provider: providerLabel };
    } catch (err) {
      console.warn(
        `[${context}] ${provider.name} translation failed ${from}->${to} for ${label}: ${err.message}`,
      );
    }
  }

  return null;
}

/* ---------------- Main ---------------- */

export async function generateTranslations({
  onLog = console.log,
  signal,
  textsPath,
} = {}) {
  log = onLog;
  const checkAbort = () => {
    if (signal?.aborted) throw new Error('Aborted');
  };

  try {
    log('[gen-i18n] START');
    let base = {};
    let headerMappingsUpdated = false;
    const entryMap = new Map();

  function addEntry(key, sourceText, sourceLang, origin, metadataInput = {}) {
    if (
      typeof sourceText !== 'string' ||
      (!/[\u0400-\u04FF]/.test(sourceText) && !/[A-Za-z]/.test(sourceText)) ||
      isNormalizedKeyMatch(key, sourceText)
    ) {
      return;
    }

    const metadata = buildEntryMetadata(key, origin, metadataInput);
    const existing = entryMap.get(key);
    if (existing) {
      if (
        !existing.baseEnglish &&
        sourceLang === 'en' &&
        typeof sourceText === 'string' &&
        sourceText.trim()
      ) {
        existing.baseEnglish = sourceText;
      }
      existing.metadata = mergeMetadataValues(existing.metadata || {}, metadata);
      if (origin) {
        const origins = Array.isArray(existing.origins)
          ? existing.origins
          : [existing.origin].filter(Boolean);
        if (!origins.includes(origin)) origins.push(origin);
        existing.origins = origins;
      }
      return;
    }

    entryMap.set(key, {
      key,
      sourceText,
      sourceLang,
      origin,
      metadata,
      origins: origin ? [origin] : [],
      baseEnglish: sourceLang === 'en' ? sourceText : '',
    });
  }

  if (textsPath) {
    base = JSON.parse(fs.readFileSync(textsPath, 'utf8'));
    const customFileLabel = path.basename(textsPath);
    for (const [key, value] of Object.entries(base)) {
      const sourceText =
        typeof value === 'string' ? value : value?.mn || value?.en;
      const sourceLang = /[\u0400-\u04FF]/.test(sourceText) ? 'mn' : 'en';
      addEntry(key, sourceText, sourceLang, 'file', {
        context: 'custom text file',
        source: customFileLabel,
      });
    }
  } else {
    base = JSON.parse(fs.readFileSync(headerMappingsPath, 'utf8'));
    const modules = await fetchModules();
    for (const { moduleKey, label } of modules) {
      checkAbort();
      if (base[moduleKey] === undefined) {
        base[moduleKey] = label;
        headerMappingsUpdated = true;
      }
      const sourceLang = /[\u0400-\u04FF]/.test(label) ? 'mn' : 'en';
      addEntry(moduleKey, label, sourceLang, 'module', {
        module: moduleKey,
        context: 'module label',
        source: 'modules',
      });
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
      addEntry(key, sourceText, sourceLang, 'table', {
        context: 'header mapping',
        source: 'headerMappings',
      });
    }

    const tPairs = collectPhrasesFromPages(path.resolve('src/erp.mgt.mn'));
    for (const { key, text, module: moduleId, context: pageContext, page } of tPairs) {
      checkAbort();
      const sourceLang = /[\u0400-\u04FF]/.test(text) ? 'mn' : 'en';
      if (base[key] === undefined) {
        base[key] = text;
        headerMappingsUpdated = true;
      }
      addEntry(key, text, sourceLang, 'page', {
        module: moduleId,
        context: pageContext || 'page snippet',
        page: page || '',
        source: 'page-scan',
      });
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
          addEntry(`form.${formSlug}`, formName, sourceLang, 'form', {
            form: formName,
            context: 'form name',
            fieldPath: formSlug,
            source: 'transactionForms',
          });

          function walk(obj, pathSegs) {
            if (!obj || typeof obj !== 'object') return;
            for (const [k, v] of Object.entries(obj)) {
              const segs = [...pathSegs, slugify(k)];
              if (typeof v === 'string') {
                if (/^[a-z0-9_.]+$/.test(v)) continue;
                const lang = /[\u0400-\u04FF]/.test(v) ? 'mn' : 'en';
                const fieldPath = segs.join('.');
                addEntry(`form.${fieldPath}`, v, lang, 'form', {
                  form: formName,
                  context: 'form field',
                  fieldPath,
                  source: `transactionForms:${formSlug}`,
                });
              } else if (Array.isArray(v)) {
                for (const item of v) {
                  if (item && typeof item === 'object') {
                    walk(item, segs);
                  } else if (typeof item === 'string' && !/^[a-z0-9_.]+$/.test(item)) {
                    const lang = /[\u0400-\u04FF]/.test(item) ? 'mn' : 'en';
                    const itemSlug = slugify(item);
                    const optionPath = `${segs.join('.')}.${itemSlug}`;
                    addEntry(
                      `form.${optionPath}`,
                      item,
                      lang,
                      'form',
                      {
                        form: formName,
                        context: 'form option',
                        fieldPath: optionPath,
                        source: `transactionForms:${formSlug}`,
                      },
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
                const itemSlug = slugify(item);
                const fullKey = `${baseKey}.${itemSlug}`;
                const relativePath = fullKey.replace(/^userLevelActions\.?/, '');
                addEntry(
                  fullKey,
                  item,
                  lang,
                  'userLevelActions',
                  {
                    context: 'user level action',
                    fieldPath: relativePath || itemSlug,
                    source: 'userLevelActions',
                  },
                );
              }
            }
          } else {
            for (const [k, v] of Object.entries(obj)) {
              const segs = [...pathSegs, slugify(k)];
              if (typeof v === 'string') {
                if (skipString.test(v)) continue;
                const lang = /[\u0400-\u04FF]/.test(v) ? 'mn' : 'en';
                const fieldPath = segs.join('.');
                addEntry(
                  `userLevelActions.${segs.join('.')}`,
                  v,
                  lang,
                  'userLevelActions',
                  {
                    context: 'user level action',
                    fieldPath,
                    source: 'userLevelActions',
                  },
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
              const itemSlug = slugify(item);
              const fullKey = `${baseKey}.${itemSlug}`;
              const relativePath = fullKey.replace(/^posTransactionConfig\.?/, '');
              addEntry(
                fullKey,
                item,
                lang,
                'posTransactionConfig',
                {
                  module: 'posTransactionConfig',
                  context: 'POS transaction config',
                  fieldPath: relativePath || itemSlug,
                  source: 'posTransactionConfig',
                },
              );
            }
          }
        } else {
          for (const [k, v] of Object.entries(obj)) {
            const segs = [...pathSegs, slugify(k)];
            if (typeof v === 'string') {
              if (skipString.test(v)) continue;
              const lang = /[\u0400-\u04FF]/.test(v) ? 'mn' : 'en';
              const fieldPath = segs.join('.');
              addEntry(
                `posTransactionConfig.${segs.join('.')}`,
                v,
                lang,
                'posTransactionConfig',
                {
                  module: 'posTransactionConfig',
                  context: 'POS transaction config',
                  fieldPath,
                  source: 'posTransactionConfig',
                },
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
  }

  if (!textsPath && headerMappingsUpdated) {
    const ordered = sortObj(base);
    fs.writeFileSync(headerMappingsPath, JSON.stringify(ordered, null, 2));
    log(`[gen-i18n] updated ${headerMappingsPath}`);
  }

  const entries = Array.from(entryMap.values());

  await fs.promises.mkdir(localesDir, { recursive: true });
  await fs.promises.mkdir(tooltipsDir, { recursive: true });
  const locales = {};
  const fixedKeys = new Set();
  const manualReview = createManualReviewTracker('gen-i18n');

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
        if (
          isNormalizedKeyMatch(keyPath, v) ||
          isNormalizedKeyMatch(k, v)
        ) {
          continue;
        }
        const detectedLang = detectLang(v);
        const relocationLang = resolveDetectedLocale(detectedLang, v);
        if (
          relocationLang &&
          shouldFlagLangMismatch(detectedLang, lang, v)
        ) {
          const originalValue = v;
          let targetLocale = locales[relocationLang];
          if (!targetLocale || typeof targetLocale !== 'object') {
            targetLocale = {};
            locales[relocationLang] = targetLocale;
          }
          const existingTarget = getNested(targetLocale, keyPath);
          if (
            existingTarget == null ||
            (typeof existingTarget === 'string' && !existingTarget.trim())
          ) {
            setNested(targetLocale, keyPath, originalValue);
          } else if (
            typeof existingTarget === 'string' &&
            existingTarget.trim() !== originalValue.trim()
          ) {
            console.warn(
              `[gen-i18n] relocation skipped overriding existing ${relocationLang}.${keyPath}`,
            );
          }

          const relocationOptions = {
            metadata: entry?.metadata,
            baseEnglish: englishLabel,
          };
          if (lang === 'mn') {
            relocationOptions.validator = isValidMongolianCyrillic;
            relocationOptions.invalidReason =
              'contains Cyrillic characters outside the Mongolian range';
          }
          const translated = await translateWithPreferredProviders(
            originalValue,
            relocationLang,
            lang,
            keyPath,
            'gen-i18n',
            relocationOptions,
          );
          if (translated) {
            localeObj[k] = translated.text;
            console.warn(
              `[gen-i18n] relocated ${lang}.${keyPath} -> ${relocationLang}.${keyPath}; filled with ${translated.provider}`,
            );
          } else {
            localeObj[k] = '';
            manualReview.track(
              'locale',
              lang,
              keyPath,
              'no valid relocation translation',
            );
            console.warn(
              `[gen-i18n] relocated ${lang}.${keyPath} -> ${relocationLang}.${keyPath}; no valid translation`,
            );
          }
          fixedKeys.add(`${lang}.${keyPath}`);
          continue;
        }

        if (isInvalidString(v)) {
          const candidates = [];
          const enVal =
            lang !== 'en' ? getNested(locales.en, keyPath) : undefined;
          const mnVal =
            lang !== 'mn' ? getNested(locales.mn, keyPath) : undefined;
          if (enVal) candidates.push({ text: enVal, lang: 'en' });
          if (mnVal) candidates.push({ text: mnVal, lang: 'mn' });
          candidates.push({ text: v, lang: relocationLang || lang });

          let translated = null;
          for (const src of candidates) {
            try {
              const { translation: res } = await translateWithGoogle(
                src.text,
                lang,
                src.lang,
                keyPath,
                { key: keyPath },
              );
              const validation = validateTranslatedText(res, lang, {
                validator:
                  lang === 'mn' ? isValidMongolianCyrillic : undefined,
                invalidReason:
                  'contains Cyrillic characters outside the Mongolian range',
              });
              if (!validation.ok) {
                console.warn(
                  `[gen-i18n] rejected Google ${src.lang}->${lang} for ${keyPath}: ${validation.reason}`,
                );
                continue;
              }
              translated = validation.text;
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
            localeObj[k] = '';
            manualReview.track(
              'locale',
              lang,
              keyPath,
              'auto-correction failed',
            );
            console.warn(
              `[gen-i18n] WARNING: cleared ${lang}.${keyPath}; unable to auto-correct invalid translation`,
            );
            fixedKeys.add(`${lang}.${keyPath}`);
          } else {
            localeObj[k] = translated;
            fixedKeys.add(`${lang}.${keyPath}`);
          }
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

  for (const cleanupLang of ['ja', 'zh']) {
    const locale = locales[cleanupLang];
    if (!locale) continue;
    await ensureLanguage(locale, cleanupLang, '', ['tooltip']);
    if (locale.tooltip) {
      await ensureLanguage(locale.tooltip, cleanupLang, 'tooltip');
    }
  }

  // Generate missing English and Mongolian tooltips
  if (locales.en && locales.mn) {
    const allKeys = new Set([
      ...Object.keys(locales.en || {}),
      ...Object.keys(locales.mn || {}),
    ]);
    for (const key of allKeys) {
      checkAbort();
      const entry = entryMap.get(key);
      const rawEnglishValue = locales.en && locales.en[key];
      const englishLabel =
        typeof rawEnglishValue === 'string' && rawEnglishValue.trim()
          ? rawEnglishValue.trim()
          : typeof entry?.baseEnglish === 'string' && entry.baseEnglish.trim()
          ? entry.baseEnglish.trim()
          : '';
      const rawFallbackValue = locales.mn && locales.mn[key];
      const fallbackLabel =
        typeof rawFallbackValue === 'string' && rawFallbackValue.trim()
          ? rawFallbackValue.trim()
          : typeof entry?.sourceText === 'string' && entry.sourceText.trim()
          ? entry.sourceText.trim()
          : '';
      const existingTooltipValue = locales.en.tooltip[key];
      const existingTooltip =
        typeof existingTooltipValue === 'string' ? existingTooltipValue.trim() : '';
      if (existingTooltip) {
        const normalizedTooltip = normalizeForComparison(existingTooltip);
        const normalizedEnglishLabel = normalizeForComparison(englishLabel);
        const normalizedFallbackLabel = normalizeForComparison(fallbackLabel);
        if (
          (normalizedEnglishLabel && normalizedTooltip === normalizedEnglishLabel) ||
          (!normalizedEnglishLabel &&
            normalizedFallbackLabel &&
            normalizedTooltip === normalizedFallbackLabel)
        ) {
          locales.en.tooltip[key] = '';
        }
      }
      // Ensure English tooltip
      if (!locales.en.tooltip[key]) {
        const tooltipRequestText = englishLabel || fallbackLabel;
        if (!tooltipRequestText) {
          locales.en.tooltip[key] = '';
          manualReview.track(
            'tooltip',
            'en',
            key,
            'missing base text for tooltip generation',
          );
          console.warn(
            `[gen-i18n] missing base text for tooltip key="${key}"`,
          );
        } else {
          const requestSourceLang = englishLabel
            ? 'en'
            : entry?.sourceLang ||
              (/[\u0400-\u04FF]/.test(tooltipRequestText) ? 'mn' : 'en');
          try {
            const { tooltip } = await translateWithOpenAI(
              tooltipRequestText,
              requestSourceLang,
              'en',
              {
                purpose: 'tooltip',
                metadata: entry?.metadata,
                baseEnglish: englishLabel,
                key,
              },
            );
            const validation = validateTranslatedText(tooltip, 'en');
            if (validation.ok) {
              const comparisonLabel =
                englishLabel ||
                (requestSourceLang === 'en' ? tooltipRequestText : '');
              if (
                comparisonLabel &&
                normalizeForComparison(comparisonLabel) ===
                  normalizeForComparison(validation.text)
              ) {
                locales.en.tooltip[key] = '';
                manualReview.track(
                  'tooltip',
                  'en',
                  key,
                  'tooltip matches label and lacks explanation',
                );
                console.warn(
                  `[gen-i18n] rejected English tooltip for key="${key}": tooltip matches label`,
                );
              } else {
                locales.en.tooltip[key] = validation.text;
              }
            } else {
              locales.en.tooltip[key] = '';
              manualReview.track(
                'tooltip',
                'en',
                key,
                validation.reason,
              );
              console.warn(
                `[gen-i18n] rejected English tooltip for key="${key}": ${validation.reason}`,
              );
            }
          } catch (err) {
            console.warn(
              `[gen-i18n] failed to generate English tooltip for key="${key}": ${err.message}`,
            );
            manualReview.track('tooltip', 'en', key, err.message);
            locales.en.tooltip[key] = '';
          }
        }
      }

      // Ensure Mongolian tooltip translated from English
      if (!locales.mn.tooltip[key] && locales.en.tooltip[key]) {
        let translationText = null;
        let failureReason = '';
        try {
          const { translation: tooltipTranslation } = await translateWithOpenAI(
            locales.en.tooltip[key],
            'en',
            'mn',
          );
          const validation = validateTranslatedText(tooltipTranslation, 'mn', {
            validator: isValidMongolianCyrillic,
            invalidReason:
              'contains Cyrillic characters outside the Mongolian range',
          });
          if (validation.ok) {
            translationText = validation.text;
          } else {
            failureReason = validation.reason;
            console.warn(
              `[gen-i18n] rejected OpenAI Mongolian tooltip for key="${key}": ${validation.reason}`,
            );
          }
        } catch (err) {
          console.warn(
            `[gen-i18n] OpenAI failed to generate Mongolian tooltip for key="${key}": ${err.message}`,
          );
          failureReason = err.message;
        }

        if (translationText == null) {
          try {
            const { translation: googleTooltip } = await translateWithGoogle(
              locales.en.tooltip[key],
              'mn',
              'en',
              key,
              {
                key: `${key}.tooltip`,
                purpose: 'tooltip',
                tooltipSourceText: locales.en.tooltip[key],
                tooltipSourceLang: 'en',
                resultType: 'tooltip',
              },
            );
            const validation = validateTranslatedText(googleTooltip, 'mn', {
              validator: isValidMongolianCyrillic,
              invalidReason:
                'contains Cyrillic characters outside the Mongolian range',
            });
            if (validation.ok) {
              translationText = validation.text;
            } else {
              failureReason = failureReason || validation.reason;
              console.warn(
                `[gen-i18n] rejected Google Mongolian tooltip for key="${key}": ${validation.reason}`,
              );
            }
          } catch (err2) {
            console.warn(
              `[gen-i18n] failed to generate Mongolian tooltip for key="${key}": ${err2.message}`,
            );
            failureReason = failureReason || err2.message;
          }
        }

        if (translationText) {
          locales.mn.tooltip[key] = translationText;
        } else {
          locales.mn.tooltip[key] = '';
          manualReview.track(
            'tooltip',
            'mn',
            key,
            failureReason || 'no valid tooltip translation',
          );
          console.warn(
            `[gen-i18n] Mongolian tooltip for key="${key}" requires manual QA${
              failureReason ? ` (${failureReason})` : ''
            }`,
          );
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

    for (const {
      key,
      sourceText,
      sourceLang,
      origin,
      metadata,
      baseEnglish,
    } of entries) {
      checkAbort();
      if (sourceLang === 'mn' && !/[\u0400-\u04FF]/.test(sourceText)) continue;
      if (sourceLang === 'en' && !/[A-Za-z]/.test(sourceText)) continue;

      let existing = locales[lang][key];

      if (lang !== sourceLang && typeof existing === 'string' && existing.trim()) {
        const prefix = `[gen-i18n]${origin ? `[${origin}]` : ''}`;
        const trimmedExisting = existing.trim();
        const detectedExisting = detectLang(trimmedExisting);
        const resolvedExisting = resolveDetectedLocale(
          detectedExisting,
          trimmedExisting,
        );
        const shouldClearExisting =
          resolvedExisting === 'en' &&
          shouldFlagLangMismatch(detectedExisting, lang, trimmedExisting);

        if (shouldClearExisting) {
          locales[lang][key] = '';
          console.warn(
            `${prefix} cleared stale English ${lang}.${key}: "${trimmedExisting}" -> ""`,
          );
        } else {
          log(`${prefix} Skipping ${lang}.${key}, already translated`);
          continue;
        }
      }

      if (lang === 'mn' && sourceLang === 'en') {
        const prefix = `[gen-i18n]${origin ? `[${origin}]` : ''}`;
        log(`${prefix} Translating "${sourceText}" (en -> mn)`);
        const englishTooltip = getEnglishTooltipSource(locales, key, [
          sourceLang,
          'en-US',
          'en-GB',
        ]);
        const tooltipSource = englishTooltip;
        let translationText = null;
        let translationProvider = '';
        let translationFailure = '';
        let tooltipText = null;
        let tooltipProvider = '';
        let tooltipFailure = '';

        try {
          const result = await translateWithOpenAI(
            sourceText,
            'en',
            'mn',
            {
              key,
              metadata,
              baseEnglish: baseEnglish || sourceText,
              tooltipSourceText: tooltipSource,
              tooltipSourceLang: 'en',
            },
          );
          const translationCheck = validateTranslatedText(result.translation, 'mn', {
            validator: isValidMongolianCyrillic,
            invalidReason:
              'contains Cyrillic characters outside the Mongolian range',
          });
          if (translationCheck.ok) {
            translationText = translationCheck.text;
            translationProvider = 'OpenAI';
          } else {
            translationFailure = translationCheck.reason;
            console.warn(
              `${prefix} rejected OpenAI translation for key="${key}": ${translationCheck.reason}`,
            );
          }

          const tooltipCheck = validateTranslatedText(result.tooltip, 'mn', {
            validator: isValidMongolianCyrillic,
            invalidReason:
              'contains Cyrillic characters outside the Mongolian range',
          });
          if (tooltipCheck.ok) {
            tooltipText = tooltipCheck.text;
            tooltipProvider = 'OpenAI';
          } else {
            tooltipFailure = tooltipCheck.reason;
            console.warn(
              `${prefix} rejected OpenAI tooltip for key="${key}": ${tooltipCheck.reason}`,
            );
          }
        } catch (err) {
          console.warn(
            `${prefix} OpenAI failed key="${key}" (en->mn): ${err.message}`,
          );
          translationFailure = translationFailure || err.message;
          tooltipFailure = tooltipFailure || err.message;
        }

        if (translationText == null) {
          try {
            const { translation: googleResult, correctionsApplied } =
              await translateWithGoogle(
                sourceText,
                'mn',
                'en',
                key,
                {
                  key,
                  metadata: entry?.metadata,
                  baseEnglish: baseEnglish || sourceText,
                  tooltipSourceText: tooltipSource,
                  tooltipSourceLang: 'en',
                },
              );
            const validation = validateTranslatedText(googleResult, 'mn', {
              validator: isValidMongolianCyrillic,
              invalidReason:
                'contains Cyrillic characters outside the Mongolian range',
            });
            if (validation.ok) {
              translationText = validation.text;
              translationProvider = correctionsApplied
                ? 'Google (QA corrected)'
                : 'Google';
            } else {
              translationFailure = translationFailure || validation.reason;
              console.warn(
                `${prefix} rejected Google translation for key="${key}": ${validation.reason}`,
              );
            }
          } catch (err) {
            translationFailure = translationFailure || err.message;
            console.warn(
              `${prefix} Google failed key="${key}" (en->mn): ${err.message}`,
            );
          }
        }

        if (tooltipText == null && tooltipSource) {
          try {
            const { translation: googleTooltip, correctionsApplied } =
              await translateWithGoogle(
                tooltipSource,
                'mn',
                'en',
                `${key}.tooltip`,
                {
                  key: `${key}.tooltip`,
                  metadata: entry?.metadata,
                  baseEnglish: baseEnglish || sourceText,
                  purpose: 'tooltip',
                  tooltipSourceText: tooltipSource,
                  tooltipSourceLang: 'en',
                  resultType: 'tooltip',
                },
              );
            const validation = validateTranslatedText(googleTooltip, 'mn', {
              validator: isValidMongolianCyrillic,
              invalidReason:
                'contains Cyrillic characters outside the Mongolian range',
            });
            if (validation.ok) {
              tooltipText = validation.text;
              tooltipProvider = correctionsApplied
                ? 'Google (QA corrected)'
                : 'Google';
            } else {
              tooltipFailure = tooltipFailure || validation.reason;
              console.warn(
                `${prefix} rejected Google tooltip for key="${key}": ${validation.reason}`,
              );
            }
          } catch (err) {
            tooltipFailure = tooltipFailure || err.message;
            console.warn(
              `${prefix} failed to generate Mongolian tooltip for key="${key}": ${err.message}`,
            );
          }
        }

        if (tooltipText == null && !tooltipSource && translationText) {
          tooltipText = translationText;
          tooltipProvider = tooltipProvider || translationProvider || 'label';
        }

        const finalTranslation = translationText ?? '';
        const finalTooltip = tooltipText ?? '';
        const trimmedExisting =
          typeof existing === 'string' ? existing.trim() : '';

        if (finalTranslation) {
          if (!existing) {
            locales.mn[key] = finalTranslation;
          } else if (finalTranslation !== trimmedExisting) {
            log(
              `${prefix} replaced mn.${key}: "${existing}" -> "${finalTranslation}"`,
            );
            locales.mn[key] = finalTranslation;
          }
          log(
            `${prefix} Mongolian translation for ${key} via ${translationProvider || 'OpenAI'}`,
          );
        } else {
          if (trimmedExisting) {
            console.warn(
              `${prefix} cleared mn.${key}: "${existing}" -> "" for manual QA`,
            );
          }
          locales.mn[key] = '';
          manualReview.track(
            'locale',
            'mn',
            key,
            translationFailure || 'no valid translation',
          );
          console.warn(
            `${prefix} Mongolian translation for ${key} requires manual QA${
              translationFailure ? ` (${translationFailure})` : ''
            }`,
          );
        }

        const existingTip = locales.mn.tooltip[key];
        const trimmedExistingTip =
          typeof existingTip === 'string' ? existingTip.trim() : '';

        if (finalTooltip) {
          if (!existingTip) {
            locales.mn.tooltip[key] = finalTooltip;
          } else if (finalTooltip !== trimmedExistingTip) {
            log(
              `${prefix} replaced mn.tooltip.${key}: "${existingTip}" -> "${finalTooltip}"`,
            );
            locales.mn.tooltip[key] = finalTooltip;
          }
          log(
            `${prefix} Mongolian tooltip for ${key} via ${tooltipProvider || translationProvider || 'OpenAI'}`,
          );
        } else if (tooltipSource) {
          if (trimmedExistingTip) {
            console.warn(
              `${prefix} cleared mn.tooltip.${key}: "${existingTip}" -> "" for manual QA`,
            );
          }
          locales.mn.tooltip[key] = '';
          manualReview.track(
            'tooltip',
            'mn',
            key,
            tooltipFailure || 'no valid tooltip translation',
          );
          console.warn(
            `${prefix} Mongolian tooltip for ${key} requires manual QA${
              tooltipFailure ? ` (${tooltipFailure})` : ''
            }`,
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

        const tooltipSource = getEnglishTooltipSource(locales, key, [
          fromLang,
          sourceLang,
          'en-US',
          'en-GB',
        ]);

        log(`Translating "${baseText}" (${fromLang} -> ${lang})`);
        let translationText = null;
        let translationProvider = '';
        let translationFailure = '';
        let tooltipText = null;
        let tooltipProvider = '';
        let tooltipFailure = '';
        try {
          const result = await translateWithOpenAI(
            baseText,
            fromLang,
            lang,
            {
              key,
              metadata,
              baseEnglish: baseEnglish || locales.en?.[key] || '',
              tooltipSourceText: tooltipSource,
              tooltipSourceLang: tooltipSource ? 'en' : fromLang,
            },
          );
          const translationCheck = validateTranslatedText(result.translation, lang);
          if (translationCheck.ok) {
            translationText = translationCheck.text;
            translationProvider = 'OpenAI';
          } else {
            translationFailure = translationCheck.reason;
            console.warn(
              `[gen-i18n] rejected OpenAI ${fromLang}->${lang} for key="${key}": ${translationCheck.reason}`,
            );
          }

          const tooltipCheck = validateTranslatedText(result.tooltip, lang);
          if (tooltipCheck.ok) {
            tooltipText = tooltipCheck.text;
            tooltipProvider = 'OpenAI';
          } else {
            tooltipFailure = tooltipCheck.reason;
            console.warn(
              `[gen-i18n] rejected OpenAI tooltip ${fromLang}->${lang} for key="${key}": ${tooltipCheck.reason}`,
            );
          }
        } catch (err) {
          console.warn(
            `[gen-i18n] OpenAI failed key="${key}" (${fromLang}->${lang}): ${err.message}`,
          );
          translationFailure = translationFailure || err.message;
          tooltipFailure = tooltipFailure || err.message;
        }

        if (translationText == null) {
          try {
            const { translation: googleResult, correctionsApplied } =
              await translateWithGoogle(baseText, lang, fromLang, key, {
                key,
                metadata,
                baseEnglish: baseEnglish || locales.en?.[key] || '',
                tooltipSourceText: tooltipSource,
                tooltipSourceLang: tooltipSource ? 'en' : fromLang,
              });
            const validation = validateTranslatedText(googleResult, lang);
            if (validation.ok) {
              translationText = validation.text;
              translationProvider = correctionsApplied
                ? 'Google (QA corrected)'
                : 'Google';
            } else {
              translationFailure = translationFailure || validation.reason;
              console.warn(
                `[gen-i18n] rejected Google ${fromLang}->${lang} for key="${key}": ${validation.reason}`,
              );
            }
          } catch (err) {
            console.warn(
              `[gen-i18n] Google failed key="${key}" (${fromLang}->${lang}): ${err.message}`,
            );
            translationFailure = translationFailure || err.message;
          }
        }

        if (tooltipText == null && tooltipSource) {
          try {
            const { translation: googleTooltip, correctionsApplied } =
              await translateWithGoogle(
                tooltipSource,
                lang,
                fromLang,
                `${key}.tooltip`,
                {
                  key: `${key}.tooltip`,
                  metadata,
                  baseEnglish: baseEnglish || locales.en?.[key] || '',
                  purpose: 'tooltip',
                  tooltipSourceText: tooltipSource,
                  tooltipSourceLang: tooltipSource ? 'en' : fromLang,
                  resultType: 'tooltip',
                },
              );
            const validation = validateTranslatedText(googleTooltip, lang);
            if (validation.ok) {
              tooltipText = validation.text;
              tooltipProvider = correctionsApplied
                ? 'Google (QA corrected)'
                : 'Google';
            } else {
              tooltipFailure = tooltipFailure || validation.reason;
              console.warn(
                `[gen-i18n] rejected Google tooltip ${fromLang}->${lang} for key="${key}": ${validation.reason}`,
              );
            }
          } catch (err) {
            tooltipFailure = tooltipFailure || err.message;
            console.warn(
              `[gen-i18n] Google tooltip translation failed key="${key}" (${fromLang}->${lang}): ${err.message}`,
            );
          }
        }

        if (tooltipText == null && !tooltipSource && translationText) {
          tooltipText = translationText;
          tooltipProvider = tooltipProvider || translationProvider || 'label';
        }

        const finalTranslation = translationText ?? '';
        const trimmedExisting =
          typeof existing === 'string' ? existing.trim() : '';

        if (finalTranslation) {
          if (!existing) {
            locales[lang][key] = finalTranslation;
          } else if (finalTranslation !== trimmedExisting) {
            log(
              `[gen-i18n] replaced ${lang}.${key}: "${existing}" -> "${finalTranslation}"`,
            );
            locales[lang][key] = finalTranslation;
          }
          log(`    using ${translationProvider || 'OpenAI'}`);
        } else {
          if (trimmedExisting) {
            console.warn(
              `[gen-i18n] cleared ${lang}.${key}: "${existing}" -> "" for manual QA`,
            );
          }
          locales[lang][key] = '';
          manualReview.track(
            'locale',
            lang,
            key,
            translationFailure || 'no valid translation',
          );
          console.warn(
            `[gen-i18n] ${lang} translation for ${key} requires manual QA${
              translationFailure ? ` (${translationFailure})` : ''
            }`,
          );
        }

        const existingTip = locales[lang].tooltip[key];
        const trimmedExistingTip =
          typeof existingTip === 'string' ? existingTip.trim() : '';
        const finalTooltip = tooltipText ?? '';

        if (finalTooltip) {
          if (!existingTip) {
            locales[lang].tooltip[key] = finalTooltip;
          } else if (finalTooltip !== trimmedExistingTip) {
            log(
              `[gen-i18n] replaced ${lang}.tooltip.${key}: "${existingTip}" -> "${finalTooltip}"`,
            );
            locales[lang].tooltip[key] = finalTooltip;
          }
          log(
            `[gen-i18n] ${lang} tooltip for ${key} via ${
              tooltipProvider || translationProvider || 'OpenAI'
            }`,
          );
        } else if (tooltipSource || trimmedExistingTip) {
          if (trimmedExistingTip) {
            console.warn(
              `[gen-i18n] cleared ${lang}.tooltip.${key}: "${existingTip}" -> "" for manual QA`,
            );
          }
          locales[lang].tooltip[key] = '';
          manualReview.track(
            'tooltip',
            lang,
            key,
            tooltipFailure || 'no valid tooltip translation',
          );
          if (tooltipSource) {
            console.warn(
              `[gen-i18n] ${lang} tooltip for ${key} requires manual QA${
                tooltipFailure ? ` (${tooltipFailure})` : ''
              }`,
            );
          }
        }
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

  manualReview.flush(log);

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

  const tooltipDir = path.resolve('src/erp.mgt.mn/locales/tooltips');
  await fs.promises.mkdir(tooltipDir, { recursive: true });

  const tipData = {};
  const manualReview = createManualReviewTracker('gen-tooltips');
  for (const lang of languages) {
    const p = path.join(tooltipDir, `${lang}.json`);
    tipData[lang] = fs.existsSync(p)
      ? JSON.parse(fs.readFileSync(p, 'utf8'))
      : {};
  }

  if (tipData.en && tipData.mn) {
    syncKeys(tipData.en, tipData.mn, 'tooltip');
    fs.writeFileSync(
      path.join(tooltipDir, 'en.json'),
      JSON.stringify(sortObj(tipData.en), null, 2),
    );
    fs.writeFileSync(
      path.join(tooltipDir, 'mn.json'),
      JSON.stringify(sortObj(tipData.mn), null, 2),
    );
  }

  const baseKeys = Array.from(
    new Set([
      ...Object.keys(tipData.en || {}),
      ...Object.keys(tipData.mn || {}),
    ]),
  );

  const englishLocalePath = path.join(localesDir, 'en.json');
  let englishLocale = {};
  if (fs.existsSync(englishLocalePath)) {
    try {
      englishLocale = JSON.parse(fs.readFileSync(englishLocalePath, 'utf8'));
    } catch (err) {
      console.warn(
        `[gen-tooltips] failed to parse English locale file: ${err.message}`,
      );
    }
  }

  function getEnglishLabelForKey(key) {
    const raw = englishLocale?.[key];
    if (typeof raw === 'string') return raw;
    if (raw && typeof raw === 'object') {
      if (typeof raw.en === 'string') return raw.en;
      if (typeof raw.value === 'string') return raw.value;
    }
    return '';
  }

  function buildEnglishMetadataForKey(key) {
    const moduleName = deriveModuleFromKey(key);
    if (!moduleName) return null;
    return { module: [moduleName] };
  }

  const englishTooltips = tipData.en || {};
  tipData.en = englishTooltips;
  for (const key of baseKeys) {
    checkAbort();
    const existing = englishTooltips[key];
    const hasExisting = typeof existing === 'string' && existing.trim();
    if (hasExisting) continue;

    const englishLabel = getEnglishLabelForKey(key).trim();
    if (!englishLabel) {
      if (existing !== '') {
        englishTooltips[key] = '';
      }
      manualReview.track(
        'tooltip',
        'en',
        key,
        'missing base text for tooltip generation',
      );
      console.warn(
        `[gen-tooltips] missing base text for English tooltip key="${key}"`,
      );
      continue;
    }

    try {
      const { tooltip } = await translateWithOpenAI(
        englishLabel,
        'en',
        'en',
        {
          purpose: 'tooltip',
          metadata: buildEnglishMetadataForKey(key),
          baseEnglish: englishLabel,
          key,
        },
      );
      const validation = validateTranslatedText(tooltip, 'en');
      if (validation.ok) {
        if (
          normalizeForComparison(englishLabel) ===
          normalizeForComparison(validation.text)
        ) {
          englishTooltips[key] = '';
          manualReview.track(
            'tooltip',
            'en',
            key,
            'tooltip matches label and lacks explanation',
          );
          console.warn(
            `[gen-tooltips] rejected English tooltip for key="${key}": tooltip matches label`,
          );
        } else {
          englishTooltips[key] = validation.text;
        }
      } else {
        englishTooltips[key] = '';
        manualReview.track('tooltip', 'en', key, validation.reason);
        console.warn(
          `[gen-tooltips] rejected English tooltip for key="${key}": ${validation.reason}`,
        );
      }
    } catch (err) {
      englishTooltips[key] = '';
      manualReview.track('tooltip', 'en', key, err.message);
      console.warn(
        `[gen-tooltips] failed to generate English tooltip for key="${key}": ${err.message}`,
      );
    }
  }

  async function ensureTooltipLanguage(obj, lang) {
    let changed = false;
    for (const [k, v] of Object.entries(obj)) {
      if (typeof v !== 'string') continue;
      if (
        isNormalizedKeyMatch(k, v) ||
        isNormalizedKeyMatch(`tooltip.${k}`, v)
      ) {
        continue;
      }
      const detectedLang = detectLang(v);
      const relocationLang = resolveDetectedLocale(detectedLang, v);
      if (
        relocationLang &&
        shouldFlagLangMismatch(detectedLang, lang, v)
      ) {
        const originalValue = v;
        let targetTips = tipData[relocationLang];
        if (!targetTips || typeof targetTips !== 'object') {
          targetTips = {};
          tipData[relocationLang] = targetTips;
        }
        const existingTarget = targetTips[k];
        if (
          existingTarget == null ||
          (typeof existingTarget === 'string' && !existingTarget.trim())
        ) {
          targetTips[k] = originalValue;
        } else if (
          typeof existingTarget === 'string' &&
          existingTarget.trim() !== originalValue.trim()
        ) {
          console.warn(
            `[gen-tooltips] relocation skipped overriding existing ${relocationLang}.${k}`,
          );
        }

        const tooltipOptions = { purpose: 'tooltip' };
        if (lang === 'mn') {
          tooltipOptions.validator = isValidMongolianCyrillic;
          tooltipOptions.invalidReason =
            'contains Cyrillic characters outside the Mongolian range';
        }
        const translated = await translateWithPreferredProviders(
          originalValue,
          relocationLang,
          lang,
          `tooltip.${k}`,
          'gen-tooltips',
          tooltipOptions,
        );
        if (translated) {
          obj[k] = translated.text;
          console.warn(
            `[gen-tooltips] relocated ${lang}.${k} -> ${relocationLang}.${k}; filled with ${translated.provider}`,
          );
        } else {
          obj[k] = '';
          console.warn(
            `[gen-tooltips] relocated ${lang}.${k} -> ${relocationLang}.${k}; no valid translation`,
          );
          manualReview.track(
            'tooltip',
            lang,
            k,
            'no valid relocation translation',
          );
        }
        changed = true;
      }
    }
    return changed;
  }

  if (tipData.en) await ensureTooltipLanguage(tipData.en, 'en');
  if (tipData.mn) await ensureTooltipLanguage(tipData.mn, 'mn');
  for (const cleanupLang of ['ja', 'zh']) {
    if (tipData[cleanupLang]) {
      await ensureTooltipLanguage(tipData[cleanupLang], cleanupLang);
    }
  }

  for (const lang of languages) {
    checkAbort();
    const langPath = path.join(tooltipDir, `${lang}.json`);
    const current = tipData[lang] || {};
    // remove keys not in base to keep key counts aligned
    for (const k of Object.keys(current)) {
      if (!baseKeys.includes(k)) delete current[k];
    }
    let updated = lang === 'en' || lang === 'mn';

    for (const key of baseKeys) {
      if (lang === 'en') {
        const englishValue = tipData.en?.[key] ?? '';
        if (current[key] !== englishValue) {
          current[key] = englishValue;
          updated = true;
        }
        continue;
      }

      if (current[key]) continue;
      checkAbort();
      const sourceText = tipData.en?.[key];
      const trimmedSource =
        typeof sourceText === 'string' ? sourceText.trim() : '';
      if (!trimmedSource) {
        if (current[key] !== '') {
          current[key] = '';
          updated = true;
        }
        manualReview.track(
          'tooltip',
          lang,
          key,
          'missing English base tooltip',
        );
        console.warn(
          `[gen-tooltips] skipped ${lang} tooltip for key="${key}": missing English base tooltip`,
        );
        continue;
      }
      const sourceLang = 'en';
      let translationText = null;
      let failureReason = '';
      try {
        const res = await translateWithOpenAI(sourceText, sourceLang, lang);
        const validation = validateTranslatedText(res.translation, lang, {
          validator: lang === 'mn' ? isValidMongolianCyrillic : undefined,
          invalidReason:
            'contains Cyrillic characters outside the Mongolian range',
        });
        if (validation.ok) {
          translationText = validation.text;
        } else {
          failureReason = validation.reason;
          console.warn(
            `[gen-tooltips] rejected OpenAI ${sourceLang}->${lang} for key="${key}": ${validation.reason}`,
          );
        }
      } catch (err) {
        failureReason = err.message;
        console.warn(
          `[gen-tooltips] OpenAI failed ${sourceLang}->${lang} for key="${key}": ${err.message}`,
        );
      }
      if (translationText == null) {
        try {
          const { translation: google } = await translateWithGoogle(
            sourceText,
            lang,
            sourceLang,
            `${key}.tooltip`,
            {
              key: `${key}.tooltip`,
              purpose: 'tooltip',
              tooltipSourceText: sourceText,
              tooltipSourceLang: sourceLang,
              resultType: 'tooltip',
            },
          );
          const validation = validateTranslatedText(google, lang, {
            validator: lang === 'mn' ? isValidMongolianCyrillic : undefined,
            invalidReason:
              'contains Cyrillic characters outside the Mongolian range',
          });
          if (validation.ok) {
            translationText = validation.text;
          } else {
            failureReason = failureReason || validation.reason;
            console.warn(
              `[gen-tooltips] rejected Google ${sourceLang}->${lang} for key="${key}": ${validation.reason}`,
            );
          }
        } catch (err2) {
          failureReason = failureReason || err2.message;
          console.warn(
            `[gen-tooltips] failed ${sourceLang}->${lang} for key="${key}": ${err2.message}`,
          );
        }
      }
      if (translationText) {
        current[key] = translationText;
        updated = true;
      } else {
        current[key] = '';
        manualReview.track(
          'tooltip',
          lang,
          key,
          failureReason || 'no valid translation',
        );
        console.warn(
          `[gen-tooltips] ${sourceLang}->${lang} for key="${key}" requires manual QA${
            failureReason ? ` (${failureReason})` : ''
          }`,
        );
        updated = true;
      }
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
  manualReview.flush(log);
  log('[gen-tooltips] DONE');
}

