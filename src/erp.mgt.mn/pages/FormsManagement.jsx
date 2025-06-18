import React, { useEffect, useState } from 'react';

export default function FormsManagement() {
  const [tables, setTables] = useState([]);
  const [table, setTable] = useState('');
  const [columns, setColumns] = useState([]);
  const [config, setConfig] = useState({
    visibleFields: [],
    requiredFields: [],
    defaultValues: {},
    userIdField: '',
    branchIdField: '',
    companyIdField: '',
  });

  useEffect(() => {
    fetch('/api/tables', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setTables(data))
      .catch(() => setTables([]));
  }, []);

  useEffect(() => {
    if (!table) return;
    fetch(`/api/tables/${encodeURIComponent(table)}/columns`, { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : []))
      .then((cols) => setColumns(cols.map((c) => c.name || c)))
      .catch(() => setColumns([]));
    fetch(`/api/transaction_forms?table=${encodeURIComponent(table)}`, { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : {}))
      .then((cfg) => setConfig({
        visibleFields: cfg.visibleFields || [],
        requiredFields: cfg.requiredFields || [],
        defaultValues: cfg.defaultValues || {},
        userIdField: cfg.userIdField || '',
        branchIdField: cfg.branchIdField || '',
        companyIdField: cfg.companyIdField || '',
      }))
      .catch(() => {
        setConfig({
          visibleFields: [],
          requiredFields: [],
          defaultValues: {},
          userIdField: '',
          branchIdField: '',
          companyIdField: '',
        });
      });
  }, [table]);

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

  async function handleSave() {
    await fetch('/api/transaction_forms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ table, config }),
    });
    alert('Saved');
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
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead>
              <tr>
                <th style={{ border: '1px solid #ccc', padding: '4px' }}>Field</th>
                <th style={{ border: '1px solid #ccc', padding: '4px' }}>Visible</th>
                <th style={{ border: '1px solid #ccc', padding: '4px' }}>Required</th>
                <th style={{ border: '1px solid #ccc', padding: '4px' }}>Default</th>
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
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ marginTop: '1rem' }}>
            <label>
              User ID field:{' '}
              <select
                value={config.userIdField}
                onChange={(e) => setConfig((c) => ({ ...c, userIdField: e.target.value }))}
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
              Branch ID field:{' '}
              <select
                value={config.branchIdField}
                onChange={(e) => setConfig((c) => ({ ...c, branchIdField: e.target.value }))}
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
              Company ID field:{' '}
              <select
                value={config.companyIdField}
                onChange={(e) => setConfig((c) => ({ ...c, companyIdField: e.target.value }))}
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
          <div style={{ marginTop: '1rem' }}>
            <button onClick={handleSave}>Save Configuration</button>
          </div>
        </div>
      )}
    </div>
  );
}
