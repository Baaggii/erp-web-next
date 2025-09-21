import React, { useEffect, useState, useContext, useRef, useCallback } from 'react';
import I18nContext from '../context/I18nContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import translateWithCache from '../utils/translateWithCache.js';
import { evaluateTranslationCandidate } from '../../../utils/translationValidation.js';

const delay = () => new Promise((r) => setTimeout(r, 200));
const RATE_LIMIT_MAX_RETRIES = 3;
const RATE_LIMIT_BASE_DELAY = 500;
const RATE_LIMIT_MAX_DELAY = 5000;

const cyrillicRegex = /[\u0400-\u04FF]/;
const latinRegex = /[A-Za-z]/;

function normalizeBaseLanguageValue(value) {
  if (typeof value === 'string') return value.trim();
  if (value == null) return '';
  return String(value).trim();
}

function extractEnglishStats(text) {
  const defaults = { ratio: 0, asciiCount: 0, matches: 0 };
  if (!text) return defaults;
  try {
    const heuristics = evaluateTranslationCandidate({
      candidate: text,
      base: '',
      lang: 'mn',
      metadata: {},
    });
    const english = heuristics?.english;
    if (english) {
      return {
        ratio: Number.isFinite(english.ratio) ? english.ratio : defaults.ratio,
        asciiCount: Number.isFinite(english.asciiCount)
          ? english.asciiCount
          : defaults.asciiCount,
        matches: Number.isFinite(english.englishMatches)
          ? english.englishMatches
          : defaults.matches,
      };
    }
  } catch {
    // ignore heuristics errors and fall back to defaults
  }
  return defaults;
}

function analyzeBaseLanguage(value) {
  const text = normalizeBaseLanguageValue(value);
  if (!text) {
    return {
      text,
      language: null,
      reason: 'empty',
      hasCyrillic: false,
      hasLatin: false,
      english: { ratio: 0, asciiCount: 0, matches: 0 },
    };
  }

  const hasCyrillic = cyrillicRegex.test(text);
  const hasLatin = latinRegex.test(text);
  const english = extractEnglishStats(text);
  let language = null;
  let reason = 'no_language_signal';

  if (hasCyrillic && !hasLatin) {
    language = 'mn';
    reason = 'cyrillic_only';
  } else if (hasCyrillic && hasLatin) {
    if (english.ratio >= 0.6 && english.asciiCount >= 2) {
      language = 'en';
      reason = 'mixed_but_english_dominant';
    } else if (english.ratio <= 0.2) {
      language = 'mn';
      reason = 'mixed_but_cyrillic_dominant';
    } else {
      language = null;
      reason = 'mixed_scripts';
    }
  } else if (!hasCyrillic && hasLatin) {
    if (english.asciiCount >= 2 && (english.ratio >= 0.4 || english.matches >= 1)) {
      language = 'en';
      reason = 'latin_script';
    } else if (english.asciiCount >= 1 && text.split(' ').length === 1) {
      language = 'en';
      reason = 'single_latin_token';
    } else {
      language = null;
      reason = 'latin_without_signal';
    }
  }

  return { text, language, reason, hasCyrillic, hasLatin, english };
}

export function validateBaseLanguages(entries) {
  const invalid = [];
  if (!Array.isArray(entries) || !entries.length) {
    return { invalid };
  }

  entries.forEach((entry, index) => {
    const values = entry?.values ?? {};
    const enAnalysis = analyzeBaseLanguage(values.en);
    const mnAnalysis = analyzeBaseLanguage(values.mn);
    const issues = [];

    if (enAnalysis.text) {
      if (enAnalysis.language === 'mn') {
        issues.push('englishLooksMongolian');
      } else if (enAnalysis.hasCyrillic) {
        issues.push('englishMixedScripts');
      }
    }

    if (mnAnalysis.text) {
      if (mnAnalysis.language === 'en') {
        issues.push('mongolianLooksEnglish');
      } else if (mnAnalysis.hasLatin && mnAnalysis.language !== 'mn') {
        issues.push('mongolianMixedScripts');
      }
    }

    if (
      enAnalysis.text &&
      mnAnalysis.text &&
      issues.includes('englishLooksMongolian') &&
      issues.includes('mongolianLooksEnglish')
    ) {
      issues.push('baseFieldsSwapped');
    }

    if (issues.length) {
      invalid.push({
        index,
        key: entry?.key ?? '',
        issues,
        en: enAnalysis,
        mn: mnAnalysis,
      });
    }
  });

  return { invalid };
}

export default function ManualTranslationsTab() {
  const { t } = useContext(I18nContext);
  const { addToast } = useToast();
  const [languages, setLanguages] = useState([]);
  const [entries, setEntries] = useState([]);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const [searchTerm, setSearchTerm] = useState('');
  const [completing, setCompleting] = useState(false);
  const [activeRow, setActiveRow] = useState(null);
  const [savingLanguage, setSavingLanguage] = useState(null);
  const abortRef = useRef(false);
  const processingRef = useRef(false);
  const activeRowRef = useRef(null);
  const loadStateRef = useRef({
    promise: null,
    retryCount: 0,
    timeoutId: null,
    cooldown: false,
    notified: false,
  });

  const load = useCallback(
    async ({ ignoreCooldown = false } = {}) => {
      const state = loadStateRef.current;
      if (state.cooldown && !ignoreCooldown) {
        return state.promise ?? Promise.resolve();
      }
      if (state.promise) {
        return state.promise;
      }

      const requestPromise = (async () => {
        try {
          const res = await fetch('/api/manual_translations', { credentials: 'include' });
          if (res.status === 429) {
            if (!state.notified && typeof window !== 'undefined' && window?.dispatchEvent) {
              window.dispatchEvent(
                new CustomEvent('toast', {
                  detail: {
                    message: t(
                      'rateLimitExceeded',
                      'Too many requests, please try again later',
                    ),
                    type: 'error',
                  },
                }),
              );
              state.notified = true;
            }
            if (state.retryCount < RATE_LIMIT_MAX_RETRIES) {
              const wait = Math.min(
                RATE_LIMIT_BASE_DELAY * 2 ** state.retryCount,
                RATE_LIMIT_MAX_DELAY,
              );
              state.retryCount += 1;
              state.cooldown = true;
              if (state.timeoutId) {
                clearTimeout(state.timeoutId);
              }
              state.timeoutId = setTimeout(() => {
                state.timeoutId = null;
                state.cooldown = false;
                load({ ignoreCooldown: true });
              }, wait);
            } else {
              state.cooldown = false;
            }
            return;
          }

          state.retryCount = 0;
          state.cooldown = false;
          state.notified = false;
          if (state.timeoutId) {
            clearTimeout(state.timeoutId);
            state.timeoutId = null;
          }

          if (res.ok) {
            const data = await res.json();
            setLanguages(data.languages ?? []);
            const normalizedEntries = (data.entries ?? []).map((entry) => ({
              ...entry,
              module: entry.module ?? '',
              context: entry.context ?? '',
              values: entry.values ?? {},
            }));
            setEntries(normalizedEntries);
          }
        } catch {
          // ignore
        }
      })();

      state.promise = requestPromise;
      requestPromise.finally(() => {
        if (state.promise === requestPromise) {
          state.promise = null;
        }
      });
      return requestPromise;
    },
    [t],
  );

  const refreshEntries = useCallback(
    async ({ force = false } = {}) => {
      const state = loadStateRef.current;
      if (state.cooldown && !force) {
        return state.promise ?? Promise.resolve();
      }
      return load({ ignoreCooldown: force });
    },
    [load],
  );

  useEffect(() => {
    load();
    return () => {
      const state = loadStateRef.current;
      if (state.timeoutId) {
        clearTimeout(state.timeoutId);
        state.timeoutId = null;
      }
      state.promise = null;
      state.cooldown = false;
    };
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [searchTerm]);

  useEffect(() => {
    if (activeRowRef.current) {
      activeRowRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [page, activeRow]);

  const filteredEntries = entries.filter((entry) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    if (String(entry.key ?? '').toLowerCase().includes(term)) return true;
    if (String(entry.module ?? '').toLowerCase().includes(term)) return true;
    if (String(entry.context ?? '').toLowerCase().includes(term)) return true;
    return Object.values(entry.values ?? {}).some((v) =>
      String(v ?? '').toLowerCase().includes(term),
    );
  });

  const start = (page - 1) * perPage;
  const paged = filteredEntries.slice(start, start + perPage);
  const totalPages = Math.max(1, Math.ceil(filteredEntries.length / perPage));

  const showBaseLanguageError = useCallback(
    (invalid = []) => {
      const sample = invalid.find((item) => item.key?.trim());
      const key = sample ? 'baseLanguageMismatchForKey' : 'baseLanguageMismatch';
      const fallback = sample
        ? `Entry "${sample.key}" has mismatched English/Mongolian text. Please fix the base languages before continuing.`
        : 'Some entries have mismatched English/Mongolian text. Please fix the base languages before continuing.';
      addToast(t(key, fallback), 'error');
    },
    [addToast, t],
  );

  const resolveBaseLanguages = useCallback(
    async (entriesToCheck) => {
      const initial = validateBaseLanguages(entriesToCheck);
      if (!initial.invalid.length) {
        return {
          correctedEntries: entriesToCheck,
          changed: false,
          success: true,
          invalid: [],
          needsManualReview: [],
        };
      }

      const correctedEntries = entriesToCheck.map((entry) => ({
        ...entry,
        values: { ...(entry?.values ?? {}) },
      }));

      let changed = false;
      const manualReviewIndexes = new Set();

      for (const issue of initial.invalid) {
        const entry = correctedEntries[issue.index];
        if (!entry) continue;

        entry.values = { ...(entry.values ?? {}) };

        const metadata = {
          module: entry.module,
          context: entry.context,
          key: entry.key,
        };

        const getEnText = () => normalizeBaseLanguageValue(entry.values.en);
        const getMnText = () => normalizeBaseLanguageValue(entry.values.mn);
        const getEnLanguage = () => analyzeBaseLanguage(entry.values.en).language;
        const getMnLanguage = () => analyzeBaseLanguage(entry.values.mn).language;

        let swapped = false;
        let attemptedMnTranslation = false;
        let mnTranslationSucceeded = false;
        let attemptedEnTranslation = false;
        let enTranslationSucceeded = false;

        if (issue.issues.includes('baseFieldsSwapped')) {
          const previousEn = entry.values.en;
          entry.values.en = entry.values.mn;
          entry.values.mn = previousEn;
          swapped = true;
          changed = true;
        }

        if (
          !issue.issues.includes('baseFieldsSwapped') ||
          getEnLanguage() !== 'en' ||
          getMnLanguage() !== 'mn'
        ) {
          if (issue.issues.includes('englishLooksMongolian')) {
            const source =
              normalizeBaseLanguageValue(issue.en?.text) || getMnText() || getEnText();

            if (source && getMnLanguage() !== 'mn') {
              entry.values.mn = source;
              changed = true;
            }

            if (source && getEnLanguage() !== 'en') {
              attemptedEnTranslation = true;
              try {
                const translated = await translateWithCache(
                  'en',
                  source,
                  undefined,
                  metadata,
                );
                if (translated?.text && !translated.needsRetry) {
                  entry.values.en = translated.text;
                  changed = true;
                  enTranslationSucceeded = true;
                }
              } catch {
                // ignore translation errors; validation below will catch unresolved entries
              }
            }
          }

          if (issue.issues.includes('mongolianLooksEnglish')) {
            const source =
              normalizeBaseLanguageValue(issue.mn?.text) || getEnText() || getMnText();

            if (source && getEnLanguage() !== 'en') {
              entry.values.en = source;
              changed = true;
            }

            if (source && getMnLanguage() !== 'mn') {
              attemptedMnTranslation = true;
              try {
                const translated = await translateWithCache(
                  'mn',
                  source,
                  undefined,
                  metadata,
                );
                if (translated?.text && !translated.needsRetry) {
                  entry.values.mn = translated.text;
                  changed = true;
                  mnTranslationSucceeded = true;
                }
              } catch {
                // ignore translation errors; validation below will catch unresolved entries
              }
            }
          }
        }

        if (attemptedEnTranslation && !enTranslationSucceeded) {
          const enAnalysisAfter = analyzeBaseLanguage(entry.values.en);
          if (enAnalysisAfter.language !== 'en') {
            const previousEnRaw = entry.values.en;
            const normalizedEn = normalizeBaseLanguageValue(previousEnRaw);
            if (previousEnRaw !== '' || normalizedEn) {
              entry.values.en = '';
              if (
                normalizedEn ||
                (typeof previousEnRaw === 'string' && previousEnRaw !== '')
              ) {
                changed = true;
              }
            }
            manualReviewIndexes.add(issue.index);
          }
        }

        if (swapped && attemptedMnTranslation && !mnTranslationSucceeded) {
          const previousMn = normalizeBaseLanguageValue(entry.values.mn);
          if (previousMn) {
            entry.values.mn = '';
            changed = true;
          } else {
            entry.values.mn = '';
          }
          manualReviewIndexes.add(issue.index);
        }
      }

      const finalResult = changed ? validateBaseLanguages(correctedEntries) : initial;

      return {
        correctedEntries: changed ? correctedEntries : entriesToCheck,
        changed,
        success: finalResult.invalid.length === 0,
        invalid: finalResult.invalid,
        needsManualReview: Array.from(manualReviewIndexes),
      };
    },
    [translateWithCache],
  );

  function updateEntry(index, field, value) {
    setEntries((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  }

  function updateValue(index, lang, value) {
    setEntries((prev) => {
      const copy = [...prev];
      const entry = { ...copy[index] };
      entry.values = { ...entry.values, [lang]: value };
      copy[index] = entry;
      return copy;
    });
  }

  async function save(index) {
    const entry = entries[index];
    try {
      const res = await fetch('/api/manual_translations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(entry),
      });
      if (res.status === 429) {
        addToast(
          t('rateLimitExceeded', 'Too many requests, please try again later'),
          'error',
        );
        return;
      }
      if (!res.ok) {
        let message = t('translationSaveFailed', 'Failed to save translation');
        try {
          const data = await res.json();
          if (data?.message) message = data.message;
        } catch {}
        addToast(message, 'error');
        return;
      }
      addToast(t('translationSaved', 'Translation saved'), 'success');
      await refreshEntries();
    } catch {
      addToast(t('translationSaveFailed', 'Failed to save translation'), 'error');
    }
  }

  async function saveLanguage(lang) {
    const pagedIndexes = paged
      .map((entry) => entries.indexOf(entry))
      .filter((index) => index >= 0);
    const resolution = await resolveBaseLanguages(entries);
    const workingEntries = resolution.changed
      ? resolution.correctedEntries
      : entries;

    if (resolution.changed) {
      setEntries(resolution.correctedEntries);
    }

    if (!resolution.success) {
      showBaseLanguageError(resolution.invalid);
      return;
    }
    setSavingLanguage(lang);
    const payload = pagedIndexes
      .map((index) => workingEntries[index])
      .filter((entry) => entry?.key)
      .map((entry) => ({
        key: entry.key,
        type: entry.type,
        values: { [lang]: entry.values[lang] ?? '' },
      }));
    try {
      const res = await fetch('/api/manual_translations/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
      if (res.status === 429) {
        addToast(
          t('rateLimitExceeded', 'Too many requests, please try again later'),
          'error',
        );
        return;
      }
      if (!res.ok) {
        let message = t('languageSaveFailed', 'Failed to save language translations');
        try {
          const data = await res.json();
          if (data?.message) message = data.message;
        } catch {}
        addToast(message, 'error');
        return;
      }
      addToast(t('languageSaved', 'Language translations saved'), 'success');
      await refreshEntries();
    } catch {
      addToast(t('languageSaveFailed', 'Failed to save language translations'), 'error');
    } finally {
      setSavingLanguage(null);
    }
  }

  async function remove(index) {
    const entry = entries[index];
    await fetch(
      `/api/manual_translations?key=${encodeURIComponent(entry.key)}&type=${entry.type}`,
      { method: 'DELETE', credentials: 'include' },
    );
    setEntries((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleExport() {
    try {
      const res = await fetch('/api/translations/export', {
        credentials: 'include',
      });
      if (!res.ok) {
        addToast(
          t('exportTextsFailed', 'Failed to export hardcoded texts'),
          'error',
        );
        return;
      }
      addToast(
        t('exportTextsSuccess', 'Hardcoded texts export started'),
        'success',
      );
    } catch {
      addToast(
        t('exportTextsFailed', 'Failed to export hardcoded texts'),
        'error',
      );
    }
  }

  async function completeAll() {
    if (processingRef.current) return;
    const resolution = await resolveBaseLanguages(entries);
    const manualReviewSet = new Set(resolution.needsManualReview ?? []);
    const workingEntries = resolution.changed
      ? resolution.correctedEntries
      : entries;

    if (resolution.changed) {
      setEntries(resolution.correctedEntries);
    }

    const unresolvedIndexes = (resolution.invalid ?? []).map((item) => item.index);
    const unresolvedHandled =
      unresolvedIndexes.length > 0 &&
      unresolvedIndexes.every((index) => manualReviewSet.has(index));

    if (!resolution.success && !unresolvedHandled) {
      showBaseLanguageError(resolution.invalid);
      return;
    }
    if (manualReviewSet.size) {
      addToast(
        t(
          'baseLanguagesSanitized',
          'Some entries were normalized but still need manual review.',
        ),
        'warning',
      );
    }
    abortRef.current = false;
    processingRef.current = true;
    setCompleting(true);
    const allEntries = [...workingEntries];
    const original = [...allEntries];
    const restLanguages = languages.filter((l) => l !== 'en' && l !== 'mn');
    const updated = [];
    const pending = [];
    const notCompleted = [];
    let saved = false;
    let rateLimited = false;
    for (let idx = 0; idx < allEntries.length; idx++) {
      if (abortRef.current || rateLimited) break;
      setActiveRow(idx);
      setPage(Math.floor(idx / perPage) + 1);
      const entry = allEntries[idx];
      const newEntry = { ...entry, values: { ...entry.values } };
      const entryMetadata = {
        module: newEntry.module,
        context: newEntry.context,
        key: newEntry.key,
      };
      const translateEntry = (targetLang, text) =>
        translateWithCache(targetLang, text, undefined, entryMetadata);
      const en =
        typeof newEntry.values.en === 'string'
          ? newEntry.values.en.trim()
          : String(newEntry.values.en ?? '').trim();
      const mn =
        typeof newEntry.values.mn === 'string'
          ? newEntry.values.mn.trim()
          : String(newEntry.values.mn ?? '').trim();
      let changed = false;
      let needsManualReview = manualReviewSet.has(idx);
      if (!en && mn) {
        try {
          await delay();
          const translated = await translateEntry('en', mn);
          if (translated?.text && !translated.needsRetry) {
            newEntry.values.en = translated.text;
            changed = true;
          } else if (translated?.needsRetry) {
            needsManualReview = true;
          }
        } catch (err) {
          if (err.rateLimited) {
            abortRef.current = true;
            rateLimited = true;
          }
        }
      } else if (!mn && en) {
        try {
          await delay();
          const translated = await translateEntry('mn', en);
          if (translated?.text && !translated.needsRetry) {
            newEntry.values.mn = translated.text;
            changed = true;
          } else if (translated?.needsRetry) {
            needsManualReview = true;
          }
        } catch (err) {
          if (err.rateLimited) {
            abortRef.current = true;
            rateLimited = true;
          }
        }
      }
      const enAfter =
        typeof newEntry.values.en === 'string'
          ? newEntry.values.en.trim()
          : String(newEntry.values.en ?? '').trim();
      const mnAfter =
        typeof newEntry.values.mn === 'string'
          ? newEntry.values.mn.trim()
          : String(newEntry.values.mn ?? '').trim();
      if (enAfter && mnAfter && restLanguages.length) {
        const sourceText = enAfter || mnAfter;
        const missingBefore = restLanguages.filter((l) => {
          const val = newEntry.values[l];
          const trimmed =
            typeof val === 'string' ? val.trim() : String(val ?? '').trim();
          return !trimmed;
        });
        if (missingBefore.length) {
          for (const lang of missingBefore) {
            if (abortRef.current || rateLimited) break;
            try {
              await delay();
              const translated = await translateEntry(lang, sourceText);
              if (translated?.text && !translated.needsRetry) {
                newEntry.values[lang] = translated.text;
                changed = true;
              } else if (translated?.needsRetry) {
                needsManualReview = true;
              }
            } catch (err) {
              if (err.rateLimited) {
                abortRef.current = true;
                rateLimited = true;
              }
            }
          }
          if (abortRef.current || rateLimited) break;
          const missingAfter = restLanguages.filter((l) => {
            const val = newEntry.values[l];
            const trimmed =
              typeof val === 'string' ? val.trim() : String(val ?? '').trim();
            return !trimmed;
          });
          if (missingAfter.length) {
            needsManualReview = true;
          }
        }
      }
      if (changed) {
        pending.push(newEntry);
        saved = true;
      }
      if (needsManualReview) {
        notCompleted.push(newEntry);
      }
      updated.push(newEntry);
      if (
        pending.length &&
        ((idx + 1) % perPage === 0 || idx === allEntries.length - 1)
      ) {
        const res = await fetch('/api/manual_translations/bulk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(pending),
        });
        if (res.status === 429) {
          abortRef.current = true;
          rateLimited = true;
          break;
        }
        pending.length = 0;
      }
    }
    setActiveRow(null);
    const finalEntries = [...updated, ...entries.slice(updated.length)];
    if (abortRef.current) {
      setEntries(original);
      processingRef.current = false;
      setCompleting(false);
      await refreshEntries();
      if (rateLimited) {
        window.dispatchEvent(
          new CustomEvent('toast', {
            detail: {
              message: t('openaiRateLimit', 'OpenAI rate limit exceeded'),
              type: 'error',
            },
          }),
        );
      }
      return;
    }
    setEntries(finalEntries);
    if (rateLimited) {
      processingRef.current = false;
      setCompleting(false);
      window.dispatchEvent(
        new CustomEvent('toast', {
          detail: {
            message: t('openaiRateLimit', 'OpenAI rate limit exceeded'),
            type: 'error',
          },
        }),
      );
      return;
    }
    if (saved) {
      await refreshEntries();
    }
    processingRef.current = false;
    setCompleting(false);
    if (saved) {
      window.dispatchEvent(
        new CustomEvent('toast', {
          detail: {
            message: t('translationsCompleted', 'Translations completed'),
            type: 'success',
          },
        }),
      );
    }
    if (notCompleted.length) {
      window.dispatchEvent(
        new CustomEvent('toast', {
          detail: {
            message: t(
              'translationsIncomplete',
              'Some entries could not be completed',
            ),
            type: 'error',
          },
        }),
      );
    }
  }

  function addRow() {
    const newEntries = [
      ...entries,
      { key: '', type: 'locale', module: '', context: '', values: {} },
    ];
    setEntries(newEntries);
    setPage(Math.ceil(newEntries.length / perPage));
  }

  return (
    <div>
      <div style={{ marginBottom: '0.5rem', display: 'flex', gap: '0.5rem' }}>
        <button type="button" onClick={addRow}>{t('addRow', 'Add Row')}</button>
        <button
          type="button"
          onClick={completeAll}
          disabled={completing}
        >
          {completing
            ? t('completing', 'Completing...')
            : t('completeTranslations', 'Complete translations')}
        </button>
        {completing && (
          <button type="button" onClick={() => (abortRef.current = true)}>
            {t('cancel', 'Cancel')}
          </button>
        )}
        <button type="button" onClick={handleExport}>
          {t('exportHardcodedTexts', 'Export hardcoded texts')}
        </button>
        <input
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder={t('search', 'Search')}
        />
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr>
              <th style={{ border: '1px solid #d1d5db', padding: '0.25rem' }}>Key</th>
              <th style={{ border: '1px solid #d1d5db', padding: '0.25rem' }}>Type</th>
              <th style={{ border: '1px solid #d1d5db', padding: '0.25rem' }}>Module</th>
              <th style={{ border: '1px solid #d1d5db', padding: '0.25rem' }}>Context</th>
              {languages.map((l) => (
                <th key={l} style={{ border: '1px solid #d1d5db', padding: '0.25rem' }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '0.25rem',
                    }}
                  >
                    <span>{l}</span>
                    <button
                      type="button"
                      onClick={() => saveLanguage(l)}
                      disabled={savingLanguage !== null}
                    >
                      {savingLanguage === l
                        ? t('saving', 'Saving...')
                        : t('save', 'Save')}
                    </button>
                  </div>
                </th>
              ))}
              <th style={{ border: '1px solid #d1d5db', padding: '0.25rem' }} />
            </tr>
          </thead>
          <tbody>
            {paged.map((entry) => {
              const entryIdx = entries.indexOf(entry);
              const rowStyle =
                entryIdx === activeRow ? { backgroundColor: '#fef3c7' } : undefined;
              return (
                <tr
                  key={entryIdx}
                  style={rowStyle}
                  ref={entryIdx === activeRow ? activeRowRef : null}
                >
                  <td style={{ border: '1px solid #d1d5db', padding: '0.25rem' }}>
                    <input
                      value={entry.key}
                      onChange={(e) => updateEntry(entryIdx, 'key', e.target.value)}
                    />
                  </td>
                  <td style={{ border: '1px solid #d1d5db', padding: '0.25rem' }}>
                    <select
                      value={entry.type}
                      onChange={(e) => updateEntry(entryIdx, 'type', e.target.value)}
                    >
                      <option value="locale">locale</option>
                      <option value="tooltip">tooltip</option>
                      <option value="exported">exported</option>
                    </select>
                  </td>
                  <td style={{ border: '1px solid #d1d5db', padding: '0.25rem' }}>
                    <div style={{ overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}>
                      {String(entry.module ?? '')}
                    </div>
                  </td>
                  <td style={{ border: '1px solid #d1d5db', padding: '0.25rem' }}>
                    <div style={{ overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}>
                      {String(entry.context ?? '')}
                    </div>
                  </td>
                  {languages.map((l) => (
                    <td key={l} style={{ border: '1px solid #d1d5db', padding: '0.25rem' }}>
                      <textarea
                        value={entry.values[l] || ''}
                        onChange={(e) => updateValue(entryIdx, l, e.target.value)}
                        style={{ width: '100%', overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}
                        rows={2}
                      />
                    </td>
                  ))}
                  <td style={{ border: '1px solid #d1d5db', padding: '0.25rem' }}>
                    <button onClick={() => save(entryIdx)}>{t('save', 'Save')}</button>
                    <button
                      onClick={() => remove(entryIdx)}
                      style={{ marginLeft: '0.25rem' }}
                    >
                      {t('delete', 'Delete')}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div style={{ marginTop: '0.5rem', display: 'flex', alignItems: 'center' }}>
        <button
          onClick={() => setPage(1)}
          disabled={page === 1}
          style={{ marginRight: '0.25rem' }}
        >
          {t('first', 'First')}
        </button>
        <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
          {t('prev', 'Prev')}
        </button>
        <input
          type="number"
          value={page}
          min={1}
          max={totalPages}
          onChange={(e) => {
            const val = Number(e.target.value);
            if (!Number.isNaN(val)) {
              setPage(Math.min(Math.max(1, val), totalPages));
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              const val = Number(e.currentTarget.value);
              if (!Number.isNaN(val)) {
                setPage(Math.min(Math.max(1, val), totalPages));
              }
            }
          }}
          style={{ width: '3rem', margin: '0 0.5rem' }}
        />
        / {totalPages}
        <button
          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          disabled={page === totalPages}
        >
          {t('next', 'Next')}
        </button>
        <button
          onClick={() => setPage(totalPages)}
          disabled={page === totalPages}
          style={{ marginLeft: '0.25rem' }}
        >
          {t('last', 'Last')}
        </button>
        <span style={{ marginLeft: '1rem' }}>{t('perPage', 'Per page')}:</span>
        <input
          type="number"
          value={perPage}
          onChange={(e) => {
            const v = Math.max(1, Number(e.target.value));
            setPerPage(v);
            setPage(1);
          }}
          style={{ width: '4rem', marginLeft: '0.25rem' }}
        />
      </div>
    </div>
  );
}
