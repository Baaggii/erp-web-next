import React, {
  useEffect,
  useState,
  useContext,
  useMemo,
  useImperativeHandle,
  forwardRef,
} from 'react';
import { AuthContext } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import RowFormModal from './RowFormModal.jsx';
import CascadeDeleteModal from './CascadeDeleteModal.jsx';
import RowDetailModal from './RowDetailModal.jsx';
import formatTimestamp from '../utils/formatTimestamp.js';

function ch(n) {
  return Math.round(n * 8);
}

const MAX_WIDTH = ch(40);

function normalizeDateInput(value, format) {
  if (typeof value !== 'string') return value;
  let v = value.replace(/^(\d{4})\.(\d{2})\.(\d{2})/, '$1-$2-$3');
  const isoRe = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;
  if (isoRe.test(v)) {
    const d = new Date(v);
    if (format && format.includes('YYYY-MM-DD')) {
      return d.toISOString().slice(0, 10);
    }
    if (format === 'HH:MM:SS') return d.toISOString().slice(11, 19);
    return d.toISOString().slice(0, 19).replace('T', ' ');
  }
  return v;
}

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

export default forwardRef(function TableManager({ table, refreshId = 0, formConfig = null, initialPerPage = 10, addLabel = 'Add Row', showTable = true }, ref) {
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
  const [dateFilter, setDateFilter] = useState('');
  const [datePreset, setDatePreset] = useState('custom');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [typeOptions, setTypeOptions] = useState([]);
  const { user, company } = useContext(AuthContext);
  const { addToast } = useToast();

  const validCols = useMemo(
    () => new Set(columnMeta.map((c) => c.name)),
    [columnMeta],
  );

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
      .then((res) => {
        if (!res.ok) {
          addToast('Failed to load table columns', 'error');
          return [];
        }
        return res.json().catch(() => {
          addToast('Failed to parse table columns', 'error');
          return [];
        });
      })
      .then((cols) => {
        if (canceled) return;
        if (Array.isArray(cols)) {
          setColumnMeta(cols);
          setAutoInc(computeAutoInc(cols));
        }
      })
      .catch(() => {
        addToast('Failed to load table columns', 'error');
      });
    return () => {
      canceled = true;
    };
  }, [table]);

  useEffect(() => {
    setAutoInc(computeAutoInc(columnMeta));
  }, [columnMeta]);

  useEffect(() => {
    if (!formConfig) return;
    const newFilters = {};
    if (formConfig.dateField && formConfig.dateField.length > 0) {
      const today = new Date().toISOString().slice(0, 10);
      setDateFilter(today);
      setCustomStartDate('');
      setCustomEndDate('');
      setDatePreset('custom');
      formConfig.dateField.forEach((d) => {
        if (validCols.has(d)) newFilters[d] = today;
      });
    } else {
      setDateFilter('');
      setCustomStartDate('');
      setCustomEndDate('');
      setDatePreset('custom');
    }
    if (formConfig.transactionTypeField) {
      const val = formConfig.transactionTypeValue || '';
      setTypeFilter(val);
      if (validCols.has(formConfig.transactionTypeField))
        newFilters[formConfig.transactionTypeField] = val;
    } else {
      setTypeFilter('');
    }
    if (Object.keys(newFilters).length > 0) {
      setFilters((f) => ({ ...f, ...newFilters }));
    }
  }, [formConfig, validCols]);

  useEffect(() => {
    if (!formConfig?.transactionTypeField) {
      setTypeOptions([]);
      return;
    }
    let canceled = false;
    fetch('/api/tables/code_transaction?perPage=500', { credentials: 'include' })
      .then((res) => {
        if (!res.ok) {
          addToast('Failed to load transaction types', 'error');
          return { rows: [] };
        }
        return res.json().catch(() => {
          addToast('Failed to parse transaction types', 'error');
          return { rows: [] };
        });
      })
      .then((data) => {
        if (canceled) return;
        const opts = (data.rows || []).map((r) => ({
          value: r.UITransType?.toString() ?? '',
          label:
            r.UITransType !== undefined
              ? `${r.UITransType} - ${r.UITransTypeName ?? ''}`
              : r.UITransTypeName,
        }));
        setTypeOptions(opts);
      })
      .catch(() => {
        if (!canceled) {
          addToast('Failed to load transaction types', 'error');
          setTypeOptions([]);
        }
      });
    return () => {
      canceled = true;
    };
  }, [formConfig]);

  useEffect(() => {
    if (datePreset === 'custom') {
      if (customStartDate && customEndDate) {
        setDateFilter(`${customStartDate}-${customEndDate}`);
      } else {
        setDateFilter('');
      }
    }
  }, [customStartDate, customEndDate, datePreset]);

  useEffect(() => {
    if (formConfig?.dateField && formConfig.dateField.length > 0) {
      setFilters((f) => {
        const obj = { ...f };
        formConfig.dateField.forEach((d) => {
          if (validCols.has(d)) obj[d] = dateFilter || '';
        });
        return obj;
      });
    }
  }, [dateFilter, formConfig, validCols]);

  useEffect(() => {
    if (formConfig?.transactionTypeField) {
      if (validCols.has(formConfig.transactionTypeField)) {
        setFilters((f) => ({
          ...f,
          [formConfig.transactionTypeField]: typeFilter || '',
        }));
      }
    }
  }, [typeFilter, formConfig, validCols]);

  useEffect(() => {
    if (!table) return;
    let canceled = false;
    async function load() {
      try {
        const res = await fetch(
          `/api/tables/${encodeURIComponent(table)}/relations`,
          { credentials: 'include' },
        );
        if (!res.ok) {
          addToast('Failed to load table relations', 'error');
          return;
        }
        const rels = await res.json().catch(() => {
          addToast('Failed to parse table relations', 'error');
          return [];
        });
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
                addToast('Failed to parse display fields', 'error');
                cfg = null;
              }
            } else {
              addToast('Failed to load display fields', 'error');
            }
            while (true) {
              const params = new URLSearchParams({ page, perPage });
              const refRes = await fetch(
                `/api/tables/${encodeURIComponent(rel.table)}?${params.toString()}`,
                { credentials: 'include' },
              );
              if (!refRes.ok) {
                addToast('Failed to load reference data', 'error');
                break;
              }
              const json = await refRes.json().catch(() => {
                addToast('Failed to parse reference data', 'error');
                return {};
              });
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
        addToast('Failed to load table relations', 'error');
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
      .then((res) => {
        if (!res.ok) {
          addToast('Failed to load table data', 'error');
          return { rows: [], count: 0 };
        }
        return res.json().catch(() => {
          addToast('Failed to parse table data', 'error');
          return { rows: [], count: 0 };
        });
      })
      .then((data) => {
        if (canceled) return;
        setRows(data.rows || []);
        setCount(data.count || 0);
        // clear selections when data changes
        setSelectedRows(new Set());
      })
      .catch(() => {
        addToast('Failed to load table data', 'error');
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
        try {
          const cols = await res.json();
          if (Array.isArray(cols)) {
            setColumnMeta(cols);
            setAutoInc(computeAutoInc(cols));
          }
        } catch {
          addToast('Failed to parse table columns', 'error');
        }
      } else {
        addToast('Failed to load table columns', 'error');
      }
    } catch (err) {
      console.error('Failed to fetch column metadata', err);
      addToast('Failed to load table columns', 'error');
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
    if (formConfig?.transactionTypeField && formConfig.transactionTypeValue) {
      vals[formConfig.transactionTypeField] = formConfig.transactionTypeValue;
    }
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

  useImperativeHandle(ref, () => ({ openAdd }));

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
          try {
            const refs = await res.json();
            setDetailRefs(Array.isArray(refs) ? refs : []);
          } catch {
            addToast('Failed to parse reference info', 'error');
            setDetailRefs([]);
          }
        } else {
          addToast('Failed to load reference info', 'error');
          setDetailRefs([]);
        }
      } catch {
        addToast('Failed to load reference info', 'error');
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

  function handleFieldChange(changes) {
    if (!editing) return;
    setEditing((e) => ({ ...e, ...changes }));
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
      if (v !== '') {
        cleaned[k] =
          typeof v === 'string' ? normalizeDateInput(v, placeholders[k]) : v;
      }
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
        const msg = isAdding ? 'New transaction saved' : 'Saved';
        addToast(msg, 'success');
        if (isAdding) {
          const again = window.confirm('Add another transaction row?');
          if (again) {
            setTimeout(() => openAdd(), 0);
          }
        }
      } else {
        let message = 'Save failed';
        try {
          const data = await res.json();
          if (data && data.message) message += `: ${data.message}`;
        } catch {
          // ignore
        }
        addToast(message, 'error');
      }
    } catch (err) {
      console.error('Save failed', err);
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
      addToast('Failed to check references', 'error');
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
        addToast('Failed to check references', 'error');
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
    const dataRes = await fetch(
      `/api/tables/${encodeURIComponent(table)}?${params.toString()}`,
      {
        credentials: 'include',
      },
    );
    let data = { rows: [], count: 0 };
    if (dataRes.ok) {
      try {
        data = await dataRes.json();
      } catch {
        addToast('Failed to parse table data', 'error');
      }
    } else {
      addToast('Failed to load table data', 'error');
    }
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
  const placeholders = useMemo(() => {
    const map = {};
    columns.forEach((c) => {
      const lower = c.toLowerCase();
      if (lower.includes('timestamp') || (lower.includes('date') && lower.includes('time'))) {
        map[c] = 'YYYY-MM-DD HH:MM:SS';
      } else if (lower.includes('date')) {
        map[c] = 'YYYY-MM-DD';
      } else if (lower.includes('time')) {
        map[c] = 'HH:MM:SS';
      }
    });
    return map;
  }, [columns]);

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

  const columnWidths = useMemo(() => {
    const map = {};
    if (rows.length === 0) return map;
    columns.forEach((c) => {
      const avg = getAverageLength(c, rows);
      let w;
      if (avg <= 4) w = ch(Math.max(avg + 1, 5));
      else if (placeholders[c] && placeholders[c].includes('YYYY-MM-DD'))
        w = ch(12);
      else if (avg <= 10) w = ch(12);
      else w = ch(20);
      map[c] = Math.min(w, MAX_WIDTH);
    });
    return map;
  }, [columns, rows, placeholders]);

  const autoCols = new Set(autoInc);
  if (columnMeta.length > 0 && autoCols.size === 0) {
    const pk = columnMeta.filter((c) => c.key === 'PRI').map((c) => c.name);
    if (pk.length === 1) autoCols.add(pk[0]);
  }
  if (columnMeta.length === 0 && autoCols.size === 0 && allColumns.includes('id')) {
    autoCols.add('id');
  }
  const lockedDefaults = Object.entries(formConfig?.defaultValues || {})
    .filter(
      ([k, v]) =>
        v !== undefined && v !== '' &&
        !(formConfig?.editableDefaultFields || []).includes(k)
    )
    .map(([k]) => k);

  const disabledFields = editing
    ? [...getKeyFields(), ...lockedDefaults]
    : lockedDefaults;
  let formColumns = ordered.filter(
    (c) => !autoCols.has(c) && c !== 'created_at' && c !== 'created_by'
  );

  let headerFields = [];
  if (formConfig?.headerFields && formConfig.headerFields.length > 0) {
    headerFields = [...formConfig.headerFields];
  } else {
    headerFields = [
      ...(formConfig?.userIdFields || []),
      ...(formConfig?.branchIdFields || []),
      ...(formConfig?.companyIdFields || []),
      ...(formConfig?.dateField || []),
    ];
    if (formConfig?.transactionTypeField)
      headerFields.push(formConfig.transactionTypeField);
  }

  const mainFields = formConfig?.mainFields || [];

  let footerFields = [];
  if (formConfig?.footerFields && formConfig.footerFields.length > 0) {
    footerFields = [...formConfig.footerFields];
  } else {
    footerFields = Array.from(
      new Set([...(formConfig?.printEmpField || []), ...(formConfig?.printCustField || [])])
    );
  }

  return (
    <div>
      <div
        style={{
          marginBottom: '0.5rem',
          position: 'sticky',
          top: 0,
          background: '#ff9',
          zIndex: 1,
          paddingTop: '0.5rem',
          paddingBottom: '0.5rem',
          textAlign: 'left',
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
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: '0.5rem',
          marginBottom: '0.5rem',
          textAlign: 'left',
        }}
      >
      {formConfig?.dateField?.length > 0 && (
        <div style={{ backgroundColor: '#00e0ff', padding: '0.25rem', textAlign: 'left' }}>
          Date:{' '}
          <select
            value={datePreset}
            onChange={(e) => {
              const val = e.target.value;
              setDatePreset(val);
              const now = new Date();
              if (val === 'custom') {
                setCustomStartDate('');
                setCustomEndDate('');
                setDateFilter('');
                return;
              }
              if (val === 'month') {
                const m = String(now.getMonth() + 1).padStart(2, '0');
                setDateFilter(`${now.getFullYear()}.${m}`);
                return;
              }
              if (val === 'year') {
                setDateFilter(String(now.getFullYear()));
                return;
              }
              if (val === 'quarter') {
                const q = Math.floor(now.getMonth() / 3);
                const start = new Date(now.getFullYear(), q * 3, 1);
                const end = new Date(now.getFullYear(), q * 3 + 3, 0);
                setDateFilter(
                  `${start.toISOString().slice(0, 10)}-${end
                    .toISOString()
                    .slice(0, 10)}`,
                );
                return;
              }
              setDateFilter('');
            }}
            style={{ marginRight: '0.5rem' }}
          >
            <option value="custom">Custom</option>
            <option value="month">This Month</option>
            <option value="quarter">This Quarter</option>
            <option value="year">This Year</option>
          </select>
          {datePreset === 'custom' && (
            <>
              <input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                style={{ marginRight: '0.25rem' }}
              />
              <input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                style={{ marginRight: '0.5rem' }}
              />
            </>
          )}
          <button
            onClick={() => {
              setDateFilter('');
              setDatePreset('custom');
              setCustomStartDate('');
              setCustomEndDate('');
            }}
          >
            Clear Date Filter
          </button>
        </div>
      )}
      {formConfig?.transactionTypeField && (
        <div style={{ backgroundColor: '#ffd600', padding: '0.25rem', textAlign: 'left' }}>
          Type:{' '}
          {typeOptions.length > 0 ? (
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              style={{ marginRight: '0.5rem' }}
            >
              <option value="">-- all --</option>
              {typeOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          ) : (
            <span style={{ marginRight: '0.5rem' }}>{typeFilter || 'All'}</span>
          )}
          {typeFilter && (
            <button onClick={() => setTypeFilter('')}>Clear Transaction Type Filter</button>
          )}
        </div>
      )}
      </div>
      {showTable && (
        <>
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
          tableLayout: 'fixed',
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
                onClick={() => handleSort(c)}
                style={{
                  padding: '0.5rem',
                  border: '1px solid #d1d5db',
                  whiteSpace: 'normal',
                  wordBreak: 'break-word',
                  lineHeight: 1.2,
                  fontSize: '0.75rem',
                  textAlign: columnAlign[c],
                  width: columnWidths[c],
                  minWidth: columnWidths[c],
                  maxWidth: MAX_WIDTH,
                  resize: 'horizontal',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  cursor: 'pointer',
                  ...(columnWidths[c] <= ch(8)
                    ? {
                        writingMode: 'vertical-rl',
                        transform: 'rotate(180deg)',
                        overflowWrap: 'break-word',
                        maxHeight: '15ch',
                      }
                    : {}),
                }}
              >
                {labels[c] || c}
                {sort.column === c ? (sort.dir === 'asc' ? ' \u2191' : ' \u2193') : ''}
              </th>
            ))}
            <th style={{ padding: '0.5rem', border: '1px solid #d1d5db', whiteSpace: 'nowrap', width: 120 }}>Action</th>
          </tr>
          <tr>
            <th style={{ padding: '0.25rem', border: '1px solid #d1d5db', width: 60 }}></th>
            {columns.map((c) => (
            <th
              key={c}
              style={{
                padding: '0.25rem',
                border: '1px solid #d1d5db',
                whiteSpace: 'normal',
                wordBreak: 'break-word',
                fontSize: '0.75rem',
                textAlign: columnAlign[c],
                width: columnWidths[c],
                minWidth: columnWidths[c],
                maxWidth: MAX_WIDTH,
                resize: 'horizontal',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
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
            <tr
              key={r.id || JSON.stringify(r)}
              onClick={(e) => {
                const t = e.target.tagName;
                if (t !== 'INPUT' && t !== 'BUTTON' && t !== 'SELECT' && t !== 'A') {
                  openDetail(r);
                }
              }}
              style={{ cursor: 'pointer' }}
            >
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
              {columns.map((c) => {
                const w = columnWidths[c];
                const style = {
                  padding: '0.5rem',
                  border: '1px solid #d1d5db',
                  textAlign: columnAlign[c],
                };
                if (w) {
                  style.width = w;
                  style.minWidth = w;
                  style.maxWidth = MAX_WIDTH;
                  if (w <= 120) {
                    style.whiteSpace = 'nowrap';
                  } else {
                    style.whiteSpace = 'nowrap';
                    style.overflowX = 'auto';
                  }
                }
                style.overflow = 'hidden';
                style.textOverflow = 'ellipsis';
                const raw = relationOpts[c]
                  ? labelMap[c][r[c]] || String(r[c])
                  : String(r[c]);
                const display = placeholders[c]
                  ? normalizeDateInput(raw, placeholders[c])
                  : raw;
                const showFull = display.length > 20;
                return (
                  <td
                    key={c}
                    style={style}
                    title={raw}
                  >
                    {display}
                  </td>
                );
              })}
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
        </>
      )}
      <RowFormModal
        visible={showForm}
        onCancel={() => {
          setShowForm(false);
          setEditing(null);
          setIsAdding(false);
        }}
        onSubmit={handleSubmit}
        onChange={handleFieldChange}
        columns={formColumns}
        row={editing}
        relations={relationOpts}
        relationConfigs={relationConfigs}
        disabledFields={disabledFields}
        labels={labels}
        requiredFields={formConfig?.requiredFields || []}
        headerFields={headerFields}
        mainFields={mainFields}
        footerFields={footerFields}
        printEmpField={formConfig?.printEmpField || []}
        printCustField={formConfig?.printCustField || []}
        totalAmountFields={formConfig?.totalAmountFields || []}
        totalCurrencyFields={formConfig?.totalCurrencyFields || []}
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
        columns={columns}
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
});
