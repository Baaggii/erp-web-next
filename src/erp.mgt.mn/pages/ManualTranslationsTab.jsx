import React, { useEffect, useState, useContext } from 'react';
import I18nContext from '../context/I18nContext.jsx';

export default function ManualTranslationsTab() {
  const { t } = useContext(I18nContext);
  const [languages, setLanguages] = useState([]);
  const [entries, setEntries] = useState([]);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    try {
      const res = await fetch('/api/manual_translations', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setLanguages(data.languages);
        setEntries(data.entries);
      }
    } catch {
      // ignore
    }
  }

  const start = (page - 1) * perPage;
  const paged = entries.slice(start, start + perPage);
  const totalPages = Math.max(1, Math.ceil(entries.length / perPage));

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

  function addRow() {
    const newEntries = [...entries, { key: '', type: 'locale', values: {} }];
    setEntries(newEntries);
    setPage(Math.ceil(newEntries.length / perPage));
  }

  return (
    <div>
      <button onClick={addRow} style={{ marginBottom: '0.5rem' }}>
        {t('addRow', 'Add Row')}
      </button>
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
          {paged.map((entry, idx) => (
            <tr key={start + idx}>
              <td style={{ border: '1px solid #d1d5db', padding: '0.25rem' }}>
                <input
                  value={entry.key}
                  onChange={(e) => updateEntry(start + idx, 'key', e.target.value)}
                />
              </td>
              <td style={{ border: '1px solid #d1d5db', padding: '0.25rem' }}>
                <select
                  value={entry.type}
                  onChange={(e) => updateEntry(start + idx, 'type', e.target.value)}
                >
                  <option value="locale">locale</option>
                  <option value="tooltip">tooltip</option>
                </select>
              </td>
              {languages.map((l) => (
                <td key={l} style={{ border: '1px solid #d1d5db', padding: '0.25rem' }}>
                  <input
                    value={entry.values[l] || ''}
                    onChange={(e) => updateValue(start + idx, l, e.target.value)}
                  />
                </td>
              ))}
              <td style={{ border: '1px solid #d1d5db', padding: '0.25rem' }}>
                <button onClick={() => save(start + idx)}>{t('save', 'Save')}</button>
                <button
                  onClick={() => remove(start + idx)}
                  style={{ marginLeft: '0.25rem' }}
                >
                  {t('delete', 'Delete')}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ marginTop: '0.5rem', display: 'flex', alignItems: 'center' }}>
        <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
          {t('prev', 'Prev')}
        </button>
        <span style={{ margin: '0 0.5rem' }}>
          {page} / {totalPages}
        </span>
        <button
          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          disabled={page === totalPages}
        >
          {t('next', 'Next')}
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
