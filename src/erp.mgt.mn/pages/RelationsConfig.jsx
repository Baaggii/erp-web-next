import React, { useEffect, useState, useContext } from 'react';
import { useToast } from '../context/ToastContext.jsx';
import { AuthContext } from '../context/AuthContext.jsx';
import TableRelationsEditor from '../components/TableRelationsEditor.jsx';

export default function RelationsConfig() {
  const { addToast } = useToast();
  const { company } = useContext(AuthContext);
  const [tables, setTables] = useState([]);
  const [table, setTable] = useState('');
  const [columns, setColumns] = useState([]);
  const [idField, setIdField] = useState('');
  const [displayFields, setDisplayFields] = useState([]);
  const [isDefault, setIsDefault] = useState(false);
  const [activeTab, setActiveTab] = useState('display');

  useEffect(() => {
    fetch('/api/tables', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setTables(data))
      .catch(() => setTables([]));
  }, []);

  useEffect(() => {
    if (!table) return;
    fetch(`/api/tables/${encodeURIComponent(table)}/columns`, {
      credentials: 'include',
    })
      .then((res) => (res.ok ? res.json() : []))
      .then((cols) => setColumns(cols.map((c) => c.name || c)))
      .catch(() => setColumns([]));
    fetch(`/api/display_fields?table=${encodeURIComponent(table)}`, {
      credentials: 'include',
    })
      .then((res) =>
        res.ok
          ? res.json()
          : { idField: '', displayFields: [], isDefault: true },
      )
      .then((cfg) => {
        setIdField(cfg.idField || '');
        setDisplayFields(cfg.displayFields || []);
        setIsDefault(!!cfg.isDefault);
      })
      .catch(() => {
        setIdField('');
        setDisplayFields([]);
        setIsDefault(true);
      });
  }, [table]);

  useEffect(() => {
    if (!table) {
      setActiveTab('display');
    }
  }, [table]);

  function toggleDisplayField(f) {
    setDisplayFields((list) =>
      list.includes(f) ? list.filter((x) => x !== f) : [...list, f],
    );
  }

  async function handleSave() {
    try {
      if (isDefault) {
        const resImport = await fetch(
          `/api/config/import?companyId=${encodeURIComponent(company ?? '')}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ files: ['tableDisplayFields.json'] }),
          },
        );
        if (!resImport.ok) throw new Error('import failed');
        setIsDefault(false);
      }
      const res = await fetch('/api/display_fields', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ table, idField, displayFields }),
      });
      if (!res.ok) throw new Error('failed');
      addToast('Saved', 'success');
    } catch {
      addToast('Failed to save', 'error');
    }
  }

  async function handleDelete() {
    if (!confirm('Delete configuration?')) return;
    try {
      const params = new URLSearchParams({ table });
      const res = await fetch(`/api/display_fields?${params.toString()}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) throw new Error('failed');
      setIdField('');
      setDisplayFields([]);
      addToast('Deleted', 'success');
    } catch {
      addToast('Failed to delete', 'error');
    }
  }

  async function handleImport() {
    if (
      !window.confirm(
        'Importing defaults will overwrite the current configuration. Continue?'
      )
    )
      return;
    try {
      const res = await fetch(
        `/api/config/import?companyId=${encodeURIComponent(company ?? '')}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ files: ['tableDisplayFields.json'] }),
        },
      );
      if (!res.ok) throw new Error('failed');
      if (table) {
        const cfgRes = await fetch(
          `/api/display_fields?table=${encodeURIComponent(table)}`,
          { credentials: 'include' },
        );
        if (cfgRes.ok) {
          const cfg = await cfgRes.json();
          setIdField(cfg.idField || '');
          setDisplayFields(cfg.displayFields || []);
          setIsDefault(!!cfg.isDefault);
        }
      } else {
        setIsDefault(false);
      }
      addToast('Imported', 'success');
    } catch (err) {
      addToast(`Import failed: ${err.message}`, 'error');
    }
  }

  return (
    <div>
      <h2>Relations Display Fields</h2>
      <div style={{ marginBottom: '0.5rem' }}>
        <button onClick={handleImport}>Import Defaults</button>
      </div>
      <div>
        <label>
          Table:
          <select value={table} onChange={(e) => setTable(e.target.value)}>
            <option value="">-- select table --</option>
            {tables.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        {table && (
          <button onClick={handleDelete} style={{ marginLeft: '0.5rem' }}>
            Delete
          </button>
        )}
      </div>
      {table && (
        <>
          <div style={{ marginTop: '1rem', marginBottom: '1rem' }}>
            <button
              type="button"
              onClick={() => setActiveTab('display')}
              style={{
                marginRight: '0.5rem',
                padding: '0.5rem 1rem',
                backgroundColor: activeTab === 'display' ? '#2563eb' : '#e5e7eb',
                color: activeTab === 'display' ? '#fff' : '#111827',
                border: '1px solid #d1d5db',
                borderRadius: '4px',
                cursor: 'pointer',
              }}
            >
              Display
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('relations')}
              style={{
                padding: '0.5rem 1rem',
                backgroundColor:
                  activeTab === 'relations' ? '#2563eb' : '#e5e7eb',
                color: activeTab === 'relations' ? '#fff' : '#111827',
                border: '1px solid #d1d5db',
                borderRadius: '4px',
                cursor: 'pointer',
              }}
            >
              Relations
            </button>
          </div>
          {activeTab === 'display' ? (
            <div style={{ marginTop: '1rem' }}>
              <div>
                <label>
                  ID Field:
                  <select
                    value={idField}
                    onChange={(e) => setIdField(e.target.value)}
                  >
                    <option value="">-- none --</option>
                    {columns.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div style={{ marginTop: '0.5rem' }}>
                Display Fields:
                {columns.map((c) => (
                  <label key={c} style={{ display: 'block' }}>
                    <input
                      type="checkbox"
                      checked={displayFields.includes(c)}
                      onChange={() => toggleDisplayField(c)}
                    />
                    {c}
                  </label>
                ))}
              </div>
              <button onClick={handleSave} style={{ marginTop: '0.5rem' }}>
                Save
              </button>
            </div>
          ) : (
            <TableRelationsEditor table={table} />
          )}
        </>
      )}
    </div>
  );
}
