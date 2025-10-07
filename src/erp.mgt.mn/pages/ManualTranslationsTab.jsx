import React, { useEffect, useState, useContext, useRef, useCallback } from 'react';
import I18nContext from '../context/I18nContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import translateWithCache from '../utils/translateWithCache.js';
import detectLocaleFromText from '../utils/detectLocaleFromText.js';

const delay = () => new Promise((r) => setTimeout(r, 200));
const RATE_LIMIT_MAX_RETRIES = 3;
const RATE_LIMIT_BASE_DELAY = 500;
const RATE_LIMIT_MAX_DELAY = 5000;

const TRANSLATOR_LABELS = {
  ai: 'OpenAI',
  openai: 'OpenAI',
  'locale-file': 'Locale file',
  'manual-entry': 'Manual entry',
  'cache-node': 'Server cache',
  'cache-localStorage': 'LocalStorage cache',
  'cache-indexedDB': 'IndexedDB cache',
  base: 'Base value',
  google: 'Google',
  'google-translate': 'Google Translate',
  'fallback-error': 'Fallback (error)',
  'fallback-missing': 'Fallback (missing)',
  'fallback-validation': 'Fallback (validation)',
  unknown: 'Unknown source',
};

function getTranslatorLabel(source) {
  if (typeof source !== 'string' || !source) {
    return TRANSLATOR_LABELS.unknown;
  }
  if (Object.prototype.hasOwnProperty.call(TRANSLATOR_LABELS, source)) {
    return TRANSLATOR_LABELS[source];
  }
  const fallback = source
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
  return fallback || TRANSLATOR_LABELS.unknown;
}

const MANUAL_ENTRY_PROVIDER = 'manual-entry';

function normalizeProvider(provider) {
  if (typeof provider !== 'string') {
    return '';
  }
  const trimmed = provider.trim();
  if (!trimmed) {
    return '';
  }
  const lower = trimmed.toLowerCase();
  if (lower === 'manual entry' || lower === 'manual-entry') {
    return MANUAL_ENTRY_PROVIDER;
  }
  return trimmed;
}

function normalizeOrigin(origin) {
  if (typeof origin !== 'string') {
    return '';
  }
  const trimmed = origin.trim();
  if (!trimmed) {
    return '';
  }
  const lower = trimmed.toLowerCase();
  if (lower === 'locale file' || lower === 'locale-file' || lower === 'locale') {
    return 'locale-file';
  }
  if (lower === 'tooltip file' || lower === 'tooltip-file' || lower === 'tooltip') {
    return 'tooltip-file';
  }
  return trimmed;
}

function formatTranslationSource(origin, provider) {
  const normalizedOrigin = normalizeOrigin(origin);
  const normalizedProvider = normalizeProvider(provider);
  const originLabel = normalizedOrigin ? getTranslatorLabel(normalizedOrigin) : '';
  const providerLabel = normalizedProvider ? getTranslatorLabel(normalizedProvider) : '';
  if (originLabel && providerLabel) {
    if (originLabel === providerLabel) {
      return originLabel;
    }
    return `${originLabel} – ${providerLabel}`;
  }
  if (originLabel) {
    return originLabel;
  }
  if (providerLabel) {
    return providerLabel;
  }
  return TRANSLATOR_LABELS.unknown;
}

const BASE_COLUMN_KEYS = [
  'key',
  'type',
  'module',
  'context',
  'page',
  'translatedBy',
  'actions',
];
const MIN_COLUMN_WIDTH = 80;

function getLanguageColumnKey(lang) {
  return `lang:${lang}`;
}

function normalizeEnMnPair(en, mn) {
  let normalizedEn = en;
  let normalizedMn = mn;

  const enLocale = detectLocaleFromText(en);
  const mnLocale = detectLocaleFromText(mn);

  if (normalizedEn && normalizedMn) {
    if (enLocale === 'mn' && mnLocale === 'en') {
      normalizedEn = mn;
      normalizedMn = en;
    } else if (enLocale === 'mn' && mnLocale !== 'en') {
      normalizedMn = mnLocale === 'mn' ? normalizedMn : normalizedEn;
      normalizedEn = '';
    } else if (mnLocale === 'en' && enLocale !== 'mn') {
      normalizedEn = enLocale === 'en' ? normalizedEn : normalizedMn;
      normalizedMn = '';
    }
  } else if (normalizedEn && !normalizedMn) {
    if (enLocale === 'mn') {
      normalizedEn = '';
      normalizedMn = en;
    }
  } else if (!normalizedEn && normalizedMn) {
    if (mnLocale === 'en') {
      normalizedEn = mn;
      normalizedMn = '';
    }
  }

  return { en: normalizedEn, mn: normalizedMn };
}

function toTrimmedString(value) {
  if (typeof value === 'string') {
    return value.trim();
  }
  if (value === null || value === undefined) {
    return '';
  }
  return String(value).trim();
}

const NUMERIC_OR_SYMBOLS_ONLY_REGEX = /^[\p{P}\p{S}\d\s]+$/u;

function isMeaningfulText(value) {
  const trimmed = toTrimmedString(value);
  if (!trimmed) {
    return false;
  }
  return !NUMERIC_OR_SYMBOLS_ONLY_REGEX.test(trimmed);
}

function getMeaningfulTranslationSource(entry, languages = []) {
  if (!entry) {
    return null;
  }

  const values = entry.values ?? {};
  const preferredOrder = [];
  const seen = new Set();

  const addLang = (lang) => {
    if (!lang) return;
    if (seen.has(lang)) return;
    seen.add(lang);
    preferredOrder.push(lang);
  };

  addLang('en');
  addLang('mn');
  for (const lang of languages) {
    addLang(lang);
  }
  for (const lang of Object.keys(values)) {
    addLang(lang);
  }

  for (const lang of preferredOrder) {
    const text = toTrimmedString(values[lang]);
    if (isMeaningfulText(text)) {
      return { field: lang, text };
    }
  }

  const keyText = toTrimmedString(entry.key);
  if (isMeaningfulText(keyText)) {
    return { field: 'key', text: keyText };
  }

  const moduleText = toTrimmedString(entry.module);
  if (isMeaningfulText(moduleText)) {
    return { field: 'module', text: moduleText };
  }

  const contextText = toTrimmedString(entry.context);
  if (isMeaningfulText(contextText)) {
    return { field: 'context', text: contextText };
  }

  return null;
}

function getProviderGridStyle(count) {
  const columnCount = Math.min(Math.max(count, 1), 3);
  return {
    display: 'grid',
    gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))`,
    gap: '0.5rem',
  };
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
  const [translationSources, setTranslationSources] = useState([]);
  const [columnWidths, setColumnWidths] = useState({});
  const abortRef = useRef(false);
  const processingRef = useRef(false);
  const activeRowRef = useRef(null);
  const columnWidthsRef = useRef(columnWidths);
  const loadStateRef = useRef({
    promise: null,
    retryCount: 0,
    timeoutId: null,
    cooldown: false,
    notified: false,
  });

  const load = useCallback(
    async function runLoad({ ignoreCooldown = false, queue = false } = {}) {
      const state = loadStateRef.current;
      if (queue && state.promise) {
        // A request is already in-flight; wait for it to settle before queuing
        // the next load so we always fetch fresh data after the current one.
        const currentPromise = state.promise;
        try {
          await currentPromise;
        } catch {
          // ignore
        } finally {
          if (state.promise === currentPromise) {
            state.promise = null;
          }
        }
        return runLoad({ ignoreCooldown, queue: false });
      }
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
            const languagesList = Array.isArray(data.languages) ? data.languages : [];
            setLanguages(languagesList);
            const normalizedEntries = (data.entries ?? []).map((entry) => {
              const values = { ...(entry.values ?? {}) };
              const translatedBy = { ...(entry.translatedBy ?? {}) };
              const translatedBySources = { ...(entry.translatedBySources ?? {}) };
              for (const lang of languagesList) {
                if (values[lang] == null) values[lang] = '';
                translatedBy[lang] = normalizeProvider(translatedBy[lang]);
                const normalizedOrigin = normalizeOrigin(translatedBySources[lang]);
                const fallbackOrigin = normalizeOrigin(entry.type) || toTrimmedString(entry.type);
                translatedBySources[lang] = normalizedOrigin || fallbackOrigin || 'unknown';
              }
              return {
                ...entry,
                module: entry.module ?? '',
                context: entry.context ?? '',
                page: entry.page ?? '',
                pageEditable: entry.pageEditable ?? true,
                values,
                translatedBy,
                translatedBySources,
              };
            });
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
    ({ force = false } = {}) => {
      if (force) {
        const state = loadStateRef.current;
        if (state.timeoutId) {
          clearTimeout(state.timeoutId);
          state.timeoutId = null;
        }
        state.cooldown = false;
      }
      return load({ ignoreCooldown: force, queue: true });
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
    columnWidthsRef.current = columnWidths;
  }, [columnWidths]);

  useEffect(() => {
    setColumnWidths((prev) => {
      const allowedKeys = new Set([
        ...BASE_COLUMN_KEYS,
        ...languages.map((lang) => getLanguageColumnKey(lang)),
      ]);

      const next = {};
      let changed = false;

      for (const [key, value] of Object.entries(prev)) {
        if (allowedKeys.has(key)) {
          next[key] = value;
        } else {
          changed = true;
        }
      }

      if (!changed && Object.keys(prev).length === Object.keys(next).length) {
        return prev;
      }

      return next;
    });
  }, [languages]);

  const getColumnWidth = useCallback(
    (columnKey) => {
      const width = columnWidths[columnKey];
      if (typeof width === 'number' && !Number.isNaN(width)) {
        return width;
      }
      return undefined;
    },
    [columnWidths],
  );

  const getColumnWidthStyle = useCallback(
    (columnKey) => {
      const width = getColumnWidth(columnKey);
      if (typeof width === 'number') {
        return { width, minWidth: width };
      }
      return { width: 'auto', minWidth: 0 };
    },
    [getColumnWidth],
  );

  const handleResizeStart = useCallback(
    (event, columnKey) => {
      event.preventDefault();
      event.stopPropagation();

      const pointerId = event.pointerId ?? null;
      const target = event.currentTarget;
      const th = target.closest('th');
      const measuredWidth = th ? th.getBoundingClientRect().width : null;
      const storedWidth = columnWidthsRef.current[columnKey];
      const initialWidth =
        typeof measuredWidth === 'number' && !Number.isNaN(measuredWidth)
          ? measuredWidth
          : typeof storedWidth === 'number' && !Number.isNaN(storedWidth)
            ? storedWidth
            : MIN_COLUMN_WIDTH;
      const startX = event.clientX;

      const onPointerMove = (moveEvent) => {
        if (pointerId != null && moveEvent.pointerId != null && moveEvent.pointerId !== pointerId) {
          return;
        }
        const delta = moveEvent.clientX - startX;
        const newWidth = Math.max(MIN_COLUMN_WIDTH, initialWidth + delta);
        setColumnWidths((prev) => {
          const current = prev[columnKey];
          if (typeof current === 'number' && Math.abs(current - newWidth) < 0.5) {
            return prev;
          }
          return {
            ...prev,
            [columnKey]: newWidth,
          };
        });
      };

      const cleanup = () => {
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUp);
        window.removeEventListener('pointercancel', onPointerUp);
        if (typeof target.releasePointerCapture === 'function' && pointerId != null) {
          try {
            target.releasePointerCapture(pointerId);
          } catch {
            // ignore release errors
          }
        }
      };

      const onPointerUp = (endEvent) => {
        if (pointerId != null && endEvent.pointerId != null && endEvent.pointerId !== pointerId) {
          return;
        }
        cleanup();
      };

      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
      window.addEventListener('pointercancel', onPointerUp);

      if (typeof target.setPointerCapture === 'function' && pointerId != null) {
        try {
          target.setPointerCapture(pointerId);
        } catch {
          // ignore capture errors
        }
      }
    },
    [setColumnWidths],
  );

  const renderResizeHandle = useCallback(
    (columnKey) => (
      <div
        role="separator"
        aria-orientation="vertical"
        onPointerDown={(event) => handleResizeStart(event, columnKey)}
        style={{
          position: 'absolute',
          top: 0,
          right: -4,
          width: 8,
          height: '100%',
          cursor: 'col-resize',
          userSelect: 'none',
          touchAction: 'none',
          zIndex: 1,
        }}
      />
    ),
    [handleResizeStart],
  );

  const getHeaderStyle = useCallback(() => {
    return {
      border: '1px solid #d1d5db',
      padding: '0.25rem',
      paddingRight: '0.75rem',
      position: 'relative',
      width: 'auto',
      textAlign: 'left',
      verticalAlign: 'top',
    };
  }, []);

  const getCellStyle = useCallback(() => {
    return {
      border: '1px solid #d1d5db',
      padding: '0.25rem',
      width: 'auto',
      verticalAlign: 'top',
      textAlign: 'left',
    };
  }, []);

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
    if (String(entry.page ?? '').toLowerCase().includes(term)) return true;
    return Object.values(entry.values ?? {}).some((v) =>
      String(v ?? '').toLowerCase().includes(term),
    );
  });

  const start = (page - 1) * perPage;
  const paged = filteredEntries.slice(start, start + perPage);
  const totalPages = Math.max(1, Math.ceil(filteredEntries.length / perPage));

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
      entry.translatedBy = {
        ...(entry.translatedBy ?? {}),
        [lang]: MANUAL_ENTRY_PROVIDER,
      };
      const fallbackOrigin = normalizeOrigin(entry.type) || toTrimmedString(entry.type);
      if (entry.translatedBySources) {
        const existingOrigin = entry.translatedBySources[lang];
        const normalizedExisting = normalizeOrigin(existingOrigin);
        entry.translatedBySources = {
          ...entry.translatedBySources,
          [lang]: normalizedExisting || fallbackOrigin || entry.translatedBySources[lang] || 'unknown',
        };
      } else {
        entry.translatedBySources = {
          [lang]: fallbackOrigin || 'unknown',
        };
      }
      copy[index] = entry;
      return copy;
    });
  }

  async function save(index) {
    const entry = entries[index];
    const payload = {
      ...entry,
      page: entry.page ?? '',
      translatedBy: entry.translatedBy ?? {},
    };
    await fetch('/api/manual_translations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload),
    });
    await refreshEntries({ force: true });
  }

  async function saveLanguage(lang) {
    setSavingLanguage(lang);
    const payload = paged
      .filter((e) => e.key)
      .map((e) => ({
        key: e.key,
        type: e.type,
        page: e.page ?? '',
        values: { [lang]: e.values[lang] ?? '' },
        translatedBy: { [lang]: e.translatedBy?.[lang] ?? '' },
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
        addToast(
          t('languageSaveFailed', 'Failed to save language translations'),
          'error',
        );
        return;
      }
      addToast(t('languageSaved', 'Language translations saved'), 'success');
      await refreshEntries({ force: true });
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

  const captureTranslationSource = (lang, provider, origin) => {
    if (!lang) return;
    const normalizedProvider = normalizeProvider(provider);
    const normalizedOrigin = normalizeOrigin(origin);
    setTranslationSources((prev) => [
      ...prev,
      { lang, provider: normalizedProvider, origin: normalizedOrigin },
    ]);
  };

  const clearTranslationSources = () => {
    setTranslationSources([]);
  };

  async function completeAll() {
    if (processingRef.current) return;
    abortRef.current = false;
    processingRef.current = true;
    setCompleting(true);
    clearTranslationSources();
    const allEntries = [...entries];
    const original = [...allEntries];
    const restLanguages = languages.filter((l) => l !== 'en' && l !== 'mn');
    const languageSet = new Set(languages);
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
      const newEntry = {
        ...entry,
        values: { ...entry.values },
        translatedBy: { ...(entry.translatedBy ?? {}) },
        translatedBySources: { ...(entry.translatedBySources ?? {}) },
      };
      const entryMetadata = {
        module: newEntry.module,
        context: newEntry.context,
        key: newEntry.key,
        page: newEntry.page,
        type: newEntry.type,
      };
      const translateEntry = (targetLang, text, sourceLang) => {
        if (!text) return null;
        const metadata = sourceLang
          ? { ...entryMetadata, sourceLang }
          : entryMetadata;
        return translateWithCache(targetLang, text, undefined, metadata);
      };
      let en = toTrimmedString(newEntry.values.en);
      let mn = toTrimmedString(newEntry.values.mn);
      let changed = false;
      let needsManualReview = false;
      const normalized = normalizeEnMnPair(en, mn);
      if (normalized.en !== en) {
        newEntry.values.en = normalized.en;
        en = normalized.en;
        changed = true;
      }
      if (normalized.mn !== mn) {
        newEntry.values.mn = normalized.mn;
        mn = normalized.mn;
        changed = true;
      }
      en = toTrimmedString(newEntry.values.en);
      mn = toTrimmedString(newEntry.values.mn);

      const hasMeaningfulEn = isMeaningfulText(en);
      const hasMeaningfulMn = isMeaningfulText(mn);

      const attemptTranslation = async (targetLang, preferredSource) => {
        if (abortRef.current || rateLimited) {
          return false;
        }
        let sourceInfo = preferredSource ?? null;
        if (newEntry.type === 'tooltip' && targetLang !== 'en') {
          const englishText = toTrimmedString(newEntry.values.en);
          if (!isMeaningfulText(englishText)) {
            needsManualReview = true;
            return false;
          }
          if (!sourceInfo || sourceInfo.field !== 'en') {
            sourceInfo = { field: 'en', text: englishText };
          }
        }
        if (!sourceInfo) {
          sourceInfo = getMeaningfulTranslationSource(newEntry, languages);
        }
        if (!sourceInfo || !isMeaningfulText(sourceInfo.text)) {
          needsManualReview = true;
          return false;
        }
        try {
          if (!isMeaningfulText(sourceInfo.text)) {
            needsManualReview = true;
            return false;
          }
          await delay();
          const sourceLang =
            sourceInfo.field && languageSet.has(sourceInfo.field)
              ? sourceInfo.field
              : null;
          const translated = await translateEntry(
            targetLang,
            sourceInfo.text,
            sourceLang,
          );
          if (translated?.text && !translated.needsRetry) {
            newEntry.values[targetLang] = translated.text;
            const provider = normalizeProvider(translated.source);
            const origin = normalizeOrigin(
              newEntry.translatedBySources?.[targetLang] ?? newEntry.type,
            );
            newEntry.translatedBy[targetLang] = provider;
            newEntry.translatedBySources[targetLang] = origin;
            captureTranslationSource(targetLang, provider, origin);
            changed = true;
            return true;
          }
          if (translated?.needsRetry) {
            needsManualReview = true;
          }
        } catch (err) {
          if (err.rateLimited) {
            abortRef.current = true;
            rateLimited = true;
          }
        }
        return false;
      };

      if (!hasMeaningfulEn) {
        const translated = await attemptTranslation('en');
        if (translated) {
          en = toTrimmedString(newEntry.values.en);
        }
      }

      if (!hasMeaningfulMn) {
        const translated = await attemptTranslation('mn');
        if (translated) {
          mn = toTrimmedString(newEntry.values.mn);
        }
      }

      if (restLanguages.length) {
        const missingBefore = restLanguages.filter(
          (lang) => !isMeaningfulText(newEntry.values[lang]),
        );
        if (missingBefore.length) {
          const englishSource = isMeaningfulText(en)
            ? { field: 'en', text: en }
            : null;
          for (const lang of missingBefore) {
            if (abortRef.current || rateLimited) break;
            await attemptTranslation(lang, englishSource);
          }
          if (abortRef.current || rateLimited) break;
          const missingAfter = restLanguages.filter(
            (lang) => !isMeaningfulText(newEntry.values[lang]),
          );
          if (missingAfter.length) {
            needsManualReview = true;
          }
        }
      }
      if (changed) {
        const { translatedBySources: _ignoredSources, ...restEntry } = newEntry;
        pending.push({
          ...restEntry,
          translatedBy: { ...(newEntry.translatedBy ?? {}) },
        });
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
      clearTranslationSources();
      await refreshEntries({ force: true });
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
      clearTranslationSources();
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
      await refreshEntries({ force: true });
    }
    processingRef.current = false;
    setCompleting(false);
    clearTranslationSources();
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
      {
        key: '',
        type: 'locale',
        module: '',
        context: '',
        page: '',
        pageEditable: true,
        values: {},
        translatedBy: Object.fromEntries(languages.map((lang) => [lang, ''])),
        translatedBySources: Object.fromEntries(languages.map((lang) => [lang, ''])),
      },
    ];
    setEntries(newEntries);
    setPage(Math.ceil(newEntries.length / perPage));
  }

  return (
    <div>
      {completing && (
        <div
          style={{
            position: 'fixed',
            bottom: '1rem',
            right: '1rem',
            backgroundColor: '#111827',
            color: '#f9fafb',
            padding: '0.75rem 1rem',
            borderRadius: '0.5rem',
            boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
            maxWidth: '24rem',
            maxHeight: '16rem',
            overflowY: 'auto',
            zIndex: 1000,
            fontSize: '0.875rem',
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: '0.5rem' }}>
            {t('translationProgress', 'Translation progress')}
          </div>
          {translationSources.length ? (
            <div style={getProviderGridStyle(translationSources.length)}>
              {translationSources.map(({ lang, origin, provider }, index) => {
                const displayLabel = formatTranslationSource(origin, provider);
                return (
                  <div
                    key={`${lang}-${origin}-${provider}-${index}`}
                    style={{
                      backgroundColor: '#1f2937',
                      borderRadius: '0.375rem',
                      padding: '0.25rem 0.5rem',
                      wordBreak: 'break-word',
                    }}
                  >
                    <span style={{ fontWeight: 600, marginRight: '0.25rem' }}>
                      {(lang || '').toUpperCase()}
                    </span>
                    <span>{displayLabel || TRANSLATOR_LABELS.unknown}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ color: '#d1d5db' }}>
              {t('waitingForTranslations', 'Waiting for translations...')}
            </div>
          )}
        </div>
      )}
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
      <div style={{ overflowX: 'hidden' }}>
        <table
          style={{ borderCollapse: 'collapse', width: '100%', tableLayout: 'fixed' }}
        >
          <colgroup>
            <col style={getColumnWidthStyle('key')} />
            <col style={getColumnWidthStyle('type')} />
            <col style={getColumnWidthStyle('module')} />
            <col style={getColumnWidthStyle('context')} />
            <col style={getColumnWidthStyle('page')} />
            {languages.map((l) => {
              const columnKey = getLanguageColumnKey(l);
              return <col key={columnKey} style={getColumnWidthStyle(columnKey)} />;
            })}
            <col style={getColumnWidthStyle('translatedBy')} />
            <col style={getColumnWidthStyle('actions')} />
          </colgroup>
          <thead>
            <tr>
              <th style={getHeaderStyle()}>
                Key
                {renderResizeHandle('key')}
              </th>
              <th style={getHeaderStyle()}>
                Type
                {renderResizeHandle('type')}
              </th>
              <th style={getHeaderStyle()}>
                Module
                {renderResizeHandle('module')}
              </th>
              <th style={getHeaderStyle()}>
                Context
                {renderResizeHandle('context')}
              </th>
              <th style={getHeaderStyle()}>
                {t('pageName', 'Page name')}
                {renderResizeHandle('page')}
              </th>
              {languages.map((l) => {
                const columnKey = getLanguageColumnKey(l);
                return (
                  <th key={l} style={getHeaderStyle()}>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '0.25rem',
                        width: '100%',
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
                    {renderResizeHandle(columnKey)}
                  </th>
                );
              })}
              <th style={getHeaderStyle()}>
                {t('translatedBy', 'Translated by')}
                {renderResizeHandle('translatedBy')}
              </th>
              <th style={getHeaderStyle()}>
                <span aria-hidden="true">&nbsp;</span>
                {renderResizeHandle('actions')}
              </th>
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
                  <td style={getCellStyle()}>
                    <input
                      value={entry.key}
                      onChange={(e) => updateEntry(entryIdx, 'key', e.target.value)}
                      style={{ width: '100%' }}
                    />
                  </td>
                  <td style={getCellStyle()}>
                    <select
                      value={entry.type}
                      onChange={(e) => updateEntry(entryIdx, 'type', e.target.value)}
                      style={{ width: '100%' }}
                    >
                      <option value="locale">locale</option>
                      <option value="tooltip">tooltip</option>
                      <option value="exported">exported</option>
                    </select>
                  </td>
                  <td style={getCellStyle()}>
                    <div
                      style={{
                        overflowWrap: 'anywhere',
                        whiteSpace: 'pre-wrap',
                        width: '100%',
                      }}
                    >
                      {String(entry.module ?? '')}
                    </div>
                  </td>
                  <td style={getCellStyle()}>
                    <div
                      style={{
                        overflowWrap: 'anywhere',
                        whiteSpace: 'pre-wrap',
                        width: '100%',
                      }}
                    >
                      {String(entry.context ?? '')}
                    </div>
                  </td>
                  <td style={getCellStyle()}>
                    <input
                      value={entry.page ?? ''}
                      onChange={(e) => updateEntry(entryIdx, 'page', e.target.value)}
                      readOnly={entry.pageEditable === false}
                      style={{ width: '100%' }}
                    />
                  </td>
                  {languages.map((l) => {
                    const columnKey = getLanguageColumnKey(l);
                    return (
                      <td key={l} style={getCellStyle()}>
                        <textarea
                          value={entry.values[l] || ''}
                          onChange={(e) => updateValue(entryIdx, l, e.target.value)}
                          style={{
                            width: '100%',
                            overflowWrap: 'anywhere',
                            whiteSpace: 'pre-wrap',
                            display: 'block',
                          }}
                          rows={2}
                        />
                      </td>
                    );
                  })}
                  <td style={getCellStyle()}>
                    <div style={getProviderGridStyle(languages.length)}>
                      {languages.map((l) => {
                        const provider = entry.translatedBy?.[l];
                        const origin = entry.translatedBySources?.[l] || entry.type;
                        const displayLabel = formatTranslationSource(origin, provider);
                        return (
                          <div key={l} style={{ color: displayLabel ? '#111827' : '#6b7280' }}>
                            <span style={{ fontWeight: 600, marginRight: '0.25rem' }}>
                              {l.toUpperCase()}
                            </span>
                            <span>{displayLabel || '—'}</span>
                          </div>
                        );
                      })}
                    </div>
                  </td>
                  <td style={{ ...getCellStyle(), whiteSpace: 'nowrap' }}>
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
