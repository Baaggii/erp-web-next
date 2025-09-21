import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useToast } from '../context/ToastContext.jsx';
import { useTranslation } from 'react-i18next';

function getColumnName(meta) {
  if (!meta || typeof meta !== 'object') return '';
  return (
    meta.COLUMN_NAME ||
    meta.column_name ||
    meta.name ||
    meta.Field ||
    meta.field ||
    ''
  );
}

function normalizeName(name) {
  return String(name || '').toLowerCase();
}

function sortByColumn(relations = []) {
  return [...relations].sort((a, b) => {
    const left = String(a?.COLUMN_NAME || '');
    const right = String(b?.COLUMN_NAME || '');
    return left.localeCompare(right, undefined, { sensitivity: 'base' });
  });
}

export default function TableRelationsEditor({ table, tables = [] }) {
  const { addToast } = useToast();
  const { t } = useTranslation();
  const [columnMeta, setColumnMeta] = useState([]);
  const [relations, setRelations] = useState([]);
  const [customRelations, setCustomRelations] = useState([]);
  const [referenceColumns, setReferenceColumns] = useState({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState('');
  const [form, setForm] = useState({
    column: '',
    referencedTable: '',
    referencedColumn: '',
  });

  const fetchArray = useCallback(
    async (url, errorKey, fallbackMessage) => {
      try {
        const res = await fetch(url, { credentials: 'include' });
        if (!res.ok) throw new Error(`Request failed: ${res.status}`);
        const data = await res.json();
        if (!Array.isArray(data)) throw new Error('Invalid response');
        return data;
      } catch (err) {
        console.error('TableRelationsEditor fetch error', err);
        addToast(t(errorKey, fallbackMessage), 'error');
        return [];
      }
    },
    [addToast, t],
  );

  useEffect(() => {
    setForm({ column: '', referencedTable: '', referencedColumn: '' });
  }, [table]);

  useEffect(() => {
    if (!table) {
      setColumnMeta([]);
      setRelations([]);
      setCustomRelations([]);
      return;
    }
    let canceled = false;
    setLoading(true);
    const encoded = encodeURIComponent(table);
    (async () => {
      try {
        const [cols, rels, custom] = await Promise.all([
          fetchArray(
            `/api/tables/${encoded}/columns`,
            'table_relations_load_columns_failed',
            'Failed to load table columns',
          ),
          fetchArray(
            `/api/tables/${encoded}/relations`,
            'table_relations_load_failed',
            'Failed to load table relations',
          ),
          fetchArray(
            `/api/tables/${encoded}/relations/custom`,
            'table_relations_load_custom_failed',
            'Failed to load custom table relations',
          ),
        ]);
        if (!canceled) {
          setColumnMeta(cols);
          setRelations(rels);
          setCustomRelations(custom);
        }
      } finally {
        if (!canceled) setLoading(false);
      }
    })();
    return () => {
      canceled = true;
    };
  }, [table, fetchArray]);

  const refreshAllRelations = useCallback(async () => {
    if (!table) return [];
    const encoded = encodeURIComponent(table);
    const rels = await fetchArray(
      `/api/tables/${encoded}/relations`,
      'table_relations_load_failed',
      'Failed to load table relations',
    );
    setRelations(rels);
    return rels;
  }, [table, fetchArray]);

  const refreshCustomRelations = useCallback(async () => {
    if (!table) return [];
    const encoded = encodeURIComponent(table);
    const rels = await fetchArray(
      `/api/tables/${encoded}/relations/custom`,
      'table_relations_load_custom_failed',
      'Failed to load custom table relations',
    );
    setCustomRelations(rels);
    return rels;
  }, [table, fetchArray]);

  useEffect(() => {
    const refTable = form.referencedTable;
    if (!refTable || referenceColumns[refTable]) return;
    let canceled = false;
    const encoded = encodeURIComponent(refTable);
    (async () => {
      const cols = await fetchArray(
        `/api/tables/${encoded}/columns`,
        'table_relations_load_reference_failed',
        'Failed to load referenced table columns',
      );
      if (!canceled) {
        setReferenceColumns((prev) => ({ ...prev, [refTable]: cols }));
      }
    })();
    return () => {
      canceled = true;
    };
  }, [form.referencedTable, referenceColumns, fetchArray]);

  const columnOptions = useMemo(() => {
    const names = columnMeta.map(getColumnName).filter(Boolean);
    const unique = Array.from(new Set(names));
    return unique.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  }, [columnMeta]);

  const availableTables = useMemo(() => {
    const sorted = [...tables];
    sorted.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    return sorted;
  }, [tables]);

  const referencedOptions = useMemo(() => {
    const refTable = form.referencedTable;
    if (!refTable) return [];
    const meta = referenceColumns[refTable] || [];
    const names = meta.map(getColumnName).filter(Boolean);
    const unique = Array.from(new Set(names));
    return unique.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  }, [form.referencedTable, referenceColumns]);

  const customByColumn = useMemo(() => {
    const map = new Map();
    for (const rel of customRelations) {
      const name = rel?.COLUMN_NAME;
      if (name) map.set(name, rel);
    }
    return map;
  }, [customRelations]);

  const sortedCustom = useMemo(() => sortByColumn(customRelations), [customRelations]);

  const sortedDatabase = useMemo(() => {
    const customColumns = new Set(
      customRelations.map((rel) => normalizeName(rel?.COLUMN_NAME)),
    );
    return sortByColumn(
      (relations || []).filter(
        (rel) => !customColumns.has(normalizeName(rel?.COLUMN_NAME)),
      ),
    );
  }, [relations, customRelations]);

  const isValid = Boolean(
    form.column && form.referencedTable && form.referencedColumn,
  );

  const handleColumnChange = useCallback(
    (event) => {
      const value = event.target.value;
      if (!value) {
        setForm({ column: '', referencedTable: '', referencedColumn: '' });
        return;
      }
      const existing = customByColumn.get(value);
      setForm({
        column: value,
        referencedTable: existing?.REFERENCED_TABLE_NAME || '',
        referencedColumn: existing?.REFERENCED_COLUMN_NAME || '',
      });
    },
    [customByColumn],
  );

  const handleReferencedTableChange = useCallback((event) => {
    const value = event.target.value;
    setForm((prev) => ({ ...prev, referencedTable: value, referencedColumn: '' }));
  }, []);

  const handleReferencedColumnChange = useCallback((event) => {
    const value = event.target.value;
    setForm((prev) => ({ ...prev, referencedColumn: value }));
  }, []);

  const handleReset = useCallback(() => {
    setForm({ column: '', referencedTable: '', referencedColumn: '' });
  }, []);

  const handleSave = useCallback(async () => {
    if (!table) return;
    if (!isValid) {
      addToast(
        t(
          'table_relations_validation_required',
          'Select a column, referenced table, and referenced column',
        ),
        'error',
      );
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(
        `/api/tables/${encodeURIComponent(table)}/relations/custom`,
        {
          method: 'PUT',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            column: form.column,
            referencedTable: form.referencedTable,
            referencedColumn: form.referencedColumn,
          }),
        },
      );
      if (!res.ok) {
        addToast(t('table_relations_save_failed', 'Failed to save relation'), 'error');
        return;
      }
      await res.json().catch(() => ({}));
      addToast(t('table_relations_saved', 'Relation saved'), 'success');
      await Promise.all([refreshCustomRelations(), refreshAllRelations()]);
    } catch (err) {
      console.error('Failed to save custom table relation', err);
      addToast(t('table_relations_save_failed', 'Failed to save relation'), 'error');
    } finally {
      setSaving(false);
    }
  }, [table, form, isValid, addToast, t, refreshCustomRelations, refreshAllRelations]);

  const handleDelete = useCallback(
    async (columnName) => {
      if (!table || !columnName) return;
      setRemoving(columnName);
      try {
        const res = await fetch(
          `/api/tables/${encodeURIComponent(table)}/relations/custom/${encodeURIComponent(
            columnName,
          )}`,
          { method: 'DELETE', credentials: 'include' },
        );
        if (!res.ok && res.status !== 204) {
          throw new Error(`Delete failed: ${res.status}`);
        }
        addToast(t('table_relations_deleted', 'Relation removed'), 'success');
        await Promise.all([refreshCustomRelations(), refreshAllRelations()]);
        if (form.column === columnName) {
          setForm({ column: '', referencedTable: '', referencedColumn: '' });
        }
      } catch (err) {
        console.error('Failed to delete custom table relation', err);
        addToast(t('table_relations_delete_failed', 'Failed to delete relation'), 'error');
      } finally {
        setRemoving('');
      }
    },
    [table, form.column, addToast, t, refreshCustomRelations, refreshAllRelations],
  );

  if (!table) {
    return (
      <div data-testid="table-relations-empty">
        {t('table_relations_select_table', 'Select a table to manage relations')}
      </div>
    );
  }

  return (
    <div className="table-relations-editor" style={{ marginTop: '1rem' }}>
      {loading && (
        <div data-testid="table-relations-loading">
          {t('table_relations_loading', 'Loading relations...')}
        </div>
      )}
      <div
        className="table-relations-form"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '0.5rem',
          alignItems: 'flex-end',
          marginBottom: '1rem',
        }}
      >
        <label style={{ display: 'flex', flexDirection: 'column', minWidth: '200px' }}>
          <span style={{ fontWeight: 600 }}>
            {t('table_relations_column', 'Column')}
          </span>
          <select
            data-testid="relation-column"
            value={form.column}
            onChange={handleColumnChange}
          >
            <option value="">
              {t('table_relations_select_prompt', '-- select --')}
            </option>
            {columnOptions.map((col) => (
              <option key={col} value={col}>
                {col}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', minWidth: '200px' }}>
          <span style={{ fontWeight: 600 }}>
            {t('table_relations_reference_table', 'Reference table')}
          </span>
          <select
            data-testid="relation-referenced-table"
            value={form.referencedTable}
            onChange={handleReferencedTableChange}
          >
            <option value="">
              {t('table_relations_select_prompt', '-- select --')}
            </option>
            {availableTables.map((tbl) => (
              <option key={tbl} value={tbl}>
                {tbl}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', minWidth: '200px' }}>
          <span style={{ fontWeight: 600 }}>
            {t('table_relations_reference_column', 'Reference column')}
          </span>
          <select
            data-testid="relation-referenced-column"
            value={form.referencedColumn}
            onChange={handleReferencedColumnChange}
            disabled={!form.referencedTable || referencedOptions.length === 0}
          >
            <option value="">
              {t('table_relations_select_prompt', '-- select --')}
            </option>
            {referencedOptions.map((col) => (
              <option key={col} value={col}>
                {col}
              </option>
            ))}
          </select>
        </label>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            type="button"
            data-testid="relation-save"
            onClick={handleSave}
            disabled={!isValid || saving}
            style={{ padding: '0.5rem 1rem' }}
          >
            {saving
              ? t('table_relations_saving', 'Saving...')
              : t('table_relations_save', 'Save relation')}
          </button>
          <button
            type="button"
            data-testid="relation-reset"
            onClick={handleReset}
            disabled={saving}
            style={{ padding: '0.5rem 1rem' }}
          >
            {t('table_relations_reset', 'Reset')}
          </button>
        </div>
      </div>
      <div style={{ marginBottom: '1rem' }}>
        <h3>{t('table_relations_custom_header', 'Custom relations')}</h3>
        {sortedCustom.length === 0 ? (
          <div data-testid="custom-relations-empty">
            {t('table_relations_custom_empty', 'No custom relations configured')}
          </div>
        ) : (
          <div style={{ display: 'grid', gap: '0.5rem' }}>
            {sortedCustom.map((rel) => (
              <div
                key={rel.COLUMN_NAME}
                data-testid="custom-relation-row"
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(4, minmax(0, max-content))',
                  gap: '0.5rem',
                  alignItems: 'center',
                }}
              >
                <span data-testid={`custom-column-${rel.COLUMN_NAME}`}>
                  {rel.COLUMN_NAME}
                </span>
                <span>{rel.REFERENCED_TABLE_NAME}</span>
                <span>{rel.REFERENCED_COLUMN_NAME}</span>
                <span style={{ display: 'flex', gap: '0.25rem' }}>
                  <button
                    type="button"
                    data-testid={`edit-relation-${rel.COLUMN_NAME}`}
                    onClick={() =>
                      setForm({
                        column: rel.COLUMN_NAME,
                        referencedTable: rel.REFERENCED_TABLE_NAME,
                        referencedColumn: rel.REFERENCED_COLUMN_NAME,
                      })
                    }
                    disabled={saving || removing === rel.COLUMN_NAME}
                  >
                    {t('table_relations_edit', 'Edit')}
                  </button>
                  <button
                    type="button"
                    data-testid={`delete-relation-${rel.COLUMN_NAME}`}
                    onClick={() => handleDelete(rel.COLUMN_NAME)}
                    disabled={saving || removing === rel.COLUMN_NAME}
                  >
                    {removing === rel.COLUMN_NAME
                      ? t('table_relations_deleting', 'Removing...')
                      : t('table_relations_delete', 'Remove')}
                  </button>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
      <div>
        <h3>{t('table_relations_database_header', 'Database relations')}</h3>
        {sortedDatabase.length === 0 ? (
          <div data-testid="database-relations-empty">
            {t('table_relations_database_empty', 'No database relations found')}
          </div>
        ) : (
          <div style={{ display: 'grid', gap: '0.5rem' }}>
            {sortedDatabase.map((rel) => (
              <div
                key={`${rel.COLUMN_NAME}:${rel.REFERENCED_TABLE_NAME}:${rel.REFERENCED_COLUMN_NAME}`}
                data-testid="database-relation-row"
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, minmax(0, max-content))',
                  gap: '0.5rem',
                }}
              >
                <span>{rel.COLUMN_NAME}</span>
                <span>{rel.REFERENCED_TABLE_NAME}</span>
                <span>{rel.REFERENCED_COLUMN_NAME}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

