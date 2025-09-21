import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useToast } from '../context/ToastContext.jsx';
import { useTranslation } from 'react-i18next';

function normalizeColumns(list) {
  if (!Array.isArray(list)) return [];
  return list
    .map((item) => {
      if (typeof item === 'string') return item;
      if (item?.COLUMN_NAME) return item.COLUMN_NAME;
      if (item?.column_name) return item.column_name;
      if (item?.name) return item.name;
      if (item?.Field) return item.Field;
      return '';
    })
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
}

function buildRelationSummary(relations) {
  if (!Array.isArray(relations)) return [];
  const map = new Map();
  relations.forEach((rel) => {
    if (!rel || !rel.COLUMN_NAME) return;
    map.set(rel.COLUMN_NAME, rel);
  });
  return Array.from(map.values()).sort((a, b) =>
    a.COLUMN_NAME.localeCompare(b.COLUMN_NAME),
  );
}

export default function TableRelationsEditor({ table }) {
  const { addToast } = useToast();
  const { t } = useTranslation();
  const [columns, setColumns] = useState([]);
  const [tables, setTables] = useState([]);
  const [relations, setRelations] = useState([]);
  const [customRelations, setCustomRelations] = useState({});
  const [selectedColumn, setSelectedColumn] = useState('');
  const [targetTable, setTargetTable] = useState('');
  const [targetColumn, setTargetColumn] = useState('');
  const [targetColumnsCache, setTargetColumnsCache] = useState({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingColumn, setDeletingColumn] = useState('');
  const [isDefaultConfig, setIsDefaultConfig] = useState(true);

  const sortedColumns = useMemo(() => [...columns].sort((a, b) => a.localeCompare(b)), [columns]);
  const sortedTables = useMemo(() => [...tables].sort((a, b) => a.localeCompare(b)), [tables]);
  const summaryRelations = useMemo(() => buildRelationSummary(relations), [relations]);
  const currentTargetColumns = targetColumnsCache[targetTable] || [];
  const hasCustomSelection = Boolean(
    selectedColumn && customRelations?.[selectedColumn],
  );

  const loadData = useCallback(async () => {
    if (!table) {
      setColumns([]);
      setTables([]);
      setRelations([]);
      setCustomRelations({});
      setTargetColumnsCache({});
      setSelectedColumn('');
      setTargetTable('');
      setTargetColumn('');
      return;
    }
    setLoading(true);
    try {
      const encoded = encodeURIComponent(table);
      const [colsRes, tablesRes, relRes, customRes] = await Promise.all([
        fetch(`/api/tables/${encoded}/columns`, { credentials: 'include' }),
        fetch('/api/tables', { credentials: 'include' }),
        fetch(`/api/tables/${encoded}/relations`, { credentials: 'include' }),
        fetch(`/api/tables/${encoded}/relations/custom`, {
          credentials: 'include',
        }),
      ]);
      if (!colsRes.ok || !tablesRes.ok || !relRes.ok || !customRes.ok) {
        throw new Error('Failed to load relation metadata');
      }
      const [colsJson, tablesJson, relationsJson, customJson] = await Promise.all([
        colsRes.json().catch(() => []),
        tablesRes.json().catch(() => []),
        relRes.json().catch(() => []),
        customRes.json().catch(() => ({})),
      ]);
      setColumns(normalizeColumns(colsJson));
      setTables(Array.isArray(tablesJson) ? tablesJson.filter(Boolean) : []);
      setRelations(Array.isArray(relationsJson) ? relationsJson : []);
      const customMap =
        customJson && typeof customJson === 'object'
          ? customJson.relations ?? customJson
          : {};
      setCustomRelations(
        customMap && typeof customMap === 'object' && !Array.isArray(customMap)
          ? customMap
          : {},
      );
      setIsDefaultConfig(Boolean(customJson?.isDefault ?? true));
      setTargetColumnsCache({});
      setSelectedColumn('');
      setTargetTable('');
      setTargetColumn('');
    } catch (err) {
      console.error('Failed to load table relations configuration', err);
      addToast(
        t('failed_load_table_relations', 'Failed to load table relations'),
        'error',
      );
    } finally {
      setLoading(false);
    }
  }, [addToast, table, t]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const ensureTargetColumns = useCallback(
    async (tbl) => {
      if (!tbl) return [];
      if (targetColumnsCache[tbl]) return targetColumnsCache[tbl];
      try {
        const encoded = encodeURIComponent(tbl);
        const res = await fetch(`/api/tables/${encoded}/columns`, {
          credentials: 'include',
        });
        if (!res.ok) throw new Error('Failed to load target columns');
        const json = await res.json().catch(() => []);
        const normalized = normalizeColumns(json);
        setTargetColumnsCache((prev) => ({ ...prev, [tbl]: normalized }));
        return normalized;
      } catch (err) {
        console.error('Failed to load target table columns', err);
        addToast('Failed to load target table columns', 'error');
        return [];
      }
    },
    [addToast, targetColumnsCache],
  );

  const startEdit = useCallback(
    async (column) => {
      setSelectedColumn(column);
      if (!column) {
        setTargetTable('');
        setTargetColumn('');
        return;
      }
      const custom = customRelations?.[column];
      if (custom && custom.table && custom.column) {
        setTargetTable(custom.table);
        await ensureTargetColumns(custom.table);
        setTargetColumn(custom.column);
        return;
      }
      const rel = [...summaryRelations]
        .reverse()
        .find((r) => r?.COLUMN_NAME === column);
      if (rel) {
        const tbl = rel.REFERENCED_TABLE_NAME || rel.table || '';
        const col = rel.REFERENCED_COLUMN_NAME || rel.column || '';
        setTargetTable(tbl);
        await ensureTargetColumns(tbl);
        setTargetColumn(col);
      } else {
        setTargetTable('');
        setTargetColumn('');
      }
    },
    [customRelations, ensureTargetColumns, summaryRelations],
  );

  const handleTargetTableChange = useCallback(
    async (value) => {
      setTargetTable(value);
      setTargetColumn('');
      if (value) {
        await ensureTargetColumns(value);
      }
    },
    [ensureTargetColumns],
  );

  const handleSave = useCallback(async () => {
    if (!selectedColumn) {
      addToast('Select a source column to configure', 'error');
      return;
    }
    if (!targetTable) {
      addToast('Select a target table', 'error');
      return;
    }
    if (!targetColumn) {
      addToast('Select a target column', 'error');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(
        `/api/tables/${encodeURIComponent(table)}/relations/custom/${encodeURIComponent(
          selectedColumn,
        )}`,
        {
          method: 'PUT',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            targetTable,
            targetColumn,
          }),
        },
      );
      if (!res.ok) {
        throw new Error('Failed to save relation');
      }
      await res.json().catch(() => ({}));
      addToast('Saved relation mapping', 'success');
      await loadData();
      if (selectedColumn) {
        await startEdit(selectedColumn);
      }
    } catch (err) {
      console.error('Failed to save custom relation', err);
      addToast('Failed to save relation mapping', 'error');
    } finally {
      setSaving(false);
    }
  }, [addToast, loadData, selectedColumn, startEdit, table, targetColumn, targetTable]);

  const handleDelete = useCallback(
    async (column) => {
      if (!column) return;
      setDeletingColumn(column);
      try {
        const res = await fetch(
          `/api/tables/${encodeURIComponent(table)}/relations/custom/${encodeURIComponent(
            column,
          )}`,
          { method: 'DELETE', credentials: 'include' },
        );
        if (!res.ok) {
          throw new Error('Failed to delete relation');
        }
        addToast('Removed custom relation', 'success');
        await loadData();
      } catch (err) {
        console.error('Failed to delete custom relation', err);
        addToast('Failed to remove relation', 'error');
      } finally {
        setDeletingColumn('');
      }
    },
    [addToast, loadData, table],
  );

  return (
    <div className="table-relations-editor">
      <h3>Table Relations</h3>
      {table ? (
        <p>
          Editing relations for <strong>{table}</strong>
          {!isDefaultConfig ? ' (customized)' : ''}
        </p>
      ) : (
        <p>Select a table to configure relations.</p>
      )}
      {loading && (
        <p data-testid="relations-loading">Loading relations…</p>
      )}
      {!loading && (
        <>
          <div>
            <h4>Existing Relations</h4>
            {summaryRelations.length === 0 ? (
              <p data-testid="relations-empty">No relations defined.</p>
            ) : (
              <table className="relations-summary" data-testid="relations-table">
                <thead>
                  <tr>
                    <th>Column</th>
                    <th>Target Table</th>
                    <th>Target Column</th>
                    <th>Source</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {summaryRelations.map((rel) => (
                    <tr
                      key={rel.COLUMN_NAME}
                      data-testid={`relation-row-${rel.COLUMN_NAME}`}
                    >
                      <td>{rel.COLUMN_NAME}</td>
                      <td>{rel.REFERENCED_TABLE_NAME || '-'}</td>
                      <td>{rel.REFERENCED_COLUMN_NAME || '-'}</td>
                      <td>{rel.source === 'custom' ? 'Custom' : 'Database'}</td>
                      <td>
                        <button
                          type="button"
                          data-testid={`relation-edit-${rel.COLUMN_NAME}`}
                          onClick={() => startEdit(rel.COLUMN_NAME)}
                        >
                          Edit
                        </button>
                        {rel.source === 'custom' && (
                          <button
                            type="button"
                            data-testid={`relation-delete-${rel.COLUMN_NAME}`}
                            onClick={() => handleDelete(rel.COLUMN_NAME)}
                            disabled={deletingColumn === rel.COLUMN_NAME}
                          >
                            {deletingColumn === rel.COLUMN_NAME
                              ? 'Removing…'
                              : 'Remove'}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <div style={{ marginTop: '1rem' }}>
            <h4>Add or Update Relation</h4>
            <div style={{ marginBottom: '0.5rem' }}>
              <label>
                Source Column
                <select
                  value={selectedColumn}
                  data-testid="relations-column-select"
                  onChange={(e) => startEdit(e.target.value)}
                >
                  <option value="">-- Select column --</option>
                  {sortedColumns.map((col) => (
                    <option key={col} value={col}>
                      {col}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div style={{ marginBottom: '0.5rem' }}>
              <label>
                Target Table
                <select
                  value={targetTable}
                  data-testid="relations-target-table"
                  onChange={(e) => handleTargetTableChange(e.target.value)}
                >
                  <option value="">-- Select table --</option>
                  {sortedTables.map((tbl) => (
                    <option key={tbl} value={tbl}>
                      {tbl}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div style={{ marginBottom: '0.5rem' }}>
              <label>
                Target Column
                <select
                  value={targetColumn}
                  data-testid="relations-target-column"
                  onChange={(e) => setTargetColumn(e.target.value)}
                >
                  <option value="">-- Select column --</option>
                  {currentTargetColumns.map((col) => (
                    <option key={col} value={col}>
                      {col}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                type="button"
                data-testid="relations-save"
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? 'Saving…' : 'Save Relation'}
              </button>
              {hasCustomSelection && (
                <button
                  type="button"
                  data-testid="relations-form-delete"
                  onClick={() => handleDelete(selectedColumn)}
                  disabled={deletingColumn === selectedColumn}
                >
                  {deletingColumn === selectedColumn
                    ? 'Removing…'
                    : 'Remove Custom Mapping'}
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
