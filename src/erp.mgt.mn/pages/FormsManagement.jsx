import React, { useEffect, useState } from 'react';
import { useModules } from '../hooks/useModules.js';
import { refreshTxnModules } from '../hooks/useTxnModules.js';
import AsyncSearchSelect from '../components/AsyncSearchSelect.jsx';

export default function FormsManagement() {
  const [tables, setTables] = useState([]);
  const [table, setTable] = useState('');
  const [names, setNames] = useState([]);
  const [name, setName] = useState('');
  const [dupName, setDupName] = useState('');
  const [moduleKey, setModuleKey] = useState('');
  const [branches, setBranches] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [columns, setColumns] = useState([]);
  const modules = useModules();
  const [config, setConfig] = useState({
    visibleFields: [],
    requiredFields: [],
    defaultValues: {},
    editableDefaultFields: [],
    userIdFields: [],
    branchIdFields: [],
    companyIdFields: [],
    dateField: '',
    emailField: '',
    imagenameField: '',
    printField: '',
    transactionTypeField: '',
    transactionTypeValue: '',
    allowedBranches: [],
    allowedDepartments: [],
  });

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
  }, []);

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
            visibleFields: filtered[name].visibleFields || [],
            requiredFields: filtered[name].requiredFields || [],
            defaultValues: filtered[name].defaultValues || {},
            editableDefaultFields: filtered[name].editableDefaultFields || [],
            userIdFields: filtered[name].userIdFields || [],
            branchIdFields: filtered[name].branchIdFields || [],
            companyIdFields: filtered[name].companyIdFields || [],
            dateField: filtered[name].dateField || '',
            emailField: filtered[name].emailField || '',
            imagenameField: filtered[name].imagenameField || '',
            printField: filtered[name].printField || '',
            transactionTypeField: filtered[name].transactionTypeField || '',
            transactionTypeValue: filtered[name].transactionTypeValue || '',
            allowedBranches: (filtered[name].allowedBranches || []).map(String),
            allowedDepartments: (filtered[name].allowedDepartments || []).map(String),
          });
        } else {
          setName('');
          setConfig({
            visibleFields: [],
            requiredFields: [],
            defaultValues: {},
            editableDefaultFields: [],
            userIdFields: [],
            branchIdFields: [],
            companyIdFields: [],
            dateField: '',
            emailField: '',
            imagenameField: '',
            printField: '',
            transactionTypeField: '',
            transactionTypeValue: '',
            allowedBranches: [],
            allowedDepartments: [],
          });
        }
      })
      .catch(() => {
        setNames([]);
        setName('');
        setConfig({
          visibleFields: [],
          requiredFields: [],
          defaultValues: {},
          editableDefaultFields: [],
          userIdFields: [],
          branchIdFields: [],
          companyIdFields: [],
          dateField: '',
          emailField: '',
          imagenameField: '',
          printField: '',
          transactionTypeField: '',
          transactionTypeValue: '',
          allowedBranches: [],
          allowedDepartments: [],
        });
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
          visibleFields: cfg.visibleFields || [],
          requiredFields: cfg.requiredFields || [],
          defaultValues: cfg.defaultValues || {},
          editableDefaultFields: cfg.editableDefaultFields || [],
          userIdFields: cfg.userIdFields || [],
          branchIdFields: cfg.branchIdFields || [],
          companyIdFields: cfg.companyIdFields || [],
          dateField: cfg.dateField || '',
          emailField: cfg.emailField || '',
          imagenameField: cfg.imagenameField || '',
          printField: cfg.printField || '',
          transactionTypeField: cfg.transactionTypeField || '',
          transactionTypeValue: cfg.transactionTypeValue || '',
          allowedBranches: (cfg.allowedBranches || []).map(String),
          allowedDepartments: (cfg.allowedDepartments || []).map(String),
        });
      })
      .catch(() => {
        setConfig({
          visibleFields: [],
          requiredFields: [],
          defaultValues: {},
          editableDefaultFields: [],
          userIdFields: [],
          branchIdFields: [],
          companyIdFields: [],
          allowedBranches: [],
          allowedDepartments: [],
        });
        setModuleKey('');
      });
  }, [table, name, names]);

  useEffect(() => {
    if (!table || !dupName) return;
    if (!names.includes(dupName)) return;
    fetch(`/api/transaction_forms?table=${encodeURIComponent(table)}&name=${encodeURIComponent(dupName)}`, { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : {}))
      .then((cfg) => {
        setConfig({
          visibleFields: cfg.visibleFields || [],
          requiredFields: cfg.requiredFields || [],
          defaultValues: cfg.defaultValues || {},
          editableDefaultFields: cfg.editableDefaultFields || [],
          userIdFields: cfg.userIdFields || [],
          branchIdFields: cfg.branchIdFields || [],
          companyIdFields: cfg.companyIdFields || [],
          dateField: cfg.dateField || '',
          emailField: cfg.emailField || '',
          imagenameField: cfg.imagenameField || '',
          printField: cfg.printField || '',
          transactionTypeField: cfg.transactionTypeField || '',
          transactionTypeValue: cfg.transactionTypeValue || '',
          allowedBranches: (cfg.allowedBranches || []).map(String),
          allowedDepartments: (cfg.allowedDepartments || []).map(String),
        });
      })
      .catch(() => {});
  }, [dupName, table, names]);

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
    if (cfg.transactionTypeField && cfg.transactionTypeValue) {
      cfg.defaultValues = {
        ...cfg.defaultValues,
        [cfg.transactionTypeField]: cfg.transactionTypeValue,
      };
    }
    await fetch('/api/transaction_forms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        table,
        name,
        config: cfg,
      }),
    });
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
    setConfig({
      visibleFields: [],
      requiredFields: [],
      defaultValues: {},
      editableDefaultFields: [],
      userIdFields: [],
      branchIdFields: [],
      companyIdFields: [],
      dateField: '',
      emailField: '',
      imagenameField: '',
      printField: '',
      transactionTypeField: '',
      transactionTypeValue: '',
      allowedBranches: [],
      allowedDepartments: [],
    });
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
              value={dupName}
              onChange={(e) => setDupName(e.target.value)}
              style={{ marginLeft: '0.5rem' }}
            >
              <option value="">Duplicate from...</option>
              {names.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
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
              value={config.transactionTypeField}
              onChange={(e) =>
                setConfig((c) => ({ ...c, transactionTypeField: e.target.value }))
              }
              style={{ marginLeft: '0.5rem' }}
            >
              <option value="">-- trans type field --</option>
              {columns.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <AsyncSearchSelect
              table="code_transaction"
              searchColumn="tr_id"
              labelFields={["tr_name"]}
              value={config.transactionTypeValue}
              onChange={(val) => setConfig((c) => ({ ...c, transactionTypeValue: val }))}
              style={{ marginLeft: '0.5rem', width: '150px' }}
            />
            
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
                <th style={{ border: '1px solid #ccc', padding: '4px' }}>Date Field</th>
                <th style={{ border: '1px solid #ccc', padding: '4px' }}>Email Field</th>
                <th style={{ border: '1px solid #ccc', padding: '4px' }}>Image Name</th>
                <th style={{ border: '1px solid #ccc', padding: '4px' }}>Print Field</th>
                <th style={{ border: '1px solid #ccc', padding: '4px' }}>User ID</th>
                <th style={{ border: '1px solid #ccc', padding: '4px' }}>Branch ID</th>
                <th style={{ border: '1px solid #ccc', padding: '4px' }}>Company ID</th>
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
                  <td style={{ border: '1px solid #ccc', padding: '4px', textAlign: 'center' }}>
                    <input
                      type="radio"
                      name="dateField"
                      checked={config.dateField === col}
                      onChange={() => setConfig((c) => ({ ...c, dateField: col }))}
                    />
                  </td>
                  <td style={{ border: '1px solid #ccc', padding: '4px', textAlign: 'center' }}>
                    <input
                      type="radio"
                      name="emailField"
                      checked={config.emailField === col}
                      onChange={() => setConfig((c) => ({ ...c, emailField: col }))}
                    />
                  </td>
                  <td style={{ border: '1px solid #ccc', padding: '4px', textAlign: 'center' }}>
                    <input
                      type="radio"
                      name="imagenameField"
                      checked={config.imagenameField === col}
                      onChange={() => setConfig((c) => ({ ...c, imagenameField: col }))}
                    />
                  </td>
                  <td style={{ border: '1px solid #ccc', padding: '4px', textAlign: 'center' }}>
                    <input
                      type="radio"
                      name="printField"
                      checked={config.printField === col}
                      onChange={() => setConfig((c) => ({ ...c, printField: col }))}
                    />
                  </td>
                  <td style={{ border: '1px solid #ccc', padding: '4px', textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={config.userIdFields.includes(col)}
                      onChange={() =>
                        setConfig((c) => {
                          const set = new Set(c.userIdFields);
                          set.has(col) ? set.delete(col) : set.add(col);
                          return { ...c, userIdFields: Array.from(set) };
                        })
                      }
                    />
                  </td>
                  <td style={{ border: '1px solid #ccc', padding: '4px', textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={config.branchIdFields.includes(col)}
                      onChange={() =>
                        setConfig((c) => {
                          const set = new Set(c.branchIdFields);
                          set.has(col) ? set.delete(col) : set.add(col);
                          return { ...c, branchIdFields: Array.from(set) };
                        })
                      }
                    />
                  </td>
                  <td style={{ border: '1px solid #ccc', padding: '4px', textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={config.companyIdFields.includes(col)}
                      onChange={() =>
                        setConfig((c) => {
                          const set = new Set(c.companyIdFields);
                          set.has(col) ? set.delete(col) : set.add(col);
                          return { ...c, companyIdFields: Array.from(set) };
                        })
                      }
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
          </div>
          <div style={{ marginTop: '1rem' }}>
            <button onClick={handleSave}>Save Configuration</button>
          </div>
        </div>
      )}
    </div>
  );
}
