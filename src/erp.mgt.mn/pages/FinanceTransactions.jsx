import React, { useState, useEffect, useContext } from 'react';
import RowFormModal from '../components/RowFormModal.jsx';
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
  const [editingId, setEditingId] = useState(null);
  const [editingRow, setEditingRow] = useState(null);
  const [page, setPage] = useState(1);
  const [perPage] = useState(10);
  const [count, setCount] = useState(0);
  const [relations, setRelations] = useState({});
  const [relationOpts, setRelationOpts] = useState({});
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(''), 3000);
    return () => clearTimeout(t);
  }, [message]);

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
  }, [table, name, page]);

  async function loadRows() {
    const params = new URLSearchParams({ page, perPage });
    const res = await fetch(`/api/tables/${encodeURIComponent(table)}?${params.toString()}`, { credentials: 'include' });
    const data = res.ok ? await res.json() : {};
    setRows(data.rows || []);
    setCount(data.count || 0);
  }

  async function loadRelations() {
    try {
      const res = await fetch(`/api/tables/${encodeURIComponent(table)}/relations`, { credentials: 'include' });
      if (!res.ok) return;
      const rels = await res.json();
      const map = {};
      rels.forEach((r) => {
        map[r.COLUMN_NAME] = { table: r.REFERENCED_TABLE_NAME, column: r.REFERENCED_COLUMN_NAME };
      });
      setRelations(map);
      const opts = {};
      for (const [col, rel] of Object.entries(map)) {
        try {
          const cfgRes = await fetch(`/api/display_fields?table=${encodeURIComponent(rel.table)}`, { credentials: 'include' });
          let cfg = null;
          if (cfgRes.ok) cfg = await cfgRes.json();
          const p = new URLSearchParams({ perPage: 500 });
          const rowsRes = await fetch(`/api/tables/${encodeURIComponent(rel.table)}?${p.toString()}`, { credentials: 'include' });
          const rowsJson = await rowsRes.json();
          if (Array.isArray(rowsJson.rows)) {
            opts[col] = rowsJson.rows.map((row) => {
              const parts = [];
              if (row[rel.column] !== undefined) parts.push(row[rel.column]);
              const display = Array.isArray(cfg?.displayFields) && cfg.displayFields.length > 0 ? cfg.displayFields : Object.keys(row).filter((f) => f !== rel.column).slice(0, 1);
              parts.push(...display.map((f) => row[f]).filter((v) => v !== undefined));
              const label = parts.length > 0 ? parts.join(' - ') : Object.values(row).slice(0, 2).join(' - ');
              return { value: row[rel.column], label };
            });
          }
        } catch {
          /* ignore */
        }
      }
      setRelationOpts(opts);
    } catch {
      setRelations({});
      setRelationOpts({});
    }
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
    setEditingRow(vals);
    loadRelations();
    setShowForm(true);
  }

  function openEdit(row) {
    const vals = {};
    columns.forEach((c) => {
      vals[c] = row[c] ?? '';
    });
    setEditingId(row.id);
    setEditingRow(vals);
    loadRelations();
    setShowForm(true);
  }

  async function handleSubmit(values) {
    const required = config?.requiredFields || [];
    for (const f of required) {
      if (!values[f]) {
        alert('Please fill ' + f);
        return;
      }
    }
    const data = { ...values };
    const url = editingId == null
      ? `/api/tables/${encodeURIComponent(table)}`
      : `/api/tables/${encodeURIComponent(table)}/${encodeURIComponent(editingId)}`;
    const method = editingId == null ? 'POST' : 'PUT';
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(data),
    });
    if (res.ok) {
      setMessage('Transaction saved successfully');
      setShowForm(false);
      setEditingRow(null);
      await loadRows();
    } else {
      let msg = 'Save failed';
      try {
        const json = await res.json();
        if (json && json.message) msg += `: ${json.message}`;
      } catch {
        /* ignore */
      }
      setMessage(msg);
    }
  }

  async function handleDelete(id) {
    if (!window.confirm('Delete transaction?')) return;
    const res = await fetch(`/api/tables/${encodeURIComponent(table)}/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    if (res.ok) {
      setMessage('Transaction deleted');
      loadRows();
      setEditingRow(null);
    } else {
      setMessage('Delete failed');
    }
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
      {message && (
        <div style={{ marginBottom: '0.5rem', color: '#065f46' }}>{message}</div>
      )}
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
        <div style={{ marginTop: '0.5rem' }}>
          <button onClick={() => setPage(1)} disabled={page === 1} style={{ marginRight: '0.25rem' }}>
            {'<<'}
          </button>
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} style={{ marginRight: '0.25rem' }}>
            {'<'}
          </button>
          <span>
            Page {page} of {Math.max(1, Math.ceil(count / perPage))}
          </span>
          <button onClick={() => setPage((p) => Math.min(Math.ceil(count / perPage), p + 1))} disabled={page >= Math.ceil(count / perPage)} style={{ marginLeft: '0.25rem' }}>
            {'>'}
          </button>
          <button onClick={() => setPage(Math.ceil(count / perPage))} disabled={page >= Math.ceil(count / perPage)} style={{ marginLeft: '0.25rem' }}>
            {'>>'}
          </button>
        </div>
      )}
      {showForm && (
        <RowFormModal
          visible={showForm}
          onCancel={() => { setShowForm(false); setEditingRow(null); }}
          onSubmit={handleSubmit}
          columns={fields}
          row={editingRow}
          relations={relationOpts}
        />
      )}
    </div>
  );
}
