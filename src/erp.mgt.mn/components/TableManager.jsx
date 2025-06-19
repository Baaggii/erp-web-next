import React, { useEffect, useState, useContext, useMemo } from 'react';
import { AuthContext } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import RowFormModal from './RowFormModal.jsx';
import CascadeDeleteModal from './CascadeDeleteModal.jsx';
import RowDetailModal from './RowDetailModal.jsx';
import formatTimestamp from '../utils/formatTimestamp.js';

const actionCellStyle = {
  padding: '0.5rem',
  border: '1px solid #d1d5db',
  width: 150,
  minWidth: 150,
  whiteSpace: 'nowrap',
  display: 'flex',
  justifyContent: 'flex-end',
  gap: '0.25rem',
};
const actionBtnStyle = {
  background: '#f3f4f6',
  border: '1px solid #d1d5db',
  borderRadius: '3px',
  fontSize: '0.8rem',
  padding: '0.25rem 0.5rem',
  cursor: 'pointer',
};
const deleteBtnStyle = {
  ...actionBtnStyle,
  backgroundColor: '#fee2e2',
  borderColor: '#fecaca',
  color: '#b91c1c',
};

export default function TableManager({ table, refreshId = 0, formConfig = null, initialPerPage = 10, addLabel = 'Add Row' }) {
  const [rows, setRows] = useState([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(initialPerPage);
  const [filters, setFilters] = useState({});
  const [sort, setSort] = useState({ column: '', dir: 'asc' });
  const [relations, setRelations] = useState({});
  const [refData, setRefData] = useState({});
  const [relationConfigs, setRelationConfigs] = useState({});
  const [columnMeta, setColumnMeta] = useState([]);
  const [autoInc, setAutoInc] = useState(new Set());
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [selectedRows, setSelectedRows] = useState(new Set());
  const [localRefresh, setLocalRefresh] = useState(0);
  const [deleteInfo, setDeleteInfo] = useState(null); // { id, refs }
  const [showCascade, setShowCascade] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [detailRow, setDetailRow] = useState(null);
  const [detailRefs, setDetailRefs] = useState([]);
  const [editLabels, setEditLabels] = useState(false);
  const [labelEdits, setLabelEdits] = useState({});
  const [isAdding, setIsAdding] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const savingRef = useRef(false);
  const { user, company } = useContext(AuthContext);
  const { addToast } = useToast();

  function computeAutoInc(meta) {
    const auto = meta
      .filter(
        (c) =>
          typeof c.extra === 'string' &&
          c.extra.toLowerCase().includes('auto_increment'),
      )
      .map((c) => c.name);
    if (auto.length === 0) {
      const pk = meta.filter((c) => c.key === 'PRI').map((c) => c.name);
      if (pk.length === 1) return new Set(pk);
    }
    return new Set(auto);
  }

  function getAverageLength(columnKey, data) {
    const values = data
      .slice(0, 20)
      .map((r) => (r[columnKey] ?? '').toString());
    if (values.length === 0) return 0;
    return Math.round(
      values.reduce((sum, val) => sum + val.length, 0) / values.length,
    );
  }

  useEffect(() => {
    if (!table) return;
    let canceled = false;
    setRows([]);
    setCount(0);
    setPage(1);
    setFilters({});
    setSort({ column: '', dir: 'asc' });
    setRelations({});
    setRefData({});
    setColumnMeta([]);
    fetch(`/api/tables/${encodeURIComponent(table)}/columns`, {
      credentials: 'include',
    })
      .then((res) => res.json())
      .then((cols) => {
        if (canceled) return;
        setColumnMeta(cols);
        setAutoInc(computeAutoInc(cols));
      });
    return () => {
      canceled = true;
    };
  }, [table]);

  useEffect(() => {
    setAutoInc(computeAutoInc(columnMeta));
  }, [columnMeta]);

  useEffect(() => {
    if (!table) return;
    let canceled = false;
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
                if (
                  cfg &&
                  Array.isArray(cfg.displayFields) &&
                  cfg.displayFields.length > 0
                ) {
                  displayFields = cfg.displayFields;
                } else {
                  displayFields = Object.keys(row)
                    .filter((f) => f !== rel.column)
                    .slice(0, 1);
                }

                parts.push(
                  ...displayFields
                    .map((f) => row[f])
                    .filter((v) => v !== undefined),
                );

                const label =
                  parts.length > 0
                    ? parts.join(' - ')
                    : Object.values(row).slice(0, 2).join(' - ');

                return {
                  value: row[rel.column],
                  label,
                };
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
    if (!table) return;
    let canceled = false;
    const params = new URLSearchParams({ page, perPage });
    if (sort.column) {
      params.set('sort', sort.column);
      params.set('dir', sort.dir);
    }
    Object.entries(filters).forEach(([k, v]) => {
      if (v) params.set(k, v);
    });
    fetch(`/api/tables/${encodeURIComponent(table)}?${params.toString()}`, {
      credentials: 'include',
    })
      .then((res) => res.json())
      .then((data) => {
        if (canceled) return;
        setRows(data.rows || []);
        setCount(data.count || 0);
        // clear selections when data changes
        setSelectedRows(new Set());
      });
    return () => {
      canceled = true;
    };
  }, [table, page, perPage, filters, sort, refreshId, localRefresh]);

  useEffect(() => {
    setSelectedRows(new Set());
  }, [table, page, perPage, filters, sort, refreshId, localRefresh]);

  function getRowId(row) {
    const keys = getKeyFields();
    if (keys.length === 0) return undefined;
    const idVal = keys.length === 1 ? row[keys[0]] : keys.map((k) => row[k]).join('-');
    return idVal;
  }

  function getKeyFields() {
    const keys = columnMeta
      .filter((c) => c.key === 'PRI')
      .map((c) => c.name);
    let result = keys;
    if (result.length === 0) {
      if (columnMeta.some((c) => c.name === 'id')) result = ['id'];
      else if (rows[0] && Object.prototype.hasOwnProperty.call(rows[0], 'id')) {
        result = ['id'];
      }
    }
    return result;
  }

  async function ensureColumnMeta() {
    if (columnMeta.length > 0 || !table) return;
    try {
      const res = await fetch(`/api/tables/${encodeURIComponent(table)}/columns`, {
        credentials: 'include',
      });
      if (res.ok) {
        const cols = await res.json();
        if (Array.isArray(cols)) {
          setColumnMeta(cols);
          setAutoInc(computeAutoInc(cols));
        }
      }
    } catch (err) {
      console.error('Failed to fetch column metadata', err);
    }
  }

  async function openAdd() {
    await ensureColumnMeta();
    const vals = {};
    const all = columnMeta.map((c) => c.name);
    all.forEach((c) => {
      let v = (formConfig?.defaultValues || {})[c] || '';
      if (formConfig?.userIdFields?.includes(c) && user?.empid) v = user.empid;
      if (formConfig?.branchIdFields?.includes(c) && company?.branch_id !== undefined) v = company.branch_id;
      if (formConfig?.companyIdFields?.includes(c) && company?.company_id !== undefined) v = company.company_id;
      vals[c] = v;
    });
    setEditing(vals);
    setIsAdding(true);
    setShowForm(true);
  }

  async function openEdit(row) {
    if (getRowId(row) === undefined) {
      addToast('Cannot edit rows without a primary key', 'error');
      return;
    }
    await ensureColumnMeta();
    setEditing(row);
    setIsAdding(false);
    setShowForm(true);
  }

  async function openDetail(row) {
    setDetailRow(row);
    const id = getRowId(row);
    if (id !== undefined) {
      try {
        const res = await fetch(
          `/api/tables/${encodeURIComponent(table)}/${encodeURIComponent(id)}/references`,
          { credentials: 'include' },
        );
        if (res.ok) {
          const refs = await res.json();
          setDetailRefs(Array.isArray(refs) ? refs : []);
        } else {
          setDetailRefs([]);
        }
      } catch {
        setDetailRefs([]);
      }
    } else {
      setDetailRefs([]);
    }
    setShowDetail(true);
  }

  function toggleRow(id) {
    setSelectedRows((s) => {
      const next = new Set(s);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function selectCurrentPage() {
    setSelectedRows(new Set(rows.map((r) => getRowId(r)).filter((id) => id !== undefined)));
  }

  function deselectAll() {
    setSelectedRows(new Set());
  }

  function handleSort(col) {
    if (sort.column === col) {
      setSort({ column: col, dir: sort.dir === 'asc' ? 'desc' : 'asc' });
    } else {
      setSort({ column: col, dir: 'asc' });
    }
    setPage(1);
    setSelectedRows(new Set());
  }

  function handleFilterChange(col, val) {
    setFilters((f) => ({ ...f, [col]: val }));
    setPage(1);
    setSelectedRows(new Set());
  }

  async function handleSubmit(values) {
    if (savingRef.current) return;
    savingRef.current = true;
    setIsSaving(true);
    const columns = new Set(allColumns);
    const merged = { ...(editing || {}) };
    Object.entries(values).forEach(([k, v]) => {
      merged[k] = v;
    });

    Object.entries(formConfig?.defaultValues || {}).forEach(([k, v]) => {
      if (merged[k] === undefined || merged[k] === '') merged[k] = v;
    });

    if (isAdding) {
      formConfig?.userIdFields?.forEach((f) => {
        if (columns.has(f)) merged[f] = user?.empid;
      });
      formConfig?.branchIdFields?.forEach((f) => {
        if (columns.has(f) && company?.branch_id !== undefined)
          merged[f] = company.branch_id;
      });
      formConfig?.companyIdFields?.forEach((f) => {
        if (columns.has(f) && company?.company_id !== undefined)
          merged[f] = company.company_id;
      });
    }

    const required = formConfig?.requiredFields || [];
    for (const f of required) {
      if (merged[f] === undefined || merged[f] === '') {
        addToast('Please fill ' + (labels[f] || f), 'error');
        return;
      }
    }

    const cleaned = {};
    Object.entries(merged).forEach(([k, v]) => {
      if (v !== '') cleaned[k] = v;
    });

    const method = isAdding ? 'POST' : 'PUT';
    const url = isAdding
      ? `/api/tables/${encodeURIComponent(table)}`
      : `/api/tables/${encodeURIComponent(table)}/${encodeURIComponent(getRowId(editing))}`;

    if (isAdding) {
      if (columns.has('created_by')) cleaned.created_by = user?.empid;
      if (columns.has('created_at')) {
        cleaned.created_at = formatTimestamp(new Date());
      }
    }

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(cleaned),
      });
      if (res.ok) {
        const params = new URLSearchParams({ page, perPage });
        if (sort.column) {
          params.set('sort', sort.column);
          params.set('dir', sort.dir);
        }
      Object.entries(filters).forEach(([k, v]) => {
        if (v) params.set(k, v);
      });
      const data = await fetch(`/api/tables/${encodeURIComponent(table)}?${params.toString()}`, {
        credentials: 'include',
      }).then((r) => r.json());
      setRows(data.rows || []);
      setCount(data.count || 0);
        setSelectedRows(new Set());
        setShowForm(false);
        setEditing(null);
        setIsAdding(false);
        addToast('Saved', 'success');
      }
    } catch (err) {
      console.error('Save failed', err);
    } finally {
      savingRef.current = false;
      setIsSaving(false);
    }
  }

  async function executeDeleteRow(id, cascade) {
    const res = await fetch(
      `/api/tables/${encodeURIComponent(table)}/${encodeURIComponent(id)}${
        cascade ? '?cascade=true' : ''
      }`,
      { method: 'DELETE', credentials: 'include' },
    );
    if (res.ok) {
      const params = new URLSearchParams({ page, perPage });
      if (sort.column) {
        params.set('sort', sort.column);
        params.set('dir', sort.dir);
      }
      Object.entries(filters).forEach(([k, v]) => {
        if (v) params.set(k, v);
      });
      const data = await fetch(
        `/api/tables/${encodeURIComponent(table)}?${params.toString()}`,
        { credentials: 'include' },
      ).then((r) => r.json());
      setRows(data.rows || []);
      setCount(data.count || 0);
      setSelectedRows(new Set());
      addToast('Deleted', 'success');
    } else {
      let message = 'Delete failed';
      try {
        const data = await res.json();
        if (data && data.message) message += `: ${data.message}`;
      } catch {
        // ignore json errors
      }
      addToast(message, 'error');
    }
  }

  async function handleDelete(row) {
    const id = getRowId(row);
    if (id === undefined) {
      addToast('Delete failed: table has no primary key', 'error');
      return;
    }
    try {
      const refRes = await fetch(
        `/api/tables/${encodeURIComponent(table)}/${encodeURIComponent(id)}/references`,
        { credentials: 'include' }
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
        await executeDeleteRow(id, false);
        return;
      }
    } catch {
      // ignore error and fall back to confirm
    }
    if (!window.confirm('Delete row and related records?')) return;
    await executeDeleteRow(id, true);
  }

  async function confirmCascadeDelete() {
    if (!deleteInfo) return;
    await executeDeleteRow(deleteInfo.id, true);
    setShowCascade(false);
    setDeleteInfo(null);
  }

  async function handleDeleteSelected() {
    if (selectedRows.size === 0) return;
    const cascadeMap = new Map();
    let hasRelated = false;
    for (const id of selectedRows) {
      if (id === undefined) {
        addToast('Delete failed: table has no primary key', 'error');
        return;
      }
      try {
        const refRes = await fetch(
          `/api/tables/${encodeURIComponent(table)}/${encodeURIComponent(id)}/references`,
          { credentials: 'include' }
        );
        if (refRes.ok) {
          const refs = await refRes.json();
          const total = Array.isArray(refs)
            ? refs.reduce((a, r) => a + (r.count || 0), 0)
            : 0;
          cascadeMap.set(id, total > 0);
          if (total > 0) hasRelated = true;
        } else {
          cascadeMap.set(id, true);
          hasRelated = true;
        }
      } catch {
        cascadeMap.set(id, true);
        hasRelated = true;
      }
    }

    const count = selectedRows.size;
    const confirmMsg = hasRelated
      ? `Delete ${count} selected rows and related records?`
      : `Delete ${count} selected rows?`;
    if (!window.confirm(confirmMsg)) return;

    for (const id of selectedRows) {
      const cascade = cascadeMap.get(id);
      const res = await fetch(
        `/api/tables/${encodeURIComponent(table)}/${encodeURIComponent(id)}${
          cascade ? '?cascade=true' : ''
        }`,
        { method: 'DELETE', credentials: 'include' }
      );
      if (!res.ok) {
        let message = `Delete failed for ${id}`;
        try {
          const data = await res.json();
          if (data && data.message) message += `: ${data.message}`;
        } catch {
          // ignore json errors
        }
        addToast(message, 'error');
        return;
      }
    }
    const params = new URLSearchParams({ page, perPage });
    if (sort.column) {
      params.set('sort', sort.column);
      params.set('dir', sort.dir);
    }
    Object.entries(filters).forEach(([k, v]) => {
      if (v) params.set(k, v);
    });
    const data = await fetch(`/api/tables/${encodeURIComponent(table)}?${params.toString()}`, {
      credentials: 'include',
    }).then((r) => r.json());
    setRows(data.rows || []);
    setCount(data.count || 0);
    setSelectedRows(new Set());
    addToast('Deleted', 'success');
  }

  function refreshRows() {
    setLocalRefresh((r) => r + 1);
  }

  if (!table) return null;

  const allColumns =
    columnMeta.length > 0
      ? columnMeta.map((c) => c.name)
      : rows[0]
      ? Object.keys(rows[0])
      : [];

  const ordered = formConfig?.visibleFields?.length
    ? formConfig.visibleFields.filter((c) => allColumns.includes(c))
    : allColumns;
  const labels = {};
  columnMeta.forEach((c) => {
    labels[c.name] = c.label || c.name;
  });
  const hiddenColumns = ['password', 'created_by', 'created_at'];
  let columns = ordered.filter((c) => !hiddenColumns.includes(c));

  const relationOpts = {};
  ordered.forEach((c) => {
    if (relations[c] && refData[c]) {
      relationOpts[c] = refData[c];
    }
  });
  const labelMap = {};
  Object.entries(relationOpts).forEach(([col, opts]) => {
    labelMap[col] = {};
    opts.forEach((o) => {
      labelMap[col][o.value] = o.label;
    });
  });


  const columnAlign = useMemo(() => {
    const map = {};
    columns.forEach((c) => {
      const sample = rows.find((r) => r[c] !== null && r[c] !== undefined);
      map[c] = typeof sample?.[c] === 'number' ? 'right' : 'left';
    });
    return map;
  }, [columns, rows]);

  const autoCols = new Set(autoInc);
  if (columnMeta.length > 0 && autoCols.size === 0) {
    const pk = columnMeta.filter((c) => c.key === 'PRI').map((c) => c.name);
    if (pk.length === 1) autoCols.add(pk[0]);
  }
  if (columnMeta.length === 0 && autoCols.size === 0 && allColumns.includes('id')) {
    autoCols.add('id');
  }
  const disabledFields = editing ? getKeyFields() : [];
  let formColumns = ordered.filter(
    (c) => !autoCols.has(c) && c !== 'created_at' && c !== 'created_by'
  );

  return (
    <div>
      <div
        style={{
          marginBottom: '0.5rem',
          position: 'sticky',
          top: 0,
          background: '#fff',
          zIndex: 1,
          paddingTop: '0.5rem',
          paddingBottom: '0.5rem',
        }}
      >
        <button onClick={openAdd} style={{ marginRight: '0.5rem' }}>
          {addLabel}
        </button>
        <button onClick={selectCurrentPage} style={{ marginRight: '0.5rem' }}>
          Select All
        </button>
        <button onClick={deselectAll} style={{ marginRight: '0.5rem' }}>
          Deselect All
        </button>
        <button onClick={refreshRows} style={{ marginRight: '0.5rem' }}>
          Refresh Table
        </button>
        {selectedRows.size > 0 && (
          <button onClick={handleDeleteSelected}>Delete Selected</button>
        )}
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-start',
          alignItems: 'center',
          marginBottom: '0.5rem',
          gap: '1rem',
        }}
      >
        <div>
          Rows per page:
          <select
            value={perPage}
            onChange={(e) => {
              setPage(1);
              setPerPage(Number(e.target.value));
            }}
            style={{ marginLeft: '0.25rem' }}
          >
            {[10, 25, 50].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
        <div>
          <button onClick={() => setPage(1)} disabled={page === 1} style={{ marginRight: '0.25rem' }}>
            {'<<'}
          </button>
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            style={{ marginRight: '0.25rem' }}
          >
            {'<'}
          </button>
          <span>
            Page {page} of {Math.max(1, Math.ceil(count / perPage))}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(Math.ceil(count / perPage), p + 1))}
            disabled={page >= Math.ceil(count / perPage)}
            style={{ marginLeft: '0.25rem' }}
          >
            {'>'}
          </button>
          <button
            onClick={() => setPage(Math.ceil(count / perPage))}
            disabled={page >= Math.ceil(count / perPage)}
            style={{ marginLeft: '0.25rem' }}
          >
            {'>>'}
          </button>
        </div>
      </div>
      <div className="table-container overflow-x-auto">
      <table
        style={{
          borderCollapse: 'collapse',
          tableLayout: 'auto',
          minWidth: '1200px',
          maxWidth: '2000px',
        }}
      >
        <thead className="sticky-header">
          <tr style={{ backgroundColor: '#e5e7eb' }}>
            <th style={{ padding: '0.5rem', border: '1px solid #d1d5db', whiteSpace: 'nowrap', width: 60, textAlign: 'center' }}>
              <input
                type="checkbox"
                checked={
                  rows.length > 0 &&
                  rows.every((r) => {
                    const rid = getRowId(r);
                    return rid !== undefined && selectedRows.has(rid);
                  })
                }
                onChange={(e) => (e.target.checked ? selectCurrentPage() : deselectAll())}
              />
            </th>
            {columns.map((c) => (
              <th
                key={c}
                style={{
                  padding: '0.5rem',
                  border: '1px solid #d1d5db',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  lineHeight: 1.2,
                  textAlign: columnAlign[c],
                }}
                onClick={() => handleSort(c)}
              >
                {labels[c] || c}
                {sort.column === c ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : ''}
              </th>
            ))}
            <th style={{ padding: '0.5rem', border: '1px solid #d1d5db', whiteSpace: 'nowrap', width: 120 }}>Action</th>
          </tr>
          <tr>
            <th style={{ padding: '0.25rem', border: '1px solid #d1d5db', width: 60 }}></th>
            {columns.map((c) => (
            <th key={c} style={{ padding: '0.25rem', border: '1px solid #d1d5db', whiteSpace: 'normal', textAlign: columnAlign[c] }}>
                {Array.isArray(relationOpts[c]) ? (
                  <select
                    value={filters[c] || ''}
                    onChange={(e) => handleFilterChange(c, e.target.value)}
                    style={{ width: '100%' }}
                  >
                    <option value=""></option>
                    {relationOpts[c].map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    value={filters[c] || ''}
                    onChange={(e) => handleFilterChange(c, e.target.value)}
                    style={{ width: '100%' }}
                  />
                )}
              </th>
            ))}
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={columns.length + 2} style={{ textAlign: 'center', padding: '0.5rem' }}>
                No data.
              </td>
            </tr>
          )}
          {rows.map((r) => (
            <tr key={r.id || JSON.stringify(r)}>
              <td style={{ padding: '0.5rem', border: '1px solid #d1d5db', width: 60, textAlign: 'center' }}>
                {(() => {
                  const rid = getRowId(r);
                  return (
                    <input
                      type="checkbox"
                      disabled={rid === undefined}
                      checked={rid !== undefined && selectedRows.has(rid)}
                      onChange={() => rid !== undefined && toggleRow(rid)}
                    />
                  );
                })()}
              </td>
              {columns.map((c) => (
              <td
                key={c}
                style={{
                  padding: '0.5rem',
                  border: '1px solid #d1d5db',
                  wordBreak: 'break-word',
                  textAlign: columnAlign[c],
                }}
                  title={relationOpts[c] ? labelMap[c][r[c]] || String(r[c]) : String(r[c])}
                >
                  {relationOpts[c] ? labelMap[c][r[c]] || String(r[c]) : String(r[c])}
                </td>
              ))}
              <td style={actionCellStyle}>
                {(() => {
                  const rid = getRowId(r);
                  return (
                    <>
                      <button
                        onClick={() => openDetail(r)}
                        style={actionBtnStyle}
                      >
                        👁 View
                      </button>
                      <button
                        onClick={() => openEdit(r)}
                        disabled={rid === undefined}
                        style={actionBtnStyle}
                      >
                        🖉 Edit
                      </button>
                      <button
                        onClick={() => handleDelete(r)}
                        disabled={rid === undefined}
                        style={deleteBtnStyle}
                      >
                        ❌ Delete
                      </button>
                    </>
                  );
                })()}
              </td>
            </tr>
      ))}
      </tbody>
      </table>
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-start',
          alignItems: 'center',
          marginTop: '0.5rem',
          gap: '1rem',
        }}
      >
        <div>
          Rows per page:
          <select
            value={perPage}
            onChange={(e) => {
              setPage(1);
              setPerPage(Number(e.target.value));
            }}
            style={{ marginLeft: '0.25rem' }}
          >
            {[10, 25, 50].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
        <div>
          <button onClick={() => setPage(1)} disabled={page === 1} style={{ marginRight: '0.25rem' }}>
            {'<<'}
          </button>
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            style={{ marginRight: '0.25rem' }}
          >
            {'<'}
          </button>
          <span>
            Page {page} of {Math.max(1, Math.ceil(count / perPage))}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(Math.ceil(count / perPage), p + 1))}
            disabled={page >= Math.ceil(count / perPage)}
            style={{ marginLeft: '0.25rem' }}
          >
            {'>'}
          </button>
          <button
            onClick={() => setPage(Math.ceil(count / perPage))}
            disabled={page >= Math.ceil(count / perPage)}
            style={{ marginLeft: '0.25rem' }}
          >
            {'>>'}
          </button>
        </div>
      </div>
      <RowFormModal
        visible={showForm}
        onCancel={() => {
          setShowForm(false);
          setEditing(null);
          setIsAdding(false);
        }}
        onSubmit={handleSubmit}
        saving={isSaving}
        columns={formColumns}
        row={editing}
        relations={relationOpts}
        relationConfigs={relationConfigs}
        disabledFields={disabledFields}
        labels={labels}
        requiredFields={formConfig?.requiredFields || []}
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
        columns={allColumns}
        relations={relationOpts}
        references={detailRefs}
        labels={labels}
      />
      {user?.role === 'admin' && (
        <button onClick={() => {
          const map = {};
          columnMeta.forEach((c) => { map[c.name] = c.label || ''; });
          setLabelEdits(map);
          setEditLabels(true);
        }} style={{ marginTop: '0.5rem' }}>
          Edit Field Labels
        </button>
      )}
      {editLabels && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.4)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <div style={{ backgroundColor: '#fff', padding: '1rem', borderRadius: '4px', maxHeight: '90vh', overflowY: 'auto' }}>
            <h3 style={{ marginTop: 0 }}>Edit Labels</h3>
            {columns.map((c) => (
              <div key={c} style={{ marginBottom: '0.5rem' }}>
                {c}:{' '}
                <input value={labelEdits[c] || ''} onChange={(e) => setLabelEdits({ ...labelEdits, [c]: e.target.value })} />
              </div>
            ))}
            <div style={{ textAlign: 'right' }}>
              <button onClick={() => setEditLabels(false)} style={{ marginRight: '0.5rem' }}>Cancel</button>
              <button onClick={async () => {
                await fetch(`/api/tables/${encodeURIComponent(table)}/labels`, {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  credentials: 'include',
                  body: JSON.stringify({ labels: labelEdits }),
                });
                const res = await fetch(`/api/tables/${encodeURIComponent(table)}/columns`, { credentials: 'include' });
                if (res.ok) {
                  const cols = await res.json();
                  setColumnMeta(cols);
                }
                setEditLabels(false);
              }}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
