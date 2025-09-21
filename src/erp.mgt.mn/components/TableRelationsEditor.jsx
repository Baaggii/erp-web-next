import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useToast } from '../context/ToastContext.jsx';

function extractColumnNames(columns) {
  if (!Array.isArray(columns)) return [];
  return columns
    .map((c) => c?.name || c?.COLUMN_NAME || c)
    .map((name) => String(name || '').trim())
    .filter((name) => name);
}

export default function TableRelationsEditor({ table, tables = [] }) {
  const { addToast } = useToast();
  const [sourceColumns, setSourceColumns] = useState([]);
  const [customRelations, setCustomRelations] = useState({});
  const [selectedColumn, setSelectedColumn] = useState('');
  const [targetTable, setTargetTable] = useState('');
  const [targetColumns, setTargetColumns] = useState([]);
  const [selectedTargetColumn, setSelectedTargetColumn] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const columnCache = useRef(new Map());

  useEffect(() => {
    if (!table) {
      setSourceColumns([]);
      setCustomRelations({});
      setSelectedColumn('');
      setTargetTable('');
      setSelectedTargetColumn('');
      setTargetColumns([]);
      return;
    }
    let canceled = false;
    setLoading(true);
    setSelectedColumn('');
    setTargetTable('');
    setSelectedTargetColumn('');
    setTargetColumns([]);
    async function load() {
      const encoded = encodeURIComponent(table);
      try {
        const res = await fetch(`/api/tables/${encoded}/columns`, {
          credentials: 'include',
        });
        if (!res.ok) throw new Error('columns');
        const cols = await res.json().catch(() => []);
        if (canceled) return;
        const names = extractColumnNames(cols);
        setSourceColumns(names);
        columnCache.current.set(table, names);
      } catch (err) {
        if (canceled) return;
        setSourceColumns([]);
        addToast('Failed to load table columns', 'error');
      }
      try {
        const res = await fetch(`/api/tables/${encoded}/custom-relations`, {
          credentials: 'include',
        });
        if (!res.ok) throw new Error('relations');
        const data = await res.json().catch(() => ({}));
        if (canceled) return;
        const relations =
          data && typeof data === 'object' && !Array.isArray(data)
            ? data.relations ?? data
            : {};
        setCustomRelations(relations && typeof relations === 'object' ? relations : {});
      } catch (err) {
        if (canceled) return;
        setCustomRelations({});
        addToast('Failed to load custom relations', 'error');
      } finally {
        if (!canceled) setLoading(false);
      }
    }
    load();
    return () => {
      canceled = true;
    };
  }, [table, addToast]);

  useEffect(() => {
    if (!targetTable) {
      setTargetColumns([]);
      setSelectedTargetColumn('');
      return;
    }
    let canceled = false;
    async function loadTarget() {
      if (columnCache.current.has(targetTable)) {
        const cached = columnCache.current.get(targetTable) || [];
        if (!canceled) {
          setTargetColumns(cached);
          setSelectedTargetColumn((current) =>
            cached.includes(current) ? current : '',
          );
        }
        return;
      }
      try {
        const res = await fetch(
          `/api/tables/${encodeURIComponent(targetTable)}/columns`,
          { credentials: 'include' },
        );
        if (!res.ok) throw new Error('columns');
        const cols = await res.json().catch(() => []);
        if (canceled) return;
        const names = extractColumnNames(cols);
        columnCache.current.set(targetTable, names);
        setTargetColumns(names);
        setSelectedTargetColumn((current) =>
          names.includes(current) ? current : '',
        );
      } catch (err) {
        if (canceled) return;
        setTargetColumns([]);
        setSelectedTargetColumn('');
        addToast('Failed to load target columns', 'error');
      }
    }
    loadTarget();
    return () => {
      canceled = true;
    };
  }, [targetTable, addToast]);

  const relationEntries = useMemo(
    () =>
      Object.entries(customRelations || {})
        .filter(([column, rel]) => column && rel?.targetTable && rel?.targetColumn)
        .sort(([a], [b]) => a.localeCompare(b)),
    [customRelations],
  );

  async function handleSave(e) {
    e?.preventDefault?.();
    if (!table) {
      addToast('Please select a table first', 'error');
      return;
    }
    if (!selectedColumn) {
      addToast('Please choose a source column', 'error');
      return;
    }
    if (!targetTable) {
      addToast('Please choose a target table', 'error');
      return;
    }
    if (!selectedTargetColumn) {
      addToast('Please choose a target column', 'error');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(
        `/api/tables/${encodeURIComponent(table)}/custom-relations/${encodeURIComponent(
          selectedColumn,
        )}`,
        {
          method: 'PUT',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            targetTable,
            targetColumn: selectedTargetColumn,
          }),
        },
      );
      if (!res.ok) throw new Error('failed');
      let saved;
      try {
        saved = await res.json();
      } catch {
        saved = null;
      }
      setCustomRelations((prev) => ({
        ...prev,
        [selectedColumn]: {
          targetTable: saved?.targetTable || targetTable,
          targetColumn: saved?.targetColumn || selectedTargetColumn,
        },
      }));
      addToast('Relation saved', 'success');
    } catch (err) {
      addToast('Failed to save relation', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(column) {
    if (!table || !column) return;
    if (typeof window !== 'undefined' && window.confirm) {
      const confirmed = window.confirm('Delete this custom relation?');
      if (!confirmed) return;
    }
    try {
      const res = await fetch(
        `/api/tables/${encodeURIComponent(table)}/custom-relations/${encodeURIComponent(
          column,
        )}`,
        {
          method: 'DELETE',
          credentials: 'include',
        },
      );
      if (!res.ok) throw new Error('failed');
      setCustomRelations((prev) => {
        const next = { ...prev };
        delete next[column];
        return next;
      });
      addToast('Relation removed', 'success');
    } catch (err) {
      addToast('Failed to remove relation', 'error');
    }
  }

  if (!table) {
    return <p style={{ marginTop: '1rem' }}>Select a table to manage relations.</p>;
  }

  return (
    <div style={{ marginTop: '1rem' }}>
      {loading && <p>Loading relations…</p>}
      <form onSubmit={handleSave} style={{ marginBottom: '1rem' }}>
        <div style={{ marginBottom: '0.5rem' }}>
          <label>
            Source column:{' '}
            <select
              value={selectedColumn}
              onChange={(e) => setSelectedColumn(e.target.value)}
              disabled={saving || sourceColumns.length === 0}
            >
              <option value="">-- select column --</option>
              {sourceColumns.map((col) => (
                <option key={col} value={col}>
                  {col}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div style={{ marginBottom: '0.5rem' }}>
          <label>
            Target table:{' '}
            <select
              value={targetTable}
              onChange={(e) => setTargetTable(e.target.value)}
              disabled={saving}
            >
              <option value="">-- select table --</option>
              {tables
                .filter((t) => t !== table)
                .map((tbl) => (
                  <option key={tbl} value={tbl}>
                    {tbl}
                  </option>
                ))}
            </select>
          </label>
        </div>
        <div style={{ marginBottom: '0.5rem' }}>
          <label>
            Target column:{' '}
            <select
              value={selectedTargetColumn}
              onChange={(e) => setSelectedTargetColumn(e.target.value)}
              disabled={saving || !targetTable || targetColumns.length === 0}
            >
              <option value="">-- select column --</option>
              {targetColumns.map((col) => (
                <option key={col} value={col}>
                  {col}
                </option>
              ))}
            </select>
          </label>
        </div>
        <button type="submit" disabled={saving}>
          {saving ? 'Saving…' : 'Save relation'}
        </button>
      </form>
      <div>
        <h3>Custom relations</h3>
        {relationEntries.length === 0 ? (
          <p>No custom relations configured.</p>
        ) : (
          <table
            style={{ borderCollapse: 'collapse', minWidth: '300px' }}
            data-testid="custom-relations-table"
          >
            <thead>
              <tr>
                <th style={{ borderBottom: '1px solid #d1d5db', textAlign: 'left' }}>
                  Source column
                </th>
                <th style={{ borderBottom: '1px solid #d1d5db', textAlign: 'left' }}>
                  Target
                </th>
                <th style={{ borderBottom: '1px solid #d1d5db' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {relationEntries.map(([column, rel]) => (
                <tr key={column}>
                  <td style={{ padding: '0.25rem 0.5rem' }}>{column}</td>
                  <td style={{ padding: '0.25rem 0.5rem' }}>
                    {rel.targetTable}.{rel.targetColumn}
                  </td>
                  <td style={{ padding: '0.25rem 0.5rem' }}>
                    <button type="button" onClick={() => handleDelete(column)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
