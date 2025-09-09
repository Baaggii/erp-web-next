import React, { useEffect, useState, useContext } from 'react';
import { useToast } from '../context/ToastContext.jsx';
import { refreshTxnModules } from '../hooks/useTxnModules.js';
import { refreshModules } from '../hooks/useModules.js';
import { AuthContext } from '../context/AuthContext.jsx';

const emptyConfig = {
  label: '',
  masterTable: '',
  masterForm: '',
  masterType: 'single',
  masterPosition: 'upper_left',
  masterView: 'fitted',
  tables: [],
  calcFields: [],
  posFields: [],
  statusField: { table: '', field: '', created: '', beforePost: '', posted: '' },
};

export default function PosTxnConfig() {
  const { addToast } = useToast();
  const { company } = useContext(AuthContext);
  const [configs, setConfigs] = useState({});
  const [name, setName] = useState('');
  const [formOptions, setFormOptions] = useState({});
  const [formNames, setFormNames] = useState([]);
  const [formToTable, setFormToTable] = useState({});
  const [formFields, setFormFields] = useState({});
  const [tables, setTables] = useState([]);
  const [masterCols, setMasterCols] = useState([]);
  const [tableColumns, setTableColumns] = useState({});
  const [statusOptions, setStatusOptions] = useState([]);
  const [config, setConfig] = useState(emptyConfig);

  useEffect(() => {
    fetch('/api/pos_txn_config', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : {}))
      .then((data) => setConfigs(data))
      .catch(() => setConfigs({}));

    fetch('/api/transaction_forms', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : {}))
      .then((data) => {
        const byTable = {};
        const names = [];
        const mapping = {};
        const fields = {};
        for (const [name, info] of Object.entries(data)) {
          const tbl = info.table;
          mapping[name] = tbl;
          names.push(name);
          fields[name] = Array.isArray(info.visibleFields) ? info.visibleFields : [];
          if (!byTable[tbl]) byTable[tbl] = [];
          byTable[tbl].push(name);
        }
        setFormOptions(byTable);
        setFormNames(names);
        setFormToTable(mapping);
        setFormFields(fields);
      })
      .catch(() => {
        setFormOptions({});
        setFormNames([]);
        setFormToTable({});
        setFormFields({});
      });

    fetch('/api/tables', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setTables(data))
      .catch(() => setTables([]));

  }, []);



  useEffect(() => {
    if (!config.statusField.table) {
      setStatusOptions([]);
      return;
    }
    fetch(
      `/api/tables/${encodeURIComponent(config.statusField.table)}?perPage=500`,
      { credentials: 'include' },
    )
      .then((res) => (res.ok ? res.json() : { rows: [] }))
      .then((data) => {
        const opts = (data.rows || []).map((r) => {
          const vals = Object.values(r).filter((v) => v !== undefined);
          return { value: vals[0], label: vals.slice(0, 2).join(' - ') };
        });
        setStatusOptions(opts);
      })
      .catch(() => setStatusOptions([]));
  }, [config.statusField.table]);

  useEffect(() => {
    const tbls = [config.masterTable, ...config.tables.map((t) => t.table)];
    tbls.forEach((tbl) => {
      if (!tbl || tableColumns[tbl]) return;
      fetch(`/api/tables/${encodeURIComponent(tbl)}/columns`, {
        credentials: 'include',
      })
        .then((res) => (res.ok ? res.json() : []))
        .then((cols) => {
          const names = cols.map((c) => c.name || c);
          setTableColumns((m) => ({ ...m, [tbl]: names }));
          if (tbl === config.masterTable) setMasterCols(names);
        })
        .catch(() => {});
    });
  }, [config.masterTable, config.tables, tableColumns]);

  async function loadConfig(n) {
    if (!n) {
      setName('');
      setConfig({ ...emptyConfig });
      return;
    }
    try {
      const res = await fetch(`/api/pos_txn_config?name=${encodeURIComponent(n)}`, {
        credentials: 'include',
      });
      const cfg = res.ok ? await res.json() : emptyConfig;
      const loaded = { ...emptyConfig, ...(cfg || {}) };
      if (Array.isArray(loaded.tables) && loaded.tables.length > 0) {
        const [master, ...rest] = loaded.tables;
        loaded.masterTable = master.table || '';
        loaded.masterForm = master.form || '';
        loaded.masterType = master.type || 'single';
        loaded.masterPosition = master.position || 'upper_left';
        loaded.masterView = master.view || 'fitted';
        loaded.tables = rest.map((t) => ({ view: 'fitted', ...t }));
      }
      if (!loaded.masterView) loaded.masterView = 'fitted';
      if (loaded.label === undefined) loaded.label = '';
      if (Array.isArray(loaded.calcFields)) {
        loaded.calcFields = loaded.calcFields.map((row, rIdx) => {
          const cells = Array.isArray(row.cells)
            ? row.cells.map((c, cIdx) => ({
                table:
                  c.table ||
                  (cIdx === 0
                    ? loaded.masterTable
                    : loaded.tables[cIdx - 1]?.table || ''),
                field: c.field || '',
                agg: c.agg || '',
              }))
            : [];
          while (cells.length < loaded.tables.length + 1)
            cells.push({ table: '', field: '', agg: '' });
          return { name: row.name || `Map${rIdx + 1}`, cells };
        });
      } else {
        loaded.calcFields = [];
      }

      if (Array.isArray(loaded.posFields)) {
        loaded.posFields = loaded.posFields.map((p, idx) => {
          const parts = Array.isArray(p.parts)
            ? p.parts.map((pt, pIdx) => ({
                agg: pt.agg || (pIdx === 0 ? '=' : '+'),
                field: pt.field || '',
                table: pt.table || loaded.masterTable,
              }))
            : [{ agg: '=', field: '', table: loaded.masterTable }];
          return { name: p.name || `PF${idx + 1}`, parts };
        });
      } else {
        loaded.posFields = [];
      }

      if (!loaded.statusField) loaded.statusField = { table: '', field: '', created: '', beforePost: '', posted: '' };
      setName(n);
      setConfig(loaded);
    } catch {
      setName(n);
      setConfig({ ...emptyConfig });
    }
  }

  function addColumn() {
    setConfig((c) => ({
      ...c,
      tables: [
        ...c.tables,
        { table: '', form: '', type: 'single', position: 'upper_left', view: 'fitted' },
      ],
      calcFields: c.calcFields.map((row) => ({
        ...row,
        cells: [...row.cells, { table: '', field: '', agg: '' }],
      })),
    }));
  }

  function updateColumn(idx, key, value) {
    setConfig((c) => {
      const tables = c.tables.map((t, i) => {
        if (i !== idx) return t;
        if (key === 'form') {
          const tbl = formToTable[value] || '';
          return { ...t, form: value, table: tbl };
        }
        if (key === 'table') {
          return { ...t, table: value };
        }
        return { ...t, [key]: value };
      });
      const newTbl =
        key === 'form'
          ? formToTable[value] || ''
          : key === 'table'
          ? value
          : tables[idx].table;
      return {
        ...c,
        tables,
        calcFields: c.calcFields.map((row) => ({
          ...row,
          cells: row.cells.map((cell, cIdx) =>
            cIdx === idx + 1 ? { ...cell, table: newTbl } : cell,
          ),
        })),
      };
    });
  }

  function removeColumn(idx) {
    setConfig((c) => {
      const tbl = c.tables[idx]?.table;
      return {
        ...c,
        masterTable: c.masterTable === tbl ? '' : c.masterTable,
        masterForm: c.masterTable === tbl ? '' : c.masterForm,
        tables: c.tables.filter((_, i) => i !== idx),
        calcFields: c.calcFields.map((row) => ({
          ...row,
          cells: row.cells.filter((_, i) => i !== idx + 1),
        })),
      };
    });
  }

  function removeMaster() {
    setConfig((c) => ({
      ...c,
      masterTable: '',
      masterForm: '',
      masterView: 'fitted',
      calcFields: c.calcFields.map((row) => ({
        ...row,
        cells: row.cells.map((cell, i) => (i === 0 ? { ...cell, table: '' } : cell)),
      })),
      posFields: c.posFields.map((p) => ({
        ...p,
        parts: p.parts.map((pt) => ({ ...pt, table: '' })),
      })),
    }));
  }

  async function handleSave() {
    if (!name) {
      addToast('Name required', 'error');
      return;
    }
    const saveCfg = {
      ...config,
      tables: [
        {
          table: config.masterTable,
          form: config.masterForm,
          type: config.masterType,
          position: config.masterPosition,
          view: config.masterView,
        },
        ...config.tables,
      ],
    };
    await fetch('/api/pos_txn_config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ name, config: saveCfg }),
    });
    refreshTxnModules();
    refreshModules();
    addToast('Saved', 'success');
    fetch('/api/pos_txn_config', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : {}))
      .then((data) => setConfigs(data))
      .catch(() => {});
  }

  async function handleDelete() {
    if (!name) return;
    if (!window.confirm('Delete configuration?')) return;
    try {
      const res = await fetch(`/api/pos_txn_config?name=${encodeURIComponent(name)}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) {
        addToast('Delete failed', 'error');
        return;
      }
      refreshTxnModules();
      refreshModules();
      addToast('Deleted', 'success');
      setName('');
      setConfig({ ...emptyConfig });
      fetch('/api/pos_txn_config', { credentials: 'include' })
        .then((res) => (res.ok ? res.json() : {}))
        .then((data) => setConfigs(data))
        .catch(() => {});
    } catch {
      addToast('Delete failed', 'error');
    }
  }

  async function handleImport() {
    if (!window.confirm('Import default POS transaction configuration?')) return;
    try {
      const res = await fetch(
        `/api/config/import?companyId=${encodeURIComponent(company ?? '')}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ files: ['posTransactionConfig.json'] }),
        },
      );
      if (!res.ok) throw new Error('failed');
      refreshTxnModules();
      refreshModules();
      const resCfg = await fetch('/api/pos_txn_config', { credentials: 'include' });
      const data = resCfg.ok ? await resCfg.json() : {};
      setConfigs(data);
      addToast('Imported', 'success');
    } catch (err) {
      addToast(`Import failed: ${err.message}`, 'error');
    }
  }

  function handleAddCalc() {
    setConfig((c) => ({
      ...c,
      calcFields: [
        ...c.calcFields,
        {
          name: `Map${c.calcFields.length + 1}`,
          cells: [
            config.masterTable,
            ...c.tables.map((t) => t.table),
          ].map((tbl) => ({ table: tbl, field: '', agg: '' })),
        },
      ],
    }));
  }

  function updateCalc(rowIdx, colIdx, key, value) {
    setConfig((c) => ({
      ...c,
      calcFields: c.calcFields.map((row, r) =>
        r === rowIdx
          ? { ...row, cells: row.cells.map((cell, cIdx) => (cIdx === colIdx ? { ...cell, [key]: value } : cell)) }
          : row,
      ),
    }));
  }

  function removeCalc(idx) {
    setConfig((c) => ({
      ...c,
      calcFields: c.calcFields.filter((_, i) => i !== idx),
    }));
  }

  function handleAddPos() {
    setConfig((c) => ({
      ...c,
      posFields: [
        ...c.posFields,
        {
          name: `PF${c.posFields.length + 1}`,
          parts: [{ table: c.masterTable, agg: '=', field: '' }],
        },
      ],
    }));
  }

  function addPosPart(idx) {
    setConfig((c) => ({
      ...c,
      posFields: c.posFields.map((f, i) =>
        i === idx
          ? { ...f, parts: [...f.parts, { table: c.masterTable, agg: '+', field: '' }] }
          : f,
      ),
    }));
  }

  function updatePos(idx, partIdx, key, value) {
    setConfig((c) => ({
      ...c,
      posFields: c.posFields.map((f, i) => {
        if (i !== idx) return f;
        if (partIdx === null) return { ...f };
        return {
          ...f,
          parts: f.parts.map((p, j) => (j === partIdx ? { ...p, [key]: value } : p)),
        };
      }),
    }));
  }

  function removePos(idx) {
    setConfig((c) => ({
      ...c,
      posFields: c.posFields.filter((_, i) => i !== idx),
    }));
  }

  function removePosPart(idx, partIdx) {
    setConfig((c) => ({
      ...c,
      posFields: c.posFields.map((f, i) =>
        i === idx ? { ...f, parts: f.parts.filter((_, j) => j !== partIdx) } : f,
      ),
    }));
  }

  return (
    <div>
      <h2>POS Transaction Config</h2>
      <div style={{ marginBottom: '1rem' }}>
        <select value={name} onChange={(e) => loadConfig(e.target.value)}>
          <option value="">-- select config --</option>
          {Object.keys(configs).map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        <input
          type="text"
          placeholder="Config name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{ marginLeft: '0.5rem' }}
        />
        {name && (
          <button onClick={handleDelete} style={{ marginLeft: '0.5rem' }}>
            Delete
          </button>
        )}
      </div>
      <div style={{ marginBottom: '1rem' }}>
        <label style={{ marginRight: '0.5rem' }}>
          Label:
          <input
            type="text"
            value={config.label}
            onChange={(e) => setConfig((c) => ({ ...c, label: e.target.value }))}
            style={{ marginLeft: '0.25rem' }}
          />
        </label>
      </div>
      <div style={{ marginBottom: '1rem' }}>
        <label>
          Master Table:{' '}
          <select
            value={config.masterTable}
            onChange={(e) => {
              const tbl = e.target.value;
              setConfig((c) => {
                const idx = c.tables.findIndex((t) => t.table === tbl);
                let tables = c.tables;
                let masterForm = '';
                if (idx !== -1) {
                  masterForm = c.tables[idx].form || '';
                  tables = c.tables.filter((_, i) => i !== idx);
                }
                return {
                  ...c,
                  masterTable: tbl,
                  masterForm,
                  tables,
                  calcFields: c.calcFields.map((row) => ({
                    ...row,
                    cells: row.cells.map((cell, i) =>
                      i === 0 ? { ...cell, table: tbl } : cell,
                    ),
                  })),
                  posFields: c.posFields.map((p) => ({
                    ...p,
                    parts: p.parts.map((pt) => ({ ...pt, table: tbl })),
                  })),
                };
              });
            }}
          >
            <option value="">-- select table --</option>
            {config.masterTable &&
              !config.tables.some((t) => t.table === config.masterTable) && (
                <option value={config.masterTable}>{config.masterTable}</option>
              )}
            {config.tables.map((t, i) => (
              <option key={i} value={t.table}>
                {t.table}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div>
        <h3>Form Configuration</h3>
        <table className="pos-config-grid" style={{ borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th></th>
              <th>
                {config.masterTable || 'Master'}{' '}
                {config.masterTable && (
                  <button onClick={() => removeMaster()}>x</button>
                )}
              </th>
              {config.tables.map((t, idx) => (
                <th key={idx} style={{ borderBottom: '1px solid #ccc', padding: '4px' }}>
                  {t.form || 'New'}{' '}
                  <button onClick={() => removeColumn(idx)}>x</button>
                </th>
              ))}
              <th>
                <button onClick={addColumn}>Add</button>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Transaction Form</td>
              <td style={{ padding: '4px' }}>
                <select
                  value={config.masterForm}
                  onChange={(e) => {
                    const form = e.target.value;
                    const tbl = formToTable[form] || config.masterTable;
                    setConfig((c) => ({
                      ...c,
                      masterForm: form,
                      masterTable: tbl,
                      calcFields: c.calcFields.map((row) => ({
                        ...row,
                        cells: row.cells.map((cell, i) =>
                          i === 0 ? { ...cell, table: tbl } : cell,
                        ),
                      })),
                      posFields: c.posFields.map((p) => ({
                        ...p,
                        parts: p.parts.map((pt) => ({ ...pt, table: tbl })),
                      })),
                    }));
                  }}
                >
                  <option value="">-- select --</option>
                  {(formOptions[config.masterTable] || formNames).map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </td>
              {config.tables.map((t, idx) => (
                <td key={idx} style={{ padding: '4px' }}>
                  <select
                    value={t.form}
                    onChange={(e) => updateColumn(idx, 'form', e.target.value)}
                  >
                    <option value="">-- select --</option>
                    {formNames.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </td>
              ))}
            </tr>
            <tr>
              <td>Type</td>
              <td style={{ padding: '4px' }}>
                <select
                  value={config.masterType}
                  onChange={(e) =>
                    setConfig((c) => ({ ...c, masterType: e.target.value }))
                  }
                >
                  <option value="single">Single</option>
                  <option value="multi">Multi</option>
                </select>
              </td>
              {config.tables.map((t, idx) => (
                <td key={idx} style={{ padding: '4px' }}>
                  <select
                    value={t.type}
                    onChange={(e) => updateColumn(idx, 'type', e.target.value)}
                  >
                    <option value="single">Single</option>
                    <option value="multi">Multi</option>
                  </select>
                </td>
              ))}
            </tr>
            <tr>
              <td>Position</td>
              <td style={{ padding: '4px' }}>
                <select
                  value={config.masterPosition}
                  onChange={(e) =>
                    setConfig((c) => ({ ...c, masterPosition: e.target.value }))
                  }
                >
                  <option value="top_row">top_row</option>
                  <option value="upper_left">upper_left</option>
                  <option value="upper_right">upper_right</option>
                  <option value="left">left</option>
                  <option value="right">right</option>
                  <option value="lower_left">lower_left</option>
                  <option value="lower_right">lower_right</option>
                  <option value="bottom_row">bottom_row</option>
                  <option value="hidden">hidden</option>
                </select>
              </td>
              {config.tables.map((t, idx) => (
                <td key={idx} style={{ padding: '4px' }}>
                  <select
                    value={t.position}
                    onChange={(e) => updateColumn(idx, 'position', e.target.value)}
                  >
                    <option value="top_row">top_row</option>
                    <option value="upper_left">upper_left</option>
                    <option value="upper_right">upper_right</option>
                    <option value="left">left</option>
                    <option value="right">right</option>
                    <option value="lower_left">lower_left</option>
                    <option value="lower_right">lower_right</option>
                    <option value="bottom_row">bottom_row</option>
                    <option value="hidden">hidden</option>
                 </select>
                </td>
              ))}
            </tr>
            <tr>
              <td>View</td>
              <td style={{ padding: '4px' }}>
                <select
                  value={config.masterView}
                  onChange={(e) =>
                    setConfig((c) => ({ ...c, masterView: e.target.value }))
                  }
                >
                  <option value="fitted">Fitted</option>
                  <option value="row">Row</option>
                  <option value="table">Table</option>
                </select>
              </td>
              {config.tables.map((t, idx) => (
                <td key={idx} style={{ padding: '4px' }}>
                  <select
                    value={t.view || 'fitted'}
                    onChange={(e) => updateColumn(idx, 'view', e.target.value)}
                  >
                    <option value="fitted">Fitted</option>
                    <option value="row">Row</option>
                    <option value="table">Table</option>
                  </select>
                </td>
              ))}
            </tr>
            {config.calcFields.map((row, rIdx) => (
              <tr key={row.name || rIdx}>
                <td>
                  {row.name || `Map${rIdx + 1}`}{' '}
                  <button onClick={() => removeCalc(rIdx)}>x</button>
                </td>
                {row.cells.map((cell, cIdx) => (
                  <td key={cIdx} style={{ padding: '4px' }}>
                    <select
                      value={cell.agg}
                      onChange={(e) => updateCalc(rIdx, cIdx, 'agg', e.target.value)}
                    >
                      <option value="">-- none --</option>
                      <option value="SUM">SUM</option>
                      <option value="AVG">AVG</option>
                    </select>
                    <select
                      value={cell.field}
                      onChange={(e) => updateCalc(rIdx, cIdx, 'field', e.target.value)}
                      style={{ marginLeft: '0.5rem' }}
                    >
                      <option value="">-- field --</option>
                      {(tableColumns[cIdx === 0 ? config.masterTable : config.tables[cIdx - 1]?.table] || []).map((f) => (
                        <option key={f} value={f}>
                          {f}
                        </option>
                      ))}
                    </select>
                  </td>
                ))}
              </tr>
            ))}
            <tr>
              <td>
                <button onClick={handleAddCalc}>Add Mapping</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div style={{ marginTop: '1rem' }}>
        <h3>POS-only Fields</h3>
        {config.posFields.map((f, idx) => (
          <div key={idx} style={{ marginBottom: '0.5rem' }}>
            <strong>{f.name}</strong>
            {f.parts.map((p, pIdx) => (
              <span key={pIdx} style={{ marginLeft: '0.5rem' }}>
                {pIdx > 0 && (
                  <select
                    value={p.agg}
                    onChange={(e) => updatePos(idx, pIdx, 'agg', e.target.value)}
                    style={{ marginRight: '0.25rem' }}
                  >
                    <option value="=">=</option>
                    <option value="+">+</option>
                    <option value="-">-</option>
                    <option value="*">*</option>
                    <option value="/">/</option>
                    <option value="SUM">SUM</option>
                    <option value="AVG">AVG</option>
                  </select>
                )}
                <select
                  value={p.field}
                  onChange={(e) => updatePos(idx, pIdx, 'field', e.target.value)}
                >
                  <option value="">-- field --</option>
                  {(tableColumns[config.masterTable] || []).map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <button onClick={() => removePosPart(idx, pIdx)}>x</button>
              </span>
            ))}
            <button onClick={() => addPosPart(idx)} style={{ marginLeft: '0.5rem' }}>
              Add field
            </button>
            <button onClick={() => removePos(idx)} style={{ marginLeft: '0.5rem' }}>
              Remove
            </button>
          </div>
        ))}
        <button onClick={handleAddPos}>Add POS Field</button>
      </div>
      <div style={{ marginTop: '1rem' }}>
        <h3>Status Mapping</h3>
        <div style={{ marginBottom: '0.5rem' }}>
          <label>
            Status Table:
            <select
              value={config.statusField.table}
              onChange={(e) =>
                setConfig((c) => ({
                  ...c,
                  statusField: { ...c.statusField, table: e.target.value },
                }))
              }
            >
              <option value="">-- select table --</option>
              {tables.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
        </div>
        <select
          value={config.statusField.field}
          onChange={(e) =>
            setConfig((c) => ({
              ...c,
              statusField: { ...c.statusField, field: e.target.value },
            }))
          }
        >
          <option value="">-- status field --</option>
          {(tableColumns[config.masterTable] || []).map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          value={config.statusField.created}
          onChange={(e) =>
            setConfig((c) => ({
              ...c,
              statusField: { ...c.statusField, created: e.target.value },
            }))
          }
          style={{ marginLeft: '0.5rem' }}
        >
          <option value="">-- Created --</option>
          {statusOptions.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <select
          value={config.statusField.beforePost}
          onChange={(e) =>
            setConfig((c) => ({
              ...c,
              statusField: { ...c.statusField, beforePost: e.target.value },
            }))
          }
          style={{ marginLeft: '0.5rem' }}
        >
          <option value="">-- Before Post --</option>
          {statusOptions.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <select
          value={config.statusField.posted}
          onChange={(e) =>
            setConfig((c) => ({
              ...c,
              statusField: { ...c.statusField, posted: e.target.value },
            }))
          }
          style={{ marginLeft: '0.5rem' }}
        >
          <option value="">-- Posted --</option>
          {statusOptions.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>
      <div style={{ marginTop: '1rem' }}>
        <button onClick={handleImport} style={{ marginRight: '0.5rem' }}>
          Import Defaults
        </button>
        <button onClick={handleSave}>Save</button>
      </div>
    </div>
  );
}
