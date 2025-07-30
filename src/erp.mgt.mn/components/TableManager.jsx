import React, {
  useEffect,
  useState,
  useContext,
  useMemo,
  useImperativeHandle,
  forwardRef,
  useRef,
  memo,
} from 'react';
import { AuthContext } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import RowFormModal from './RowFormModal.jsx';
import CascadeDeleteModal from './CascadeDeleteModal.jsx';
import RowDetailModal from './RowDetailModal.jsx';
import useGeneralConfig from '../hooks/useGeneralConfig.js';
import formatTimestamp from '../utils/formatTimestamp.js';

function ch(n) {
  return Math.round(n * 8);
}

function logRowsMemory(rows) {
    if (process.env.NODE_ENV === 'production') return;
    try {
      const sizeMB = JSON.stringify(rows).length / 1024 / 1024;
    const timestamp = formatTimestamp(new Date());
      const message = `Loaded ${rows.length} transactions (~${sizeMB.toFixed(2)} MB) at ${timestamp}`;
      if (!window.memoryLogs) window.memoryLogs = [];
      if (window.memoryLogs.length >= 20) {
        window.memoryLogs.shift(); // remove oldest
      }
      window.memoryLogs.push(message);
      if (window.erpDebug) {
        if (sizeMB > 10 || rows.length > 10000) {
          console.warn(message);
        } else {
          console.log(message);
        }
      }
    } catch (err) {
      console.error('Failed to compute memory usage', err);
    }
  }

const MAX_WIDTH = ch(40);

const currencyFmt = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function normalizeDateInput(value, format) {
  if (typeof value !== 'string') return value;
  let v = value.trim().replace(/^(\d{4})[.,](\d{2})[.,](\d{2})/, '$1-$2-$3');
  if (/^\d{4}-\d{2}-\d{2}T/.test(v) && !isNaN(Date.parse(v))) {
    const local = formatTimestamp(new Date(v));
    return format === 'HH:MM:SS' ? local.slice(11, 19) : local.slice(0, 10);
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

const TableManager = forwardRef(function TableManager({
  table,
  refreshId = 0,
  formConfig = null,
  initialPerPage = 10,
  addLabel = 'Мөр нэмэх',
  showTable = true
}, ref) {
  const mounted = useRef(false);
  const renderCount = useRef(0);
  const warned = useRef(false);

  renderCount.current++;
  if (renderCount.current > 10 && !warned.current) {
    console.warn(`⚠️ Excessive renders: TableManager ${renderCount.current}`);
    warned.current = true;
  }

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      if (window.erpDebug) console.warn('✅ Mounted: TableManager');
    }
  }, []);
  
  const [rows, setRows] = useState([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(initialPerPage);
  const [filters, setFilters] = useState({});
  const [sort, setSort] = useState({ column: '', dir: 'asc' });
  const [relations, setRelations] = useState({});
  const [refData, setRefData] = useState({});
  const generalConfig = useGeneralConfig();
  const [refRows, setRefRows] = useState({});
  const [relationConfigs, setRelationConfigs] = useState({});
  const [columnMeta, setColumnMeta] = useState([]);
  const [autoInc, setAutoInc] = useState(new Set());
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [rowDefaults, setRowDefaults] = useState({});
  const [gridRows, setGridRows] = useState([]);
  const [selectedRows, setSelectedRows] = useState(new Set());
  const [localRefresh, setLocalRefresh] = useState(0);
  const [procTriggers, setProcTriggers] = useState({});
  const [deleteInfo, setDeleteInfo] = useState(null); // { id, refs }
  const [showCascade, setShowCascade] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [detailRow, setDetailRow] = useState(null);
  const [detailRefs, setDetailRefs] = useState([]);
  const [viewDisplayMap, setViewDisplayMap] = useState({});
  const [viewColumns, setViewColumns] = useState({});
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

  const validCols = useMemo(() => new Set(columnMeta.map((c) => c.name)), [columnMeta]);
  const columnCaseMap = useMemo(() => {
    const map = {};
    columnMeta.forEach((c) => {
      map[c.name.toLowerCase()] = c.name;
    });
    return map;
  }, [columnMeta]);

  const viewSourceMap = formConfig?.viewSource || {};

  const branchIdFields = useMemo(() => {
    if (formConfig?.branchIdFields?.length)
      return formConfig.branchIdFields.filter(f => validCols.has(f));
    return ['branch_id'].filter(f => validCols.has(f));
  }, [formConfig, validCols]);

  const departmentIdFields = useMemo(() => {
    if (formConfig?.departmentIdFields?.length)
      return formConfig.departmentIdFields.filter(f => validCols.has(f));
    return ['department_id'].filter(f => validCols.has(f));
  }, [formConfig, validCols]);

  const companyIdFields = useMemo(() => {
    if (formConfig?.companyIdFields?.length)
      return formConfig.companyIdFields.filter(f => validCols.has(f));
    return ['company_id'].filter(f => validCols.has(f));
  }, [formConfig, validCols]);

  const userIdFields = useMemo(() => {
    if (formConfig?.userIdFields?.length)
      return formConfig.userIdFields.filter(f => validCols.has(f));
    const defaultFields = ['created_by', 'employee_id', 'emp_id', 'empid', 'user_id'];
    return defaultFields.filter(f => validCols.has(f));
  }, [formConfig, validCols]);

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
    const views = Array.from(new Set(Object.values(viewSourceMap)));
    if (views.length === 0) {
      setViewDisplayMap({});
      setViewColumns({});
      return;
    }
    let canceled = false;
    views.forEach((v) => {
      fetch(`/api/display_fields?table=${encodeURIComponent(v)}`, {
        credentials: 'include',
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((cfg) => {
          if (canceled) return;
          setViewDisplayMap((m) => ({ ...m, [v]: cfg || {} }));
        })
        .catch(() => {});
      fetch(`/api/tables/${encodeURIComponent(v)}/columns`, {
        credentials: 'include',
      })
        .then((res) => (res.ok ? res.json() : []))
        .then((cols) => {
          if (canceled) return;
          setViewColumns((m) => ({ ...m, [v]: cols.map((c) => c.name) }));
        })
        .catch(() => {});
    });
    return () => {
      canceled = true;
    };
  }, [viewSourceMap]);

  useEffect(() => {
    if (!table) return;
    let canceled = false;
    fetch(`/api/proc_triggers?table=${encodeURIComponent(table)}`, {
      credentials: 'include',
    })
      .then((res) => (res.ok ? res.json() : {}))
      .then((data) => {
        if (!canceled) setProcTriggers(data || {});
      })
      .catch(() => {
        if (!canceled) setProcTriggers({});
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
      const today = formatTimestamp(new Date()).slice(0, 10);
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
    if (company?.branch_id !== undefined && branchIdFields.length > 0) {
      branchIdFields.forEach((f) => {
        if (validCols.has(f)) newFilters[f] = company.branch_id;
      });
    }
    if (company?.department_id !== undefined && departmentIdFields.length > 0) {
      departmentIdFields.forEach((f) => {
        if (validCols.has(f)) newFilters[f] = company.department_id;
      });
    }
    if (user?.empid !== undefined && userIdFields.length > 0) {
      userIdFields.forEach((f) => {
        if (validCols.has(f)) newFilters[f] = user.empid;
      });
    }
    if (Object.keys(newFilters).length > 0) {
      setFilters((f) => ({ ...f, ...newFilters }));
    }
  }, [formConfig, validCols, user, company]);

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
        const rowMap = {};
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
              rowMap[col] = {};
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

                const val = row[rel.column];
                rowMap[col][val] = row;
                return {
                  value: val,
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
          setRefRows(rowMap);
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
    if (!table || columnMeta.length === 0) return;
    let canceled = false;
    const params = new URLSearchParams({ page, perPage });
    if (sort.column && validCols.has(sort.column)) {
      params.set('sort', sort.column);
      params.set('dir', sort.dir);
    }
    Object.entries(filters).forEach(([k, v]) => {
      if (v && validCols.has(k)) params.set(k, v);
    });
    fetch(`/api/tables/${encodeURIComponent(table)}?${params.toString()}`, {
      credentials: 'include',
    })
      .then((res) => {
        if (canceled) return { rows: [], count: 0 };
        if (!res.ok) {
          addToast('Failed to load table data', 'error');
          return { rows: [], count: 0 };
        }
        return res.json().catch(() => {
          if (!canceled) addToast('Failed to parse table data', 'error');
          return { rows: [], count: 0 };
        });
      })
      .then((data) => {
        if (canceled) return;
        const rows = data.rows || [];
        setRows(rows);
        setCount(data.count || 0);
        // clear selections when data changes
        setSelectedRows(new Set());
        logRowsMemory(rows);
      })
      .catch(() => {
        if (!canceled) addToast('Failed to load table data', 'error');
      });
    return () => {
      canceled = true;
    };
  }, [table, page, perPage, filters, sort, refreshId, localRefresh, columnMeta, validCols]);

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
    const defaults = {};
    const all = columnMeta.map((c) => c.name);
    all.forEach((c) => {
      let v = (formConfig?.defaultValues || {})[c] || '';
      if (userIdFields.includes(c) && user?.empid) v = user.empid;
      if (branchIdFields.includes(c) && company?.branch_id !== undefined) v = company.branch_id;
      if (departmentIdFields.includes(c) && company?.department_id !== undefined) v = company.department_id;
      if (companyIdFields.includes(c) && company?.company_id !== undefined) v = company.company_id;
      vals[c] = v;
      defaults[c] = v;
      if (!v && formConfig?.dateField?.includes(c)) {
        const lower = c.toLowerCase();
        const now = new Date();
        if (lower.includes('timestamp') || (lower.includes('date') && lower.includes('time'))) {
          defaults[c] = formatTimestamp(now);
        } else if (lower.includes('date')) {
          defaults[c] = formatTimestamp(now).slice(0, 10);
        } else if (lower.includes('time')) {
          defaults[c] = formatTimestamp(now).slice(11, 19);
        }
      }
    });
    if (formConfig?.transactionTypeField && formConfig.transactionTypeValue) {
      vals[formConfig.transactionTypeField] = formConfig.transactionTypeValue;
      defaults[formConfig.transactionTypeField] = formConfig.transactionTypeValue;
    }
    setRowDefaults(defaults);
    setEditing(vals);
    setGridRows([vals]);
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
    setGridRows([row]);
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
    setEditing((e) => {
      const next = { ...e, ...changes };
      Object.entries(changes).forEach(([field, val]) => {
        const conf = relationConfigs[field];
        let value = val;
        if (value && typeof value === 'object' && 'value' in value) {
          value = value.value;
        }
        if (conf && conf.displayFields && refRows[field]?.[value]) {
          const row = refRows[field][value];
          conf.displayFields.forEach((df) => {
            const key = columnCaseMap[df.toLowerCase()];
            if (key && row[df] !== undefined) {
              next[key] = row[df];
            }
          });
        }
      });
      return next;
    });
    Object.entries(changes).forEach(([field, val]) => {
      const view = viewSourceMap[field];
      if (!view || val === '') return;
      const params = new URLSearchParams({ perPage: 1, debug: 1 });
      const cols = viewColumns[view] || [];
      Object.entries(viewSourceMap).forEach(([f, v]) => {
        if (v !== view) return;
        if (!cols.includes(f)) return;
        let pv = changes[f];
        if (pv === undefined) pv = editing?.[f];
        if (pv === undefined || pv === '') return;
        if (typeof pv === 'object' && 'value' in pv) pv = pv.value;
        params.set(f, pv);
      });
      const url = `/api/tables/${encodeURIComponent(view)}?${params.toString()}`;
      addToast(`Lookup ${view}: ${params.toString()}`, 'info');
      fetch(url, { credentials: 'include' })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (!data || !Array.isArray(data.rows) || data.rows.length === 0) {
            addToast('No view rows found', 'error');
            return;
          }
          addToast(`SQL: ${data.sql}`, 'info');
          const row = data.rows[0];
          addToast(`Result: ${JSON.stringify(row)}`, 'info');
          setEditing((e) => {
            if (!e) return e;
            const updated = { ...e };
            Object.entries(row).forEach(([k, v]) => {
              const key = columnCaseMap[k.toLowerCase()];
              if (key && updated[key] === undefined) {
                updated[key] = v;
              }
            });
            return updated;
          });
        })
        .catch((err) => {
          addToast(`View lookup failed: ${err.message}`, 'error');
        });
    });
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
      userIdFields.forEach((f) => {
        if (columns.has(f)) merged[f] = user?.empid;
      });
      branchIdFields.forEach((f) => {
        if (columns.has(f) && company?.branch_id !== undefined)
          merged[f] = company.branch_id;
      });
      departmentIdFields.forEach((f) => {
        if (columns.has(f) && company?.department_id !== undefined)
          merged[f] = company.department_id;
      });
      companyIdFields.forEach((f) => {
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
    const skipFields = new Set([...autoCols, 'id']);
    Object.entries(merged).forEach(([k, v]) => {
      if (skipFields.has(k)) return;
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
        const rows = data.rows || [];
        setRows(rows);
        setCount(data.count || 0);
        logRowsMemory(rows);
        setSelectedRows(new Set());
        setShowForm(false);
        setEditing(null);
        setIsAdding(false);
        setGridRows([]);
        const msg = isAdding ? 'Шинэ гүйлгээ хадгалагдлаа' : 'Хадгалагдлаа';
        addToast(msg, 'success');
        if (isAdding) {
          setTimeout(() => openAdd(), 0);
        }
        return true;
      } else {
        let message = 'Хадгалахад алдаа гарлаа';
        try {
          const data = await res.json();
          if (data && data.message) message += `: ${data.message}`;
        } catch {
          // ignore
        }
        addToast(message, 'error');
        return false;
      }
    } catch (err) {
      console.error('Save failed', err);
      return false;
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
      const rows = data.rows || [];
      setRows(rows);
      setCount(data.count || 0);
      logRowsMemory(rows);
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
    const rows = data.rows || [];
    setRows(rows);
    setCount(data.count || 0);
    logRowsMemory(rows);
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
    ? allColumns.filter((c) => formConfig.visibleFields.includes(c))
    : allColumns;
  const labels = {};
  columnMeta.forEach((c) => {
    labels[c.name] = c.label || c.name;
  });
  const hiddenColumns = ['password', 'created_by', 'created_at'];
  let columns = ordered.filter((c) => !hiddenColumns.includes(c));
  const placeholders = useMemo(() => {
    const map = {};
    const cols = new Set(allColumns);
    cols.forEach((c) => {
      const lower = c.toLowerCase();
      if (lower.includes('time') && !lower.includes('date')) {
        map[c] = 'HH:MM:SS';
      } else if (lower.includes('timestamp') || lower.includes('date')) {
        map[c] = 'YYYY-MM-DD';
      }
    });
    return map;
  }, [allColumns]);

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
  let formColumns = ordered.filter(
    (c) => !autoCols.has(c) && c !== 'created_at' && c !== 'created_by'
  );

  const lockedDefaults = Object.entries(formConfig?.defaultValues || {})
    .filter(
      ([k, v]) =>
        v !== undefined && v !== '' &&
        !(formConfig?.editableDefaultFields || []).includes(k)
    )
    .map(([k]) => k);

  const headerFields = formConfig?.headerFields || [];

  const mainFields = formConfig?.mainFields || [];

  const footerFields = formConfig?.footerFields || [];

  const sectionFields = new Set([...headerFields, ...mainFields, ...footerFields]);
  sectionFields.forEach((f) => {
    if (!formColumns.includes(f) && allColumns.includes(f)) formColumns.push(f);
  });

  const provided = Array.isArray(formConfig?.editableFields)
    ? formConfig.editableFields
    : [];
  const defaults = Array.isArray(formConfig?.editableDefaultFields)
    ? formConfig.editableDefaultFields
    : [];
  const editVals = Array.from(new Set([...defaults, ...provided]));
  const editSet = editVals.length > 0 ? new Set(editVals.map((f) => f.toLowerCase())) : null;
  let disabledFields = editSet
    ? formColumns.filter((c) => !editSet.has(c.toLowerCase()))
    : [];
  disabledFields = editing
    ? Array.from(new Set([...disabledFields, ...getKeyFields(), ...lockedDefaults]))
    : Array.from(new Set([...disabledFields, ...lockedDefaults]));

  const totalAmountSet = useMemo(
    () => new Set(formConfig?.totalAmountFields || []),
    [formConfig],
  );
  const totalCurrencySet = useMemo(
    () => new Set(formConfig?.totalCurrencyFields || []),
    [formConfig],
  );
  const totals = useMemo(() => {
    const sums = {};
    columns.forEach((c) => {
      if (
        totalAmountSet.has(c) ||
        totalCurrencySet.has(c) ||
        c === 'TotalCur' ||
        c === 'TotalAmt'
      ) {
        sums[c] = rows.reduce(
          (sum, r) => sum + Number(String(r[c] ?? 0).replace(',', '.')),
          0,
        );
      }
    });
    return { sums, count: rows.length };
  }, [columns, rows, totalAmountSet, totalCurrencySet]);

  const showTotals = useMemo(
    () =>
      columns.some(
        (c) =>
          totalAmountSet.has(c) ||
          totalCurrencySet.has(c) ||
          c === 'TotalCur' ||
          c === 'TotalAmt',
      ),
    [columns, totalAmountSet, totalCurrencySet],
  );

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
                setDateFilter(`${now.getFullYear()}-${m}`);
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
                  `${formatTimestamp(start).slice(0, 10)}-${formatTimestamp(end).slice(0, 10)}`,
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
      {branchIdFields.length > 0 && company?.branch_id !== undefined && (
        <div style={{ backgroundColor: '#ddffee', padding: '0.25rem', textAlign: 'left' }}>
          Branch:{' '}
          <span style={{ marginRight: '0.5rem' }}>{company.branch_id}</span>
          {user?.role === 'admin' && (
            <button
              onClick={() =>
                branchIdFields.forEach((f) => handleFilterChange(f, ''))
              }
            >
              Clear Branch Filter
            </button>
          )}
        </div>
      )}
      {departmentIdFields.length > 0 && company?.department_id !== undefined && (
        <div style={{ backgroundColor: '#eefcff', padding: '0.25rem', textAlign: 'left' }}>
          Department:{' '}
          <span style={{ marginRight: '0.5rem' }}>{company.department_id}</span>
          {user?.role === 'admin' && (
            <button onClick={() => departmentIdFields.forEach((f) => handleFilterChange(f, ''))}>
              Clear Department Filter
            </button>
          )}
        </div>
      )}
      {userIdFields.length > 0 && user?.empid !== undefined && (
        <div style={{ backgroundColor: '#ffeecc', padding: '0.25rem', textAlign: 'left' }}>
          User:{' '}
          <span style={{ marginRight: '0.5rem' }}>{user.empid}</span>
          {user?.role === 'admin' && (
            <button
              onClick={() =>
                userIdFields.forEach((f) => handleFilterChange(f, ''))
              }
            >
              Clear User Filter
            </button>
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
                let display = raw;
                if (c === 'TotalCur' || totalCurrencySet.has(c)) {
                  display = currencyFmt.format(Number(r[c] || 0));
                } else if (placeholders[c]) {
                  display = normalizeDateInput(raw, placeholders[c]);
                }
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
      {showTotals && (
        <tfoot>
          <tr>
            <td
              style={{
                padding: '0.5rem',
                border: '1px solid #d1d5db',
                fontWeight: 'bold',
                textAlign: 'center',
              }}
            >
              НИЙТ
            </td>
            {columns.map((c) => {
              let val = '';
              if (c === 'TotalCur') val = currencyFmt.format(totals.sums[c] || 0);
              else if (totalCurrencySet.has(c))
                val = currencyFmt.format(totals.sums[c] || 0);
              else if (totals.sums[c] !== undefined) val = totals.sums[c];
              return (
                <td
                  key={c}
                  style={{
                    padding: '0.5rem',
                    border: '1px solid #d1d5db',
                    textAlign: columnAlign[c],
                    fontWeight: 'bold',
                  }}
                >
                  {val}
                </td>
              );
            })}
            <td style={{ padding: '0.5rem', border: '1px solid #d1d5db' }}></td>
          </tr>
          <tr>
            <td
              style={{
                padding: '0.5rem',
                border: '1px solid #d1d5db',
                fontWeight: 'bold',
                textAlign: 'center',
              }}
            >
              мөрийн тоо
            </td>
            {columns.length > 0 && (
              <td
                style={{
                  padding: '0.5rem',
                  border: '1px solid #d1d5db',
                  textAlign: columnAlign[columns[0]],
                  fontWeight: 'bold',
                }}
              >
                {totals.count}
              </td>
            )}
            {columns.slice(1).map((c) => (
              <td
                key={c}
                style={{ padding: '0.5rem', border: '1px solid #d1d5db' }}
              ></td>
            ))}
            <td style={{ padding: '0.5rem', border: '1px solid #d1d5db' }}></td>
          </tr>
        </tfoot>
      )}
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
        key={`rowform-${table}`}
        visible={showForm}
        useGrid
        onCancel={() => {
          setShowForm(false);
          setEditing(null);
          setIsAdding(false);
          setGridRows([]);
        }}
        onSubmit={handleSubmit}
        onChange={handleFieldChange}
        columns={formColumns}
        row={editing}
        rows={gridRows}
        relations={relationOpts}
        relationConfigs={relationConfigs}
        relationData={refRows}
        disabledFields={disabledFields}
        labels={labels}
        requiredFields={formConfig?.requiredFields || []}
        defaultValues={rowDefaults}
        dateField={formConfig?.dateField || []}
        headerFields={headerFields}
        mainFields={mainFields}
        footerFields={footerFields}
        userIdFields={userIdFields}
        branchIdFields={branchIdFields}
        departmentIdFields={departmentIdFields}
        companyIdFields={companyIdFields}
        printEmpField={formConfig?.printEmpField || []}
        printCustField={formConfig?.printCustField || []}
        totalAmountFields={formConfig?.totalAmountFields || []}
        totalCurrencyFields={formConfig?.totalCurrencyFields || []}
        procTriggers={procTriggers}
        columnCaseMap={columnCaseMap}
        table={table}
        imagenameField={formConfig?.imagenameField || []}
        viewSource={viewSourceMap}
        viewDisplays={viewDisplayMap}
        viewColumns={viewColumns}
        onRowsChange={setGridRows}
        scope="forms"
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

function propsEqual(prev, next) {
  return (
    prev.table === next.table &&
    prev.refreshId === next.refreshId &&
    prev.formConfig === next.formConfig &&
    prev.showTable === next.showTable
  );
}

export default memo(TableManager, propsEqual);
