import React, { useState, useEffect, useContext } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext.jsx';

export default function FinanceTransactions({ defaultName = '', hideSelector = false }) {
  const { user, company } = useContext(AuthContext);
  const [configs, setConfigs] = useState({});
  const [searchParams, setSearchParams] = useSearchParams();
  const [name, setName] = useState(() => defaultName || searchParams.get('name') || '');
  const [table, setTable] = useState('');
  const [columns, setColumns] = useState([]);
  const [rows, setRows] = useState([]);
  const [config, setConfig] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [formVals, setFormVals] = useState({});
  const [editingId, setEditingId] = useState(null);

  useEffect(() => {
    if (defaultName) setName(defaultName);
  }, [defaultName]);

  useEffect(() => {
    if (defaultName) return; // keep URL clean when using fixed name
    if (name) {
      setSearchParams({ name });
    } else {
      setSearchParams({});
    }
  }, [name, setSearchParams, defaultName]);

  useEffect(() => {
    fetch('/api/transaction_forms', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : {}))
      .then((data) => {
        setConfigs(data);
        if (name && data[name]) setTable(data[name].table ?? data[name]);
      })
      .catch(() => setConfigs({}));
  }, []);

  useEffect(() => {
    if (name && configs[name]) setTable(configs[name].table ?? configs[name]);
  }, [name, configs]);

  useEffect(() => {
    if (!table || !name) return;
    fetch(`/api/tables/${encodeURIComponent(table)}/columns`, { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : []))
      .then((cols) => setColumns(cols.map((c) => c.name || c)))
      .catch(() => setColumns([]));
    fetch(`/api/transaction_forms?table=${encodeURIComponent(table)}&name=${encodeURIComponent(name)}`, { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : {}))
      .then((cfg) => setConfig(cfg))
      .catch(() => setConfig(null));
  }, [table, name]);

  useEffect(() => {
    if (table && name) loadRows();
  }, [table, name]);

  async function loadRows() {
    const res = await fetch(`/api/tables/${encodeURIComponent(table)}`, { credentials: 'include' });
    const data = res.ok ? await res.json() : {};
    setRows(data.rows || []);
  }

  function openAdd() {
    const vals = {};
    columns.forEach((c) => {
      let v = (config?.defaultValues || {})[c] || '';
      if (config?.userIdFields?.includes(c) && user?.empid) v = user.empid;
      if (config?.branchIdFields?.includes(c) && company?.branch_id !== undefined) v = company.branch_id;
      if (config?.companyIdFields?.includes(c) && company?.company_id !== undefined) v = company.company_id;
      vals[c] = v;
    });
    setEditingId(null);
    setFormVals(vals);
    setShowForm(true);
  }

  function openEdit(row) {
    const vals = {};
    columns.forEach((c) => {
      vals[c] = row[c] ?? '';
    });
    setEditingId(row.id);
    setFormVals(vals);
    setShowForm(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const required = config?.requiredFields || [];
    for (const f of required) {
      if (!formVals[f]) {
        alert('Please fill ' + f);
        return;
      }
    }
    const data = { ...formVals };
    if (editingId == null) {
      await fetch(`/api/tables/${encodeURIComponent(table)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data),
      });
    } else {
      await fetch(`/api/tables/${encodeURIComponent(table)}/${encodeURIComponent(editingId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data),
      });
    }
    setShowForm(false);
    await loadRows();
  }

  async function handleDelete(id) {
    if (!window.confirm('Delete transaction?')) return;
    await fetch(`/api/tables/${encodeURIComponent(table)}/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    loadRows();
  }

  const fields = config?.visibleFields?.length ? config.visibleFields : columns;
  const transactionNames = Object.keys(configs);

  if (transactionNames.length === 0) {
    return (
      <div>
        <h2>{defaultName || 'Finance Transactions'}</h2>
        <p>No transactions configured.</p>
      </div>
    );
  }

  return (
    <div>
      <h2>{defaultName || 'Finance Transactions'}</h2>
      {!hideSelector && (
        <div style={{ marginBottom: '0.5rem' }}>
          <select value={name} onChange={(e) => setName(e.target.value)}>
            <option value="">-- select transaction --</option>
            {transactionNames.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          {name && (
            <button onClick={openAdd} style={{ marginLeft: '0.5rem' }}>
              Add
            </button>
          )}
        </div>
      )}
      {hideSelector && name && (
        <div style={{ marginBottom: '0.5rem' }}>
          <button onClick={openAdd}>Add</button>
        </div>
      )}
      {name && (
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr>
              {fields.map((f) => (
                <th key={f} style={{ border: '1px solid #ccc', padding: '4px' }}>
                  {f}
                </th>
              ))}
              <th style={{ border: '1px solid #ccc', padding: '4px' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                {fields.map((f) => (
                  <td key={f} style={{ border: '1px solid #ccc', padding: '4px' }}>
                    {String(r[f] ?? '')}
                  </td>
                ))}
                <td style={{ border: '1px solid #ccc', padding: '4px' }}>
                  <button onClick={() => openEdit(r)} style={{ marginRight: '0.25rem' }}>
                    Edit
                  </button>
                  <button onClick={() => handleDelete(r.id)}>Delete</button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={fields.length + 1} style={{ textAlign: 'center', padding: '4px' }}>
                  No data
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
      {showForm && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              backgroundColor: '#fff',
              padding: '1rem',
              borderRadius: '4px',
              maxHeight: '90vh',
              overflowY: 'auto',
            }}
          >
            <h3 style={{ marginTop: 0 }}>{editingId == null ? 'Add Transaction' : 'Edit Transaction'}</h3>
            <form onSubmit={handleSubmit}>
              {fields.map((f) => (
                <div key={f} style={{ marginBottom: '0.5rem' }}>
                  <label style={{ display: 'block', marginBottom: '0.25rem' }}>{f}</label>
                  <input
                    type="text"
                    value={formVals[f] ?? ''}
                    onChange={(e) => setFormVals((v) => ({ ...v, [f]: e.target.value }))}
                    required={config?.requiredFields?.includes(f)}
                    style={{ width: '100%', padding: '0.5rem' }}
                  />
                </div>
              ))}
              <div style={{ textAlign: 'right' }}>
                <button type="button" onClick={() => setShowForm(false)} style={{ marginRight: '0.5rem' }}>
                  Cancel
                </button>
                <button type="submit">Save</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
