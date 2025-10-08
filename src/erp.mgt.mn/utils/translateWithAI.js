import {
  evaluateTranslationCandidate,
  summarizeHeuristic,
} from '../../../utils/translationValidation.js';

const localeCache = {};
const aiCache = {};
let aiDisabled = false;

const LANGUAGE_LABELS = {
  mn: 'Mongolian (Cyrillic)',
  en: 'English',
  ru: 'Russian',
  ja: 'Japanese',
  ko: 'Korean',
  zh: 'Chinese',
  de: 'German',
  fr: 'French',
  es: 'Spanish',
};

const RETRY_HINTS = {
  contains_latin_script:
    'Remove Latin characters and write the translation using Mongolian Cyrillic script only.',
  contains_tibetan_script:
    'Avoid Tibetan letters; use only standard Mongolian Cyrillic.',
  no_cyrillic_content:
    'Use Mongolian Cyrillic letters for the translation.',
  insufficient_cyrillic_ratio:
    'Increase the proportion of Mongolian Cyrillic letters.',
  limited_cyrillic_content:
    'Provide fuller Mongolian words instead of short fragments.',
  insufficient_character_variety:
    'Use varied Mongolian words rather than repeating the same characters.',
  insufficient_word_length:
    'Write meaningful Mongolian words that are a few letters long.',
  missing_mongolian_vowel:
    'Include natural Mongolian vowels to form real words.',
  appears_english: 'Translate the text instead of leaving it in English.',
  possibly_english:
    'Ensure the translation is in the target language, not English.',
  no_language_signal:
    'Provide meaningful words in the target language, not punctuation or symbols.',
  identical_to_base: 'Do not repeat the source text; translate it.',
  too_short_for_context:
    'Give a translation that matches the level of detail in the source sentence.',
  remote_validation_failed:
    'Revise the translation so it clearly conveys the original meaning in fluent Mongolian.',
  remote_low_confidence:
    'Improve the translation so it reads naturally to a Mongolian speaker.',
};

function getLanguageLabel(lang) {
  if (!lang) return 'the requested language';
  const lower = String(lang).toLowerCase();
  return LANGUAGE_LABELS[lower] || lower;
}

function sanitizeSnippet(value, maxLength = 400) {
  if (!value) return '';
  const str = typeof value === 'string' ? value : String(value ?? '');
  return str.replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function buildPrompt(text, lang, options = {}) {
  const textStr = typeof text === 'string' ? text : String(text ?? '');
  const label = getLanguageLabel(lang);
  const parts = [
    `You are a professional translator. Translate the following text into ${label}.`,
    'Return only the translated text without commentary.',
    'Preserve any placeholders such as {{variable}}, %s, {0}, or HTML tags exactly as in the source.',
  ];

  if (String(lang).toLowerCase() === 'mn') {
    parts.push(
      'Write fluent, natural Mongolian using Cyrillic script only. The result must be meaningful business terminology, not transliteration or gibberish.',
    );
  }

  const feedback = sanitizeSnippet(options.feedback, 360);
  if (feedback) {
    parts.push(`Address these quality issues: ${feedback}`);
  }

  if (options.attempt && options.attempt > 1) {
    parts.push('Provide a different phrasing from earlier attempts while keeping the same meaning.');
  }

  const previous = Array.isArray(options.previousCandidates)
    ? options.previousCandidates
        .map((candidate) => sanitizeSnippet(candidate, 120))
        .filter(Boolean)
    : [];
  if (previous.length) {
    const recent = previous.slice(-3).map((candidate) => `"${candidate}"`).join('; ');
    if (recent) {
      parts.push(`Do not repeat these rejected outputs: ${recent}.`);
    }
  }

  parts.push(`Text to translate:\n"""${textStr}"""`);
  return parts.join('\n\n');
}

function formatReason(reason) {
  if (!reason) return '';
  if (reason.startsWith('missing_placeholders')) {
    const [, payload] = reason.split(':');
    if (payload) {
      const placeholders = payload
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
        .join(', ');
      if (placeholders) {
        return `Ensure these placeholders appear exactly: ${placeholders}.`;
      }
    }
    return 'Preserve all placeholders exactly as in the source text.';
  }
  if (RETRY_HINTS[reason]) return RETRY_HINTS[reason];
  if (reason.includes('_')) {
    return reason.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return reason;
}

function buildFeedbackFromHeuristics(heuristics) {
  if (!heuristics) return '';
  const hints = [];
  if (Array.isArray(heuristics.reasons)) {
    for (const reason of heuristics.reasons) {
      const formatted = formatReason(reason);
      if (formatted) hints.push(formatted);
    }
  }
  const missingPlaceholders = heuristics.placeholders?.missing;
  if (Array.isArray(missingPlaceholders) && missingPlaceholders.length) {
    hints.push(
      `Include these placeholders: ${missingPlaceholders
        .map((ph) => ph.trim())
        .filter(Boolean)
        .join(', ')}.`,
    );
  }
  return sanitizeSnippet(hints.join(' '), 360);
}

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

async function requestAI(text, lang, options = {}) {
  if (aiDisabled) return text;
  try {
    const prompt = buildPrompt(text, lang, options);
    const payload = {
      prompt,
      task: 'translation',
      lang,
      key: options.key,
      attempt: options.attempt,
      model: options.model,
      metadata: options.metadata,
    };
    const res = await fetch('/api/openai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
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

function shouldLogDiagnostics() {
  if (typeof localStorage === 'undefined') return false;
  try {
    const flag = localStorage.getItem('ai-translation-debug');
    if (flag === '1' || flag === 'true') return true;
  } catch {}
  return false;
}

function logDiagnostics(event, details) {
  if (!shouldLogDiagnostics()) return;
  const payload = {
    ...details,
  };
  try {
    // Avoid logging huge strings.
    if (payload?.candidate) {
      payload.candidate = sanitizeSnippet(payload.candidate, 160);
    }
  } catch {}
  // eslint-disable-next-line no-console
  console.warn(`[translateWithAI] ${event}`, payload);
}

async function validateRemotely({ candidate, base, lang, metadata }) {
  if (typeof fetch !== 'function') return null;
  try {
    const res = await fetch('/api/openai/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ candidate, base, lang, metadata }),
      skipErrorToast: true,
      skipLoader: true,
    });
    if (!res.ok) {
      return { ok: false, status: res.status };
    }
    const data = await res.json();
    return { ok: true, ...data };
  } catch (err) {
    console.error('Remote validation request failed', err);
    return { ok: false, error: err };
  }
}

export default async function translateWithAI(lang, key, fallback) {
  const locales = await loadLocale(lang);
  if (locales[key]) return locales[key];
  const cache = getCache(lang);
  if (cache[key]) return cache[key];
  const text = fallback ?? key;
  const normalizedText = typeof text === 'string' ? text : String(text ?? '');
  const maxAttempts = String(lang).toLowerCase() === 'mn' ? 5 : 3;
  const previousCandidates = [];
  let heuristics = null;
  let finalTranslation = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const feedback = buildFeedbackFromHeuristics(heuristics);
    const candidate = await requestAI(normalizedText, lang, {
      attempt,
      feedback,
      previousCandidates,
      key,
    });
    if (!candidate || !candidate.trim()) {
      heuristics = {
        status: 'fail',
        reasons: ['empty_translation'],
        placeholders: { missing: [], extra: [] },
      };
      logDiagnostics('empty-candidate', {
        key,
        attempt,
      });
      continue;
    }

    const candidateText = candidate.trim();
    const evaluation = evaluateTranslationCandidate({
      candidate: candidateText,
      base: normalizedText,
      lang,
    });

    if (evaluation.status === 'pass') {
      let remoteResult = null;
      if (String(lang).toLowerCase() === 'mn') {
        remoteResult = await validateRemotely({
          candidate: candidateText,
          base: normalizedText,
          lang,
          metadata: { key },
        });
      }

      if (remoteResult?.ok && remoteResult.valid) {
        heuristics = {
          ...evaluation,
          remoteValidation: remoteResult,
        };
        finalTranslation = candidateText;
        break;
      }

      if (remoteResult?.ok && !remoteResult.valid) {
        const remoteReason = remoteResult.reason || 'remote_validation_failed';
        let reasonTag = remoteReason.startsWith('remote_')
          ? remoteReason
          : `remote_${remoteReason}`;
        if (remoteReason === 'low_language_confidence') {
          reasonTag = 'remote_low_confidence';
        } else if (remoteReason === 'validation_failed') {
          reasonTag = 'remote_validation_failed';
        }
        const combinedReasons = evaluation.reasons.includes(reasonTag)
          ? evaluation.reasons
          : [...evaluation.reasons, reasonTag];
        heuristics = {
          ...evaluation,
          status: remoteResult.needsRetry ? 'retry' : 'fail',
          reasons: combinedReasons,
          remoteValidation: remoteResult,
        };
        logDiagnostics('remote-rejected', {
          key,
          attempt,
          reason: remoteReason,
          needsRetry: remoteResult.needsRetry,
          languageConfidence: remoteResult.languageConfidence ?? null,
          summary: summarizeHeuristic(heuristics),
          candidate: candidateText,
        });
        if (!remoteResult.needsRetry) {
          break;
        }
        continue;
      }

      if (remoteResult?.ok === false && remoteResult.status) {
        logDiagnostics('remote-unavailable', {
          key,
          attempt,
          status: remoteResult.status,
        });
      }

      heuristics = {
        ...evaluation,
        remoteValidation: remoteResult || undefined,
      };
      finalTranslation = candidateText;
      break;
    }

    heuristics = evaluation;
    if (!previousCandidates.includes(candidateText)) {
      previousCandidates.push(candidateText);
    }

    logDiagnostics('heuristic-reject', {
      key,
      attempt,
      status: evaluation.status,
      reasons: evaluation.reasons,
      summary: summarizeHeuristic(evaluation),
      candidate: candidateText,
    });

    if (evaluation.status === 'fail' && !evaluation.reasons.length) {
      break;
    }
  }

  if (finalTranslation) {
    cache[key] = finalTranslation;
    saveCache(lang);
    return finalTranslation;
  }

  if (heuristics) {
    logDiagnostics('translation-fallback', {
      key,
      attempts: maxAttempts,
      summary: summarizeHeuristic(heuristics),
      reasons: heuristics.reasons,
    });
  }

  return normalizedText;
}
