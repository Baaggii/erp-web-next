import React, { useEffect, useState, useContext, useRef } from 'react';
import I18nContext from '../context/I18nContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import translateWithCache from '../utils/translateWithCache.js';

const delay = () => new Promise((r) => setTimeout(r, 200));

export default function ManualTranslationsTab() {
  const { t } = useContext(I18nContext);
  const { addToast } = useToast();
  const [languages, setLanguages] = useState([]);
  const [entries, setEntries] = useState([]);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const [searchTerm, setSearchTerm] = useState('');
  const [completingEnMn, setCompletingEnMn] = useState(false);
  const [completingOther, setCompletingOther] = useState(false);
  const [activeRow, setActiveRow] = useState(null);
  const abortRef = useRef(false);
  const processingRef = useRef(false);
  const activeRowRef = useRef(null);

  useEffect(() => {
    load();
  }, []);

  async function load(retry = 0) {
    try {
      const res = await fetch('/api/manual_translations', { credentials: 'include' });
      if (res.status === 429) {
        window.dispatchEvent(
          new CustomEvent('toast', {
            detail: {
              message: t('rateLimitExceeded', 'Too many requests, please try again later'),
              type: 'error',
            },
          }),
        );
        if (retry < 3) {
          const wait = 500 * 2 ** retry;
          setTimeout(() => load(retry + 1), wait);
        }
        return;
      }
      if (res.ok) {
        const data = await res.json();
        setLanguages(data.languages);
        setEntries(data.entries);
      }
    } catch {
      // ignore
    }
  }

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
    if (entry.key.toLowerCase().includes(term)) return true;
    return Object.values(entry.values).some((v) => String(v ?? '').toLowerCase().includes(term));
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
      copy[index] = entry;
      return copy;
    });
  }

  async function save(index) {
    const entry = entries[index];
    await fetch('/api/manual_translations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(entry),
    });
    await load();
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

  async function completeEnMn() {
    if (processingRef.current) return;
    abortRef.current = false;
    processingRef.current = true;
    setCompletingEnMn(true);
    const allEntries = [...entries];
    const original = [...allEntries];
    const updated = [];
    const pending = [];
    let saved = false;
    let rateLimited = false;
    for (let idx = 0; idx < allEntries.length; idx++) {
      if (abortRef.current || rateLimited) break;
      setActiveRow(idx);
      setPage(Math.floor(idx / perPage) + 1);
      const entry = allEntries[idx];
      const newEntry = { ...entry, values: { ...entry.values } };
      const en =
        typeof newEntry.values.en === 'string'
          ? newEntry.values.en.trim()
          : String(newEntry.values.en ?? '').trim();
      const mn =
        typeof newEntry.values.mn === 'string'
          ? newEntry.values.mn.trim()
          : String(newEntry.values.mn ?? '').trim();
      if (!en && mn) {
        try {
          await delay();
          const translated = await translateWithCache('en', mn);
          if (translated) {
            newEntry.values.en = translated;
            pending.push(newEntry);
            saved = true;
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
          const translated = await translateWithCache('mn', en);
          if (translated) {
            newEntry.values.mn = translated;
            pending.push(newEntry);
            saved = true;
          }
        } catch (err) {
          if (err.rateLimited) {
            abortRef.current = true;
            rateLimited = true;
          }
        }
      }
      updated.push(newEntry);
      if (
        pending.length &&
        ((idx + 1) % perPage === 0 || idx === allEntries.length - 1)
      ) {
        await fetch('/api/manual_translations/bulk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(pending),
        });
        pending.length = 0;
      }
    }
    setActiveRow(null);
    const finalEntries = [...updated, ...entries.slice(updated.length)];
    if (abortRef.current) {
      setEntries(original);
      processingRef.current = false;
      setCompletingEnMn(false);
      await load();
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
      setCompletingEnMn(false);
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
      await load();
    }
    processingRef.current = false;
    setCompletingEnMn(false);
    window.dispatchEvent(
      new CustomEvent('toast', {
        detail: { message: t('translationsCompleted', 'Translations completed'), type: 'success' },
      }),
    );
  }

  async function completeOtherLanguages() {
    if (processingRef.current) return;
    abortRef.current = false;
    processingRef.current = true;
    setCompletingOther(true);
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
      const newEntry = { ...entry, values: { ...entry.values } };
      const sourceText =
        (typeof newEntry.values.en === 'string'
          ? newEntry.values.en.trim()
          : String(newEntry.values.en ?? '').trim()) ||
        (typeof newEntry.values.mn === 'string'
          ? newEntry.values.mn.trim()
          : String(newEntry.values.mn ?? '').trim());
      const missingBefore = restLanguages.filter((l) => {
        const val = newEntry.values[l];
        const trimmed =
          typeof val === 'string' ? val.trim() : String(val ?? '').trim();
        return !trimmed;
      });
      let changed = false;
      if (missingBefore.length && sourceText) {
        for (const lang of missingBefore) {
          if (abortRef.current || rateLimited) break;
          try {
            await delay();
            const translated = await translateWithCache(lang, sourceText);
            if (translated) {
              newEntry.values[lang] = translated;
              changed = true;
            }
          } catch (err) {
            if (err.rateLimited) {
              abortRef.current = true;
              rateLimited = true;
            }
          }
        }
        if (abortRef.current || rateLimited) break;
      }
      const missingAfter = restLanguages.filter((l) => {
        const val = newEntry.values[l];
        const trimmed =
          typeof val === 'string' ? val.trim() : String(val ?? '').trim();
        return !trimmed;
      });
      if (missingBefore.length && missingAfter.length) {
        notCompleted.push(newEntry);
      }
      if (changed) {
        pending.push(newEntry);
        saved = true;
      }
      updated.push(newEntry);
      if (
        pending.length &&
        ((idx + 1) % perPage === 0 || idx === allEntries.length - 1)
      ) {
        await fetch('/api/manual_translations/bulk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(pending),
        });
        pending.length = 0;
      }
    }
    setActiveRow(null);
    const finalEntries = [...updated, ...entries.slice(updated.length)];
    if (abortRef.current) {
      setEntries(original);
      processingRef.current = false;
      setCompletingOther(false);
      await load();
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
      setCompletingOther(false);
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
      await load();
    }
    processingRef.current = false;
    setCompletingOther(false);
    if (saved) {
      window.dispatchEvent(
        new CustomEvent('toast', {
          detail: { message: t('translationsCompleted', 'Translations completed'), type: 'success' },
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
    const newEntries = [...entries, { key: '', type: 'locale', values: {} }];
    setEntries(newEntries);
    setPage(Math.ceil(newEntries.length / perPage));
  }

  return (
    <div>
      <div style={{ marginBottom: '0.5rem', display: 'flex', gap: '0.5rem' }}>
        <button type="button" onClick={addRow}>{t('addRow', 'Add Row')}</button>
        <button
          type="button"
          onClick={completeEnMn}
          disabled={completingEnMn || completingOther}
        >
          {completingEnMn
            ? t('completing', 'Completing...')
            : t('completeEnMn', 'Complete en/mn translations')}
        </button>
        <button
          type="button"
          onClick={completeOtherLanguages}
          disabled={completingEnMn || completingOther}
        >
          {completingOther
            ? t('completing', 'Completing...')
            : t('completeOtherLangs', 'Complete other languages translations')}
        </button>
        {(completingEnMn || completingOther) && (
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
      <table style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead>
          <tr>
            <th style={{ border: '1px solid #d1d5db', padding: '0.25rem' }}>Key</th>
            <th style={{ border: '1px solid #d1d5db', padding: '0.25rem' }}>Type</th>
            {languages.map((l) => (
              <th key={l} style={{ border: '1px solid #d1d5db', padding: '0.25rem' }}>
                {l}
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
                {languages.map((l) => (
                  <td key={l} style={{ border: '1px solid #d1d5db', padding: '0.25rem' }}>
                    <input
                      value={entry.values[l] || ''}
                      onChange={(e) => updateValue(entryIdx, l, e.target.value)}
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
