import React, { useEffect, useState } from 'react';
import { useModules } from '../hooks/useModules.js';
import { refreshTxnModules } from '../hooks/useTxnModules.js';

export default function FormsManagement() {
  const [tables, setTables] = useState([]);
  const [table, setTable] = useState('');
  const [names, setNames] = useState([]);
  const [name, setName] = useState('');
  const [moduleKey, setModuleKey] = useState('');
  const [branches, setBranches] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [columns, setColumns] = useState([]);
  const [duplicateFrom, setDuplicateFrom] = useState('');
  const [transTypes, setTransTypes] = useState([]);
  const modules = useModules();
  const EMPTY_CFG = {
    visibleFields: [],
    requiredFields: [],
    defaultValues: {},
    editableDefaultFields: [],
    userIdFields: [],
    branchIdFields: [],
    companyIdFields: [],
    allowedBranches: [],
    allowedDepartments: [],
    dateField: '',
    transactionTypeField: '',
    transactionTypeValue: '',
    imageNameFields: [],
  };

  const [config, setConfig] = useState({ ...EMPTY_CFG });

  useEffect(() => {
    fetch('/api/tables', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setTables(data))
      .catch(() => setTables([]));

    fetch('/api/tables/code_branches?perPage=500', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : { rows: [] }))
      .then((data) => setBranches(data.rows || []))
      .catch(() => setBranches([]));

    fetch('/api/tables/code_department?perPage=500', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : { rows: [] }))
      .then((data) => setDepartments(data.rows || []))
      .catch(() => setDepartments([]));

    fetch('/api/tables/code_transaction?perPage=500', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : { rows: [] }))
      .then((data) =>
          setTransTypes(
            (data.rows || []).map((r) => ({
              value: r.UITransType,
              label: r.UITransTypeName,
            })),
          ),
        )
        .catch(() => setTransTypes([]));
  }, []);

  useEffect(() => {
    if (!table || !duplicateFrom) return;
    fetch(
      `/api/transaction_forms?table=${encodeURIComponent(table)}&name=${encodeURIComponent(
        duplicateFrom,
      )}`,
      { credentials: 'include' },
    )
      .then((res) => (res.ok ? res.json() : null))
      .then((cfg) => {
        if (cfg) setConfig({ ...EMPTY_CFG, ...cfg });
      })
      .catch(() => {});
  }, [duplicateFrom, table]);

  useEffect(() => {
    if (!table) return;
    fetch(`/api/tables/${encodeURIComponent(table)}/columns`, { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : []))
      .then((cols) => setColumns(cols.map((c) => c.name || c)))
      .catch(() => setColumns([]));
    const params = new URLSearchParams({ table, moduleKey });
    fetch(`/api/transaction_forms?${params.toString()}`, { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : {}))
      .then((data) => {
        const filtered = {};
        Object.entries(data).forEach(([n, info]) => {
          if (!info || info.moduleKey !== moduleKey) return;
          filtered[n] = info;
        });
        setNames(Object.keys(filtered));
        if (filtered[name]) {
          setModuleKey(filtered[name].moduleKey || '');
          setConfig({
            ...EMPTY_CFG,
            ...filtered[name],
            allowedBranches: (filtered[name].allowedBranches || []).map(String),
            allowedDepartments: (filtered[name].allowedDepartments || []).map(String),
          });
        } else {
          setName('');
          setConfig({ ...EMPTY_CFG });
        }
      })
      .catch(() => {
        setNames([]);
        setName('');
        setConfig({ ...EMPTY_CFG });
        setModuleKey('');
      });
  }, [table, moduleKey]);

  useEffect(() => {
    if (!table || !name || !names.includes(name)) return;
    fetch(`/api/transaction_forms?table=${encodeURIComponent(table)}&name=${encodeURIComponent(name)}`, { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : {}))
      .then((cfg) => {
        setModuleKey(cfg.moduleKey || '');
        setConfig({
          ...EMPTY_CFG,
          ...cfg,
          allowedBranches: (cfg.allowedBranches || []).map(String),
          allowedDepartments: (cfg.allowedDepartments || []).map(String),
        });
      })
      .catch(() => {
        setConfig({ ...EMPTY_CFG });
        setModuleKey('');
      });
  }, [table, name, names]);

  useEffect(() => {
    if (!table || !name) return;
    if (!names.includes(name)) {
      setConfig({ ...EMPTY_CFG });
    }
  }, [table, name, names]);

  // If a user selects a predefined transaction name, the associated module
  // parent key will be applied automatically based on the stored
  // configuration retrieved above. The module slug and sidebar/header flags
  // were previously set here but have been removed as they are no longer
  // managed from this page.

  function toggleVisible(field) {
    setConfig((c) => {
      const vis = new Set(c.visibleFields);
      vis.has(field) ? vis.delete(field) : vis.add(field);
      return { ...c, visibleFields: Array.from(vis) };
    });
  }

  function toggleRequired(field) {
    setConfig((c) => {
      const req = new Set(c.requiredFields);
      req.has(field) ? req.delete(field) : req.add(field);
      return { ...c, requiredFields: Array.from(req) };
    });
  }

  function changeDefault(field, value) {
    setConfig((c) => ({
      ...c,
      defaultValues: { ...c.defaultValues, [field]: value },
    }));
  }

  function toggleEditable(field) {
    setConfig((c) => {
      const set = new Set(c.editableDefaultFields);
      set.has(field) ? set.delete(field) : set.add(field);
      return { ...c, editableDefaultFields: Array.from(set) };
    });
  }

  async function handleSave() {
    if (!name) {
      alert('Please enter transaction name');
      return;
    }
    const cfg = {
      ...config,
      moduleKey,
      allowedBranches: config.allowedBranches.map((b) => Number(b)).filter((b) => !Number.isNaN(b)),
      allowedDepartments: config.allowedDepartments.map((d) => Number(d)).filter((d) => !Number.isNaN(d)),
    };
    const res = await fetch('/api/transaction_forms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        table,
        name,
        config: cfg,
      }),
    });
    if (!res.ok) {
      alert('Save failed');
      return;
    }
    refreshTxnModules();
    alert('Saved');
    if (!names.includes(name)) setNames((n) => [...n, name]);
  }

  async function handleDelete() {
    if (!table || !name) return;
    if (!window.confirm('Delete transaction configuration?')) return;
    await fetch(`/api/transaction_forms?table=${encodeURIComponent(table)}&name=${encodeURIComponent(name)}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    refreshTxnModules();
    setNames((n) => n.filter((x) => x !== name));
    setName('');
    setConfig({ ...EMPTY_CFG });
    setModuleKey('');
  }

  return (
    <div>
      <h2>Маягтын удирдлага</h2>
      <div style={{ marginBottom: '1rem' }}>
        <select value={table} onChange={(e) => setTable(e.target.value)}>
          <option value="">-- select table --</option>
          {tables.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>
      {table && (
        <div>
          <div style={{ marginBottom: '1rem' }}>
            <select
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={{ marginRight: '0.5rem' }}
            >
              <option value="">-- select transaction --</option>
              {names.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            <input
              type="text"
              placeholder="Transaction name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <select
              value={moduleKey}
              onChange={(e) => setModuleKey(e.target.value)}
              style={{ marginLeft: '0.5rem' }}
            >
              <option value="">-- select module --</option>
              {modules.map((m) => (
                <option key={m.module_key} value={m.module_key}>
                  {m.label}
                </option>
              ))}
            </select>

            <select
              value={duplicateFrom}
              onChange={(e) => setDuplicateFrom(e.target.value)}
              style={{ marginLeft: '0.5rem' }}
            >
              <option value="">Duplicate from...</option>
              {names.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            
            {name && (
              <button onClick={handleDelete} style={{ marginLeft: '0.5rem' }}>
                Delete
              </button>
            )}
          </div>
          <div className="table-container overflow-x-auto" style={{ maxHeight: '70vh' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead>
              <tr>
                <th style={{ border: '1px solid #ccc', padding: '4px' }}>Field</th>
                <th style={{ border: '1px solid #ccc', padding: '4px' }}>Visible</th>
                <th style={{ border: '1px solid #ccc', padding: '4px' }}>Required</th>
                <th style={{ border: '1px solid #ccc', padding: '4px' }}>Default</th>
                <th style={{ border: '1px solid #ccc', padding: '4px' }}>Editable</th>
              </tr>
            </thead>
            <tbody>
              {columns.map((col) => (
                <tr key={col}>
                  <td style={{ border: '1px solid #ccc', padding: '4px' }}>{col}</td>
                  <td style={{ border: '1px solid #ccc', padding: '4px', textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={config.visibleFields.includes(col)}
                      onChange={() => toggleVisible(col)}
                    />
                  </td>
                  <td style={{ border: '1px solid #ccc', padding: '4px', textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={config.requiredFields.includes(col)}
                      onChange={() => toggleRequired(col)}
                    />
                  </td>
                  <td style={{ border: '1px solid #ccc', padding: '4px' }}>
                    <input
                      type="text"
                      value={config.defaultValues[col] || ''}
                      onChange={(e) => changeDefault(col, e.target.value)}
                    />
                  </td>
                  <td style={{ border: '1px solid #ccc', padding: '4px', textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={config.editableDefaultFields.includes(col)}
                      onChange={() => toggleEditable(col)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          <div style={{ marginTop: '1rem' }}>
            <label>
              User ID fields:{' '}
              <select
                multiple
                size={8}
                value={config.userIdFields}
                onChange={(e) =>
                  setConfig((c) => ({
                    ...c,
                    userIdFields: Array.from(e.target.selectedOptions, (o) => o.value),
                  }))
                }
              >
                {columns.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <button type="button" onClick={() => setConfig((c) => ({ ...c, userIdFields: columns }))}>All</button>
              <button type="button" onClick={() => setConfig((c) => ({ ...c, userIdFields: [] }))}>None</button>
            </label>
            <label style={{ marginLeft: '1rem' }}>
              Branch ID fields:{' '}
              <select
                multiple
                size={8}
                value={config.branchIdFields}
                onChange={(e) =>
                  setConfig((c) => ({
                    ...c,
                    branchIdFields: Array.from(e.target.selectedOptions, (o) => o.value),
                  }))
                }
              >
                {columns.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <button type="button" onClick={() => setConfig((c) => ({ ...c, branchIdFields: columns }))}>All</button>
              <button type="button" onClick={() => setConfig((c) => ({ ...c, branchIdFields: [] }))}>None</button>
            </label>
            <label style={{ marginLeft: '1rem' }}>
              Company ID fields:{' '}
              <select
                multiple
                size={8}
                value={config.companyIdFields}
                onChange={(e) =>
                  setConfig((c) => ({
                    ...c,
                    companyIdFields: Array.from(e.target.selectedOptions, (o) => o.value),
                  }))
                }
              >
                {columns.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <button type="button" onClick={() => setConfig((c) => ({ ...c, companyIdFields: columns }))}>All</button>
              <button type="button" onClick={() => setConfig((c) => ({ ...c, companyIdFields: [] }))}>None</button>
            </label>
            <label style={{ marginLeft: '1rem' }}>
              Allowed branches:{' '}
              <select
                multiple
                size={8}
                value={config.allowedBranches}
                onChange={(e) =>
                  setConfig((c) => ({
                    ...c,
                    allowedBranches: Array.from(e.target.selectedOptions, (o) => o.value),
                  }))
                }
              >
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.code} - {b.name}
                  </option>
                ))}
              </select>
              <button type="button" onClick={() => setConfig((c) => ({ ...c, allowedBranches: branches.map((b) => String(b.id)) }))}>All</button>
              <button type="button" onClick={() => setConfig((c) => ({ ...c, allowedBranches: [] }))}>None</button>
            </label>
            <label style={{ marginLeft: '1rem' }}>
              Allowed departments:{' '}
              <select
                multiple
                size={8}
                value={config.allowedDepartments}
                onChange={(e) =>
                  setConfig((c) => ({
                    ...c,
                    allowedDepartments: Array.from(e.target.selectedOptions, (o) => o.value),
                  }))
                }
              >
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.code} - {d.name}
                  </option>
                ))}
              </select>
              <button type="button" onClick={() => setConfig((c) => ({ ...c, allowedDepartments: departments.map((d) => String(d.id)) }))}>All</button>
              <button type="button" onClick={() => setConfig((c) => ({ ...c, allowedDepartments: [] }))}>None</button>
            </label>
            <label style={{ marginLeft: '1rem' }}>
              Date field:{' '}
              <select
                value={config.dateField}
                onChange={(e) => setConfig((c) => ({ ...c, dateField: e.target.value }))}
              >
                <option value="">-- none --</option>
                {columns.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ marginLeft: '1rem' }}>
              Transaction type field:{' '}
              <select
                value={config.transactionTypeField}
                onChange={(e) => setConfig((c) => ({ ...c, transactionTypeField: e.target.value }))}
              >
                <option value="">-- none --</option>
                {columns.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ marginLeft: '1rem' }}>
              Transaction type value:{' '}
              <select
                value={config.transactionTypeValue}
                onChange={(e) => setConfig((c) => ({ ...c, transactionTypeValue: e.target.value }))}
              >
                <option value="">-- select --</option>
                {transTypes.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ marginLeft: '1rem' }}>
              Image name fields:{' '}
              <select
                multiple
                size={8}
                value={config.imageNameFields}
                onChange={(e) =>
                  setConfig((c) => ({
                    ...c,
                    imageNameFields: Array.from(e.target.selectedOptions, (o) => o.value),
                  }))
                }
              >
                {columns.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div style={{ marginTop: '1rem' }}>
            <button onClick={handleSave}>Save Configuration</button>
          </div>
        </div>
      )}
    </div>
  );
}
