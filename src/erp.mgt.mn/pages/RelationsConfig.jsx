import React, { useEffect, useState, useContext, useMemo } from 'react';
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
  const [filteredConfigs, setFilteredConfigs] = useState([]);
  const [isDefault, setIsDefault] = useState(false);
  const [activeTab, setActiveTab] = useState('display');

  const columnNames = useMemo(() => columns.map((c) => c.name), [columns]);

  const createEmptyFilteredConfig = () => ({
    key: `filter-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    filterColumn: '',
    filterValue: '',
    idField: '',
    displayFields: [],
  });

  function normalizeFilteredConfig(entry, idx) {
    if (!entry || typeof entry !== 'object') {
      return createEmptyFilteredConfig();
    }
    return {
      key: `filter-${idx}-${Date.now()}`,
      filterColumn: entry.filterColumn || entry.filter_column || '',
      filterValue:
        entry.filterValue !== undefined && entry.filterValue !== null
          ? String(entry.filterValue)
          : '',
      idField: entry.idField || entry.id_field || '',
      displayFields: Array.isArray(entry.displayFields ?? entry.display_fields)
        ? entry.displayFields
        : [],
    };
  }

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
      .then((cols) => {
        const normalized = Array.isArray(cols)
          ? cols
              .map((c) => {
                if (typeof c === 'string') return { name: c, enumValues: [] };
                const name = c?.name || c?.COLUMN_NAME || c?.column_name || c?.Field;
                if (!name) return null;
                const enumValues = Array.isArray(c?.enumValues)
                  ? c.enumValues
                  : Array.isArray(c?.enum_values)
                  ? c.enum_values
                  : [];
                return { name, enumValues };
              })
              .filter(Boolean)
          : [];
        setColumns(normalized);
      })
      .catch(() => setColumns([]));
    fetch(`/api/display_fields?table=${encodeURIComponent(table)}`, {
      credentials: 'include',
    })
      .then((res) =>
        res.ok
          ? res.json()
          : { idField: '', displayFields: [], entries: [], isDefault: true },
      )
      .then((cfg) => {
        const entries = Array.isArray(cfg.entries) ? cfg.entries : [];
        const base =
          entries.find((entry) => !entry.filterColumn && !entry.filterValue) || cfg || {};
        setIdField(base.idField || '');
        setDisplayFields(Array.isArray(base.displayFields) ? base.displayFields : []);
        setFilteredConfigs(
          entries
            .filter((entry) => entry.filterColumn || entry.filterValue)
            .map((entry, idx) => normalizeFilteredConfig(entry, idx)),
        );
        setIsDefault(!!cfg.isDefault);
      })
      .catch(() => {
        setIdField('');
        setDisplayFields([]);
        setFilteredConfigs([]);
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

  function updateFilteredConfigEntry(key, updates) {
    setFilteredConfigs((list) =>
      list.map((cfg) => (cfg.key === key ? { ...cfg, ...updates } : cfg)),
    );
  }

  function toggleFilteredDisplayField(key, field) {
    setFilteredConfigs((list) =>
      list.map((cfg) => {
        if (cfg.key !== key) return cfg;
        const exists = cfg.displayFields.includes(field);
        return {
          ...cfg,
          displayFields: exists
            ? cfg.displayFields.filter((f) => f !== field)
            : [...cfg.displayFields, field],
        };
      }),
    );
  }

  function removeFilteredConfig(key) {
    setFilteredConfigs((list) => list.filter((cfg) => cfg.key !== key));
  }

  async function handleSave() {
    try {
      const baseId = (idField || '').trim();
      const baseDisplay = Array.isArray(displayFields)
        ? displayFields.map((f) => String(f).trim()).filter(Boolean)
        : [];

      if (!table) throw new Error('table is required');
      if (!baseId) throw new Error('ID Field is required');
      if (baseDisplay.length === 0) throw new Error('Select at least one display field');

      const entries = [
        {
          table,
          idField: baseId,
          displayFields: baseDisplay,
        },
      ];

      filteredConfigs.forEach((cfg) => {
        const filterColumn = (cfg.filterColumn || '').trim();
        const rawFilterValue = cfg.filterValue ?? '';
        const filterValue = rawFilterValue === null ? '' : String(rawFilterValue).trim();
        const cfgIdField = (cfg.idField || '').trim();
        const fields = Array.isArray(cfg.displayFields)
          ? cfg.displayFields.map((f) => String(f).trim()).filter(Boolean)
          : [];
        const hasContent = filterColumn || filterValue || cfgIdField || fields.length > 0;
        if (!hasContent) return;
        if (!filterColumn || !filterValue) {
          throw new Error('Filtered entries require both a filter column and value');
        }
        if (!cfgIdField) {
          throw new Error('Filtered entries must specify an ID field');
        }
        if (fields.length === 0) {
          throw new Error('Filtered entries must include at least one display field');
        }
        entries.push({
          table,
          idField: cfgIdField,
          filterColumn,
          filterValue,
          displayFields: fields,
        });
      });

      const keys = new Set();
      entries.forEach((entry) => {
        const key = [
          entry.table,
          entry.idField,
          entry.filterColumn || '',
          entry.filterValue || '',
        ].join('|');
        if (keys.has(key)) {
          throw new Error('Duplicate display field configuration');
        }
        keys.add(key);
      });

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

      const deleteRes = await fetch(`/api/display_fields?table=${encodeURIComponent(table)}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!deleteRes.ok) {
        throw new Error('Failed to clear existing display field entries');
      }

      for (const entry of entries) {
        const res = await fetch('/api/display_fields', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(entry),
        });
        if (!res.ok) {
          const message = await res
            .json()
            .then((body) => body?.message || '')
            .catch(() => '');
          throw new Error(message || 'Failed to save display fields');
        }
      }

      addToast('Saved', 'success');
    } catch (err) {
      const message = err?.message || 'Failed to save';
      addToast(message, 'error');
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
      setFilteredConfigs([]);
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
          const entries = Array.isArray(cfg.entries) ? cfg.entries : [];
          const base =
            entries.find((entry) => !entry.filterColumn && !entry.filterValue) || cfg || {};
          setIdField(base.idField || '');
          setDisplayFields(Array.isArray(base.displayFields) ? base.displayFields : []);
          setFilteredConfigs(
            entries
              .filter((entry) => entry.filterColumn || entry.filterValue)
              .map((entry, idx) => normalizeFilteredConfig(entry, idx)),
          );
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
                    {columnNames.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div style={{ marginTop: '0.5rem' }}>
                Display Fields:
                {columnNames.map((c) => (
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
              <div style={{ marginTop: '1rem' }}>
                <h4 style={{ margin: 0 }}>Filtered configurations</h4>
                <p style={{ margin: '0.25rem 0' }}>
                  Each filtered entry must include a filter column, filter value, ID field, and at
                  least one display field.
                </p>
                {filteredConfigs.length === 0 && (
                  <p style={{ margin: '0.25rem 0' }}>
                    Add filter-specific display fields to override the default settings.
                  </p>
                )}
                {filteredConfigs.map((cfg, idx) => {
                  const columnMeta = columns.find((col) => col.name === cfg.filterColumn);
                  const enumValues = Array.isArray(columnMeta?.enumValues)
                    ? columnMeta.enumValues
                    : [];
                  return (
                    <div
                      key={cfg.key}
                      style={{
                        border: '1px solid #e5e7eb',
                        padding: '0.75rem',
                        marginTop: '0.5rem',
                        borderRadius: '4px',
                      }}
                    >
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
                        <label>
                          Filter Field:
                          <select
                            value={cfg.filterColumn}
                            onChange={(e) =>
                              updateFilteredConfigEntry(cfg.key, {
                                filterColumn: e.target.value,
                                filterValue: '',
                              })
                            }
                          >
                            <option value="">-- select field --</option>
                            {columnNames.map((c) => (
                              <option key={`filter-${idx}-${c}`} value={c}>
                                {c}
                              </option>
                            ))}
                          </select>
                        </label>
                        {cfg.filterColumn &&
                          (enumValues.length > 0 ? (
                            <label>
                              Filter Value:
                              <select
                                value={cfg.filterValue}
                              onChange={(e) =>
                                updateFilteredConfigEntry(cfg.key, {
                                  filterValue: e.target.value,
                                })
                              }
                            >
                                <option value="">-- select value --</option>
                                {enumValues.map((val) => (
                                  <option key={`enum-${cfg.key}-${val}`} value={val}>
                                    {val}
                                  </option>
                                ))}
                              </select>
                            </label>
                          ) : (
                            <label>
                              Filter Value:
                              <input
                                type="text"
                                value={cfg.filterValue}
                              onChange={(e) =>
                                updateFilteredConfigEntry(cfg.key, {
                                  filterValue: e.target.value,
                                })
                              }
                              placeholder="Filter value (required)"
                            />
                          </label>
                        ))}
                      </div>
                      <div style={{ marginTop: '0.5rem' }}>
                        <label>
                          ID Field:
                          <select
                            value={cfg.idField}
                            onChange={(e) =>
                              updateFilteredConfigEntry(cfg.key, {
                                idField: e.target.value,
                              })
                            }
                          >
                            <option value="">-- none --</option>
                            {columnNames.map((c) => (
                              <option key={`id-${cfg.key}-${c}`} value={c}>
                                {c}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                      <div style={{ marginTop: '0.5rem' }}>
                        Display Fields:
                        {columnNames.map((c) => (
                          <label
                            key={`display-${cfg.key}-${c}`}
                            style={{ display: 'block' }}
                          >
                            <input
                              type="checkbox"
                              checked={cfg.displayFields.includes(c)}
                              onChange={() => toggleFilteredDisplayField(cfg.key, c)}
                            />
                            {c}
                          </label>
                        ))}
                      </div>
                      <div style={{ marginTop: '0.5rem' }}>
                        <button type="button" onClick={() => removeFilteredConfig(cfg.key)}>
                          Remove configuration
                        </button>
                      </div>
                    </div>
                  );
                })}
                <button
                  type="button"
                  style={{ marginTop: '0.5rem' }}
                  onClick={() => setFilteredConfigs((list) => [...list, createEmptyFilteredConfig()])}
                >
                  Add filtered configuration
                </button>
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
