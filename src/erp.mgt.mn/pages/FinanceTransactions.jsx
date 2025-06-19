import React, { useState, useEffect, useContext } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext.jsx';
import RowFormModal from '../components/RowFormModal.jsx';
import RowDetailModal from '../components/RowDetailModal.jsx';
import CascadeDeleteModal from '../components/CascadeDeleteModal.jsx';

export default function FinanceTransactions({ defaultName = '', hideSelector = false }) {
  const { user, company } = useContext(AuthContext);
  const [configs, setConfigs] = useState({});
  const [searchParams, setSearchParams] = useSearchParams();
  const [name, setName] = useState(() => defaultName || searchParams.get('name') || '');
  const [table, setTable] = useState('');
  const [columns, setColumns] = useState([]);
  const [rows, setRows] = useState([]);
  const [config, setConfig] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [formVals, setFormVals] = useState({});
  const [editingRow, setEditingRow] = useState(null);
  const [detailRow, setDetailRow] = useState(null);
  const [detailRefs, setDetailRefs] = useState([]);
  const [showDetail, setShowDetail] = useState(false);
  const [deleteInfo, setDeleteInfo] = useState(null);
  const [showCascade, setShowCascade] = useState(false);

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
    setEditingRow(null);
    setFormVals(vals);
    setShowAddForm(true);
  }

  function openEdit(row) {
    const vals = {};
    columns.forEach((c) => {
      vals[c] = row[c] ?? '';
    });
    setEditingRow(row);
    setFormVals(vals);
    setShowEditModal(true);
  }

  async function openView(row) {
    setDetailRow(row);
    const id = row.id;
    if (id !== undefined) {
      try {
        const res = await fetch(
          `/api/tables/${encodeURIComponent(table)}/${encodeURIComponent(id)}/references`,
          { credentials: 'include' },
        );
        if (res.ok) {
          const refs = await res.json();
          setDetailRefs(Array.isArray(refs) ? refs : []);
        }
      } catch {
        setDetailRefs([]);
      }
    }
    setShowDetail(true);
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
    if (!editingRow) {
      await fetch(`/api/tables/${encodeURIComponent(table)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data),
      });
    } else {
      const id = editingRow.id;
      await fetch(`/api/tables/${encodeURIComponent(table)}/${encodeURIComponent(id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data),
      });
    }
    setShowAddForm(false);
    setShowEditModal(false);
    setEditingRow(null);
    await loadRows();
  }

  async function executeDelete(id, cascade) {
    await fetch(
      `/api/tables/${encodeURIComponent(table)}/${encodeURIComponent(id)}${
        cascade ? '?cascade=true' : ''
      }`,
      { method: 'DELETE', credentials: 'include' },
    );
    await loadRows();
  }

  async function handleDelete(row) {
    const id = row.id;
    if (id === undefined) return;
    try {
      const refRes = await fetch(
        `/api/tables/${encodeURIComponent(table)}/${encodeURIComponent(id)}/references`,
        { credentials: 'include' },
      );
      if (refRes.ok) {
        const refs = await refRes.json();
        const total = Array.isArray(refs)
          ? refs.reduce((a, r) => a + (r.count || 0), 0)
          : 0;
        if (total > 0) {
          setDeleteInfo({ id, refs });
          setShowCascade(true);
          return;
        }
        if (!window.confirm('Delete row?')) return;
        await executeDelete(id, false);
        return;
      }
    } catch {
      // ignore
    }
    if (!window.confirm('Delete row and related records?')) return;
    await executeDelete(id, true);
  }

  async function confirmCascadeDelete() {
    if (!deleteInfo) return;
    await executeDelete(deleteInfo.id, true);
    setShowCascade(false);
    setDeleteInfo(null);
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
                  <button onClick={() => openView(r)} style={{ marginRight: '0.25rem' }}>
                    View
                  </button>
                  <button onClick={() => openEdit(r)} style={{ marginRight: '0.25rem' }}>
                    Edit
                  </button>
                  <button onClick={() => handleDelete(r)}>Delete</button>
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
      {showAddForm && (
        <form onSubmit={handleSubmit} style={{ marginTop: '1rem', background: '#f9fafb', padding: '1rem', borderRadius: '4px' }}>
          <h3 style={{ marginTop: 0 }}>Add Transaction</h3>
          {fields.map((f, idx) => (
            <div key={f} style={{ marginBottom: '0.5rem' }}>
              <label style={{ display: 'block', marginBottom: '0.25rem' }}>{f}</label>
              <input
                type="text"
                value={formVals[f] ?? ''}
                onChange={(e) => setFormVals((v) => ({ ...v, [f]: e.target.value }))}
                required={config?.requiredFields?.includes(f)}
                style={{ width: '100%', padding: '0.5rem' }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    const form = e.target.form;
                    const elements = Array.from(form.querySelectorAll('input'));
                    const idx2 = elements.indexOf(e.target);
                    if (idx2 >= 0 && idx2 < elements.length - 1) {
                      elements[idx2 + 1].focus();
                    }
                  }
                }}
              />
            </div>
          ))}
          <div style={{ textAlign: 'right' }}>
            <button type="button" onClick={() => setShowAddForm(false)} style={{ marginRight: '0.5rem' }}>
              Cancel
            </button>
            <button type="submit">Save</button>
          </div>
        </form>
      )}

      <RowFormModal
        visible={showEditModal}
        onCancel={() => {
          setShowEditModal(false);
          setEditingRow(null);
        }}
        onSubmit={handleSubmit}
        columns={fields}
        row={editingRow}
      />
      <CascadeDeleteModal
        visible={showCascade}
        references={deleteInfo?.refs || []}
        onCancel={() => {
          setShowCascade(false);
          setDeleteInfo(null);
        }}
        onConfirm={confirmCascadeDelete}
      />
      <RowDetailModal
        visible={showDetail}
        onClose={() => setShowDetail(false)}
        row={detailRow}
        columns={fields}
        references={detailRefs}
      />
    </div>
  );
}
