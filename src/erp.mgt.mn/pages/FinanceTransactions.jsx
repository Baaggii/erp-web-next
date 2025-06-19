import React, { useState, useEffect, useContext } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext.jsx';
import RowFormModal from '../components/RowFormModal.jsx';

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
  const [editingRow, setEditingRow] = useState(null);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const perPage = 10;
  const [columnMeta, setColumnMeta] = useState([]);
  const [relations, setRelations] = useState({});
  const [refData, setRefData] = useState({});
  const [relationConfigs, setRelationConfigs] = useState({});

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
    setPage(1);
    fetch(`/api/tables/${encodeURIComponent(table)}/columns`, { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : []))
      .then((cols) => {
        setColumns(cols.map((c) => c.name || c));
        setColumnMeta(cols);
      })
      .catch(() => {
        setColumns([]);
        setColumnMeta([]);
      });
    fetch(`/api/transaction_forms?table=${encodeURIComponent(table)}&name=${encodeURIComponent(name)}`, { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : {}))
      .then((cfg) => setConfig(cfg))
      .catch(() => setConfig(null));
  }, [table, name]);

  useEffect(() => {
    if (!table) return;
    let canceled = false;
    setRefData({});
    setRelationConfigs({});
    async function load() {
      try {
        const res = await fetch(
          `/api/tables/${encodeURIComponent(table)}/relations`,
          { credentials: 'include' },
        );
        if (!res.ok) return;
        const rels = await res.json();
        if (canceled) return;
        const map = {};
        rels.forEach((r) => {
          map[r.COLUMN_NAME] = {
            table: r.REFERENCED_TABLE_NAME,
            column: r.REFERENCED_COLUMN_NAME,
          };
        });
        setRelations(map);
        const dataMap = {};
        const cfgMap = {};
        for (const [col, rel] of Object.entries(map)) {
          try {
            let page = 1;
            const perPage = 500;
            let rows = [];
            const cfgRes = await fetch(
              `/api/display_fields?table=${encodeURIComponent(rel.table)}`,
              { credentials: 'include' },
            );
            let cfg = null;
            if (cfgRes.ok) {
              try {
                cfg = await cfgRes.json();
              } catch {
                cfg = null;
              }
            }
            while (true) {
              const params = new URLSearchParams({ page, perPage });
              const refRes = await fetch(
                `/api/tables/${encodeURIComponent(rel.table)}?${params.toString()}`,
                { credentials: 'include' },
              );
              const json = await refRes.json();
              if (Array.isArray(json.rows)) {
                rows = rows.concat(json.rows);
                if (rows.length >= (json.count || rows.length) || json.rows.length < perPage) {
                  break;
                }
              } else {
                break;
              }
              page += 1;
            }
            cfgMap[col] = {
              table: rel.table,
              column: rel.column,
              displayFields: cfg?.displayFields || [],
            };
            if (rows.length > 0) {
              dataMap[col] = rows.map((row) => {
                const parts = [];
                if (row[rel.column] !== undefined) parts.push(row[rel.column]);
                let displayFields = [];
                if (cfg && Array.isArray(cfg.displayFields) && cfg.displayFields.length > 0) {
                  displayFields = cfg.displayFields;
                } else {
                  displayFields = Object.keys(row)
                    .filter((f) => f !== rel.column)
                    .slice(0, 1);
                }
                parts.push(...displayFields.map((f) => row[f]).filter((v) => v !== undefined));
                const label =
                  parts.length > 0
                    ? parts.join(' - ')
                    : Object.values(row).slice(0, 2).join(' - ');
                return { value: row[rel.column], label };
              });
            }
          } catch {
            /* ignore */
          }
        }
        if (!canceled) {
          setRefData(dataMap);
          setRelationConfigs(cfgMap);
        }
      } catch (err) {
        console.error('Failed to load table relations', err);
      }
    }
    load();
    return () => {
      canceled = true;
    };
  }, [table]);

  useEffect(() => {
    if (table && name) loadRows();
  }, [table, name, page]);

  async function loadRows() {
    const params = new URLSearchParams({ page, perPage });
    const res = await fetch(
      `/api/tables/${encodeURIComponent(table)}?${params.toString()}`,
      { credentials: 'include' },
    );
    const data = res.ok ? await res.json() : {};
    setRows(data.rows || []);
    setCount(data.count || 0);
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
    setEditingRow(vals);
    setShowForm(true);
  }

  function openEdit(row) {
    setEditingRow(row);
    setShowForm(true);
  }

  async function handleModalSubmit(values) {
    const required = config?.requiredFields || [];
    for (const f of required) {
      if (!values[f]) {
        alert('Please fill ' + f);
        return;
      }
    }
    const data = { ...values };
    const method = editingRow && editingRow.id != null ? 'PUT' : 'POST';
    const url = editingRow && editingRow.id != null
      ? `/api/tables/${encodeURIComponent(table)}/${encodeURIComponent(editingRow.id)}`
      : `/api/tables/${encodeURIComponent(table)}`;
    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data),
      });
      if (res.ok) {
        alert('Transaction saved successfully');
        setShowForm(false);
        setEditingRow(null);
        await loadRows();
      } else {
        const msg = await res.text();
        alert('Save failed: ' + msg);
      }
    } catch (err) {
      alert('Save failed: ' + err.message);
    }
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
  const relationOpts = {};
  fields.forEach((f) => {
    if (relations[f] && refData[f]) relationOpts[f] = refData[f];
  });
  const labelMap = {};
  Object.entries(relationOpts).forEach(([col, opts]) => {
    labelMap[col] = {};
    opts.forEach((o) => {
      labelMap[col][o.value] = o.label;
    });
  });
  const labels = {};
  columnMeta.forEach((c) => {
    labels[c.name] = c.label || c.name;
  });
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
        <>
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr>
              {fields.map((f) => (
                <th key={f} style={{ border: '1px solid #ccc', padding: '4px' }}>
                  {labels[f] || f}
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
                    {relationOpts[f] ? labelMap[f][r[f]] || String(r[f] ?? '') : String(r[f] ?? '')}
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
        </>
      )}
      <RowFormModal
        visible={showForm}
        onCancel={() => setShowForm(false)}
        onSubmit={handleModalSubmit}
        columns={fields}
        row={editingRow}
        relations={relationOpts}
        relationConfigs={relationConfigs}
        labels={labels}
        requiredFields={config?.requiredFields || []}
      />
    </div>
  );
}
