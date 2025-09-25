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
  'locale-file': 'Locale file',
  'cache-node': 'Server cache',
  'cache-localStorage': 'LocalStorage cache',
  'cache-indexedDB': 'IndexedDB cache',
  base: 'Base value',
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
            const languagesList = Array.isArray(data.languages) ? data.languages : [];
            setLanguages(languagesList);
            const normalizedEntries = (data.entries ?? []).map((entry) => {
              const values = { ...(entry.values ?? {}) };
              const translatedBy = { ...(entry.translatedBy ?? {}) };
              for (const lang of languagesList) {
                if (values[lang] == null) values[lang] = '';
                const label = translatedBy[lang];
                translatedBy[lang] =
                  typeof label === 'string' && label.trim() ? label.trim() : '';
              }
              return {
                ...entry,
                module: entry.module ?? '',
                context: entry.context ?? '',
                page: entry.page ?? '',
                pageEditable: entry.pageEditable ?? true,
                values,
                translatedBy,
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
        [lang]: '',
      };
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
    await refreshEntries();
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

  const captureTranslationSource = (lang, source) => {
    if (!lang) return;
    const label = getTranslatorLabel(source);
    setTranslationSources((prev) => [...prev, { lang, label }]);
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
      };
      const entryMetadata = {
        module: newEntry.module,
        context: newEntry.context,
        key: newEntry.key,
        page: newEntry.page,
      };
      const translateEntry = (targetLang, text) =>
        translateWithCache(targetLang, text, undefined, entryMetadata);
      let en =
        typeof newEntry.values.en === 'string'
          ? newEntry.values.en.trim()
          : String(newEntry.values.en ?? '').trim();
      let mn =
        typeof newEntry.values.mn === 'string'
          ? newEntry.values.mn.trim()
          : String(newEntry.values.mn ?? '').trim();
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
      if (!en && mn) {
        try {
          await delay();
          const translated = await translateEntry('en', mn);
          if (translated?.text && !translated.needsRetry) {
            newEntry.values.en = translated.text;
            newEntry.translatedBy.en = getTranslatorLabel(translated.source);
            captureTranslationSource('en', translated.source);
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
            newEntry.translatedBy.mn = getTranslatorLabel(translated.source);
            captureTranslationSource('mn', translated.source);
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
                newEntry.translatedBy[lang] = getTranslatorLabel(translated.source);
                captureTranslationSource(lang, translated.source);
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
      clearTranslationSources();
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
      await refreshEntries();
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              {translationSources.map(({ lang, label }, index) => (
                <div
                  key={`${lang}-${label}-${index}`}
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
                  <span>{label || TRANSLATOR_LABELS.unknown}</span>
                </div>
              ))}
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
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr>
              <th style={{ border: '1px solid #d1d5db', padding: '0.25rem' }}>Key</th>
              <th style={{ border: '1px solid #d1d5db', padding: '0.25rem' }}>Type</th>
              <th style={{ border: '1px solid #d1d5db', padding: '0.25rem' }}>Module</th>
              <th style={{ border: '1px solid #d1d5db', padding: '0.25rem' }}>Context</th>
              <th style={{ border: '1px solid #d1d5db', padding: '0.25rem' }}>
                {t('pageName', 'Page name')}
              </th>
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
              <th style={{ border: '1px solid #d1d5db', padding: '0.25rem' }}>
                {t('translatedBy', 'Translated by')}
              </th>
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
                  <td style={{ border: '1px solid #d1d5db', padding: '0.25rem' }}>
                    <input
                      value={entry.page ?? ''}
                      onChange={(e) => updateEntry(entryIdx, 'page', e.target.value)}
                      readOnly={entry.pageEditable === false}
                      style={{ width: '100%' }}
                    />
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
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                      {languages.map((l) => {
                        const rawLabel = entry.translatedBy?.[l];
                        const displayLabel =
                          typeof rawLabel === 'string' && rawLabel.trim()
                            ? rawLabel.trim()
                            : '';
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
