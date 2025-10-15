import React, { useState, useEffect, useRef, useContext, memo, useCallback } from 'react';
import AsyncSearchSelect from './AsyncSearchSelect.jsx';
import Modal from './Modal.jsx';
import InlineTransactionTable from './InlineTransactionTable.jsx';
import RowDetailModal from './RowDetailModal.jsx';
import TooltipWrapper from './TooltipWrapper.jsx';
import { useTranslation } from 'react-i18next';
import { AuthContext } from '../context/AuthContext.jsx';
import formatTimestamp from '../utils/formatTimestamp.js';
import normalizeDateInput from '../utils/normalizeDateInput.js';
import callProcedure from '../utils/callProcedure.js';
import {
  applyGeneratedColumnEvaluators,
  createGeneratedColumnEvaluator,
} from '../utils/generatedColumns.js';
import useGeneralConfig from '../hooks/useGeneralConfig.js';
import { API_BASE } from '../utils/apiBase.js';

const RowFormModal = function RowFormModal({
  visible,
  onCancel,
  onSubmit,
  columns,
  row,
  rows = [],
  relations = {},
  relationConfigs = {},
  relationData = {},
  loadRelationRow = null,
  fieldTypeMap = {},
  disabledFields = [],
  labels = {},
  requiredFields = [],
  onChange = () => {},
  onRowsChange = () => {},
  headerFields = [],
  footerFields = [],
  mainFields = [],
  userIdFields = [],
  branchIdFields = [],
  departmentIdFields = [],
  companyIdFields = [],
  printEmpField = [],
  printCustField = [],
  totalAmountFields = [],
  totalCurrencyFields = [],
  defaultValues = {},
  dateField = [],
  inline = false,
  useGrid = false,
  fitted = false,
  table = '',
  imagenameField = [],
  imageIdField = '',
  scope = 'forms',
  labelFontSize,
  boxWidth,
  boxHeight,
  boxMaxWidth,
  boxMaxHeight,
  onNextForm = null,
  columnCaseMap = {},
  viewSource = {},
  viewDisplays = {},
  viewColumns = {},
  loadView = () => {},
  procTriggers = {},
  autoFillSession = true,
  tableColumns = [],
  onSaveTemporary = null,
  allowTemporarySave = false,
  isAdding = false,
  canPost = true,
}) {
  const mounted = useRef(false);
  const renderCount = useRef(0);
  const warned = useRef(false);
  const procCache = useRef({});
  const [tableDisplayFields, setTableDisplayFields] = useState({});
  useEffect(() => {
    fetch('/api/display_fields', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : {}))
      .then(setTableDisplayFields)
      .catch(() => {});
  }, []);
  const generalConfig = useGeneralConfig();
  const cfg = generalConfig[scope] || {};
  const general = generalConfig.general || {};
  const { t } = useTranslation(['translation', 'tooltip']);
  labelFontSize = labelFontSize ?? cfg.labelFontSize ?? 14;
  boxWidth = boxWidth ?? cfg.boxWidth ?? 60;
  boxHeight = boxHeight ?? cfg.boxHeight ?? 30;
  boxMaxWidth = boxMaxWidth ?? cfg.boxMaxWidth ?? 150;
  boxMaxHeight = boxMaxHeight ?? cfg.boxMaxHeight ?? 150;
  const [isNarrow, setIsNarrow] = useState(() => window.innerWidth < 768);
  useEffect(() => {
    const h = () => setIsNarrow(window.innerWidth < 768);
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);

  renderCount.current++;
  if (renderCount.current > 10 && !warned.current) {
    console.warn(`⚠️ Excessive renders: RowFormModal ${renderCount.current}`);
    warned.current = true;
  }

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      if (window.erpDebug) {
        console.warn('✅ Mounted: RowFormModal');
      }
    }
  }, []);
  const headerSet = new Set(headerFields);
  const footerSet = new Set(footerFields);
  const userIdSet = React.useMemo(() => new Set(userIdFields || []), [userIdFields]);
  const branchIdSet = React.useMemo(() => new Set(branchIdFields || []), [branchIdFields]);
  const departmentIdSet = React.useMemo(
    () => new Set(departmentIdFields || []),
    [departmentIdFields],
  );
  const companyIdSet = React.useMemo(() => new Set(companyIdFields || []), [companyIdFields]);
  const requiredFieldSet = React.useMemo(
    () => new Set((requiredFields || []).map((f) => f.toLowerCase())),
    [requiredFields],
  );
  const branchIdLowerSet = React.useMemo(
    () => new Set((branchIdFields || []).map((f) => f.toLowerCase())),
    [branchIdFields],
  );
  const companyIdLowerSet = React.useMemo(
    () => new Set((companyIdFields || []).map((f) => f.toLowerCase())),
    [companyIdFields],
  );
  const departmentIdLowerSet = React.useMemo(
    () => new Set((departmentIdFields || []).map((f) => f.toLowerCase())),
    [departmentIdFields],
  );
  const userIdLowerSet = React.useMemo(
    () => new Set((userIdFields || []).map((f) => f.toLowerCase())),
    [userIdFields],
  );
  const disabledSet = React.useMemo(
    () => new Set(disabledFields.map((f) => f.toLowerCase())),
    [disabledFields],
  );
  const { user, company, branch, department, userSettings } = useContext(AuthContext);
  const columnCaseMapKey = React.useMemo(
    () => JSON.stringify(columnCaseMap || {}),
    [columnCaseMap],
  );
  const viewSourceKey = React.useMemo(() => JSON.stringify(viewSource || {}), [viewSource]);
  const relationConfigsKey = React.useMemo(
    () => JSON.stringify(relationConfigs || {}),
    [relationConfigs],
  );
  const tableDisplayFieldsKey = React.useMemo(
    () => JSON.stringify(tableDisplayFields || {}),
    [tableDisplayFields],
  );

  const viewSourceMap = React.useMemo(() => {
    const map = {};
    Object.entries(viewSource || {}).forEach(([k, v]) => {
      const key = columnCaseMap[k.toLowerCase()] || k;
      map[key] = v;
    });
    return map;
  }, [viewSourceKey, columnCaseMapKey]);

  const relationConfigMap = React.useMemo(() => {
    const map = {};
    Object.entries(relationConfigs || {}).forEach(([k, v]) => {
      const key = columnCaseMap[k.toLowerCase()] || k;
      map[key] = v;
    });
    return map;
  }, [relationConfigsKey, columnCaseMapKey]);
  const relationConfigMapKey = React.useMemo(
    () => JSON.stringify(relationConfigMap || {}),
    [relationConfigMap],
  );

  const displayIndex = React.useMemo(() => {
    const index = {};
    Object.entries(tableDisplayFields || {}).forEach(([tbl, cfg]) => {
      const id = cfg.idField;
      if (!id) return;
      index[id.toLowerCase()] = {
        table: tbl,
        idField: cfg.idField,
        displayFields: cfg.displayFields || [],
      };
    });
    return index;
  }, [tableDisplayFieldsKey]);

  const relationsKey = React.useMemo(() => JSON.stringify(relations || {}), [relations]);

  const tableRelationsConfig = React.useMemo(() => {
    if (!table) return {};
    const sources = [generalConfig?.tableRelations, general?.tableRelations, cfg?.tableRelations];
    const lowerTable = String(table).toLowerCase();
    for (const src of sources) {
      if (!src || typeof src !== 'object') continue;
      let entry = src[table];
      if (!entry) {
        const match = Object.keys(src).find(
          (key) => typeof key === 'string' && key.toLowerCase() === lowerTable,
        );
        if (match) entry = src[match];
      }
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
      const normalized = {};
      Object.keys(entry).forEach((col) => {
        if (typeof col !== 'string') return;
        const mapped = columnCaseMap[col.toLowerCase()] || col;
        if (typeof mapped === 'string') {
          normalized[mapped] = entry[col];
        }
      });
      if (Object.keys(normalized).length > 0) {
        return normalized;
      }
    }
    return {};
  }, [generalConfig, general, cfg, table, columnCaseMap, columnCaseMapKey]);

  const tableRelationsKey = React.useMemo(
    () => JSON.stringify(tableRelationsConfig || {}),
    [tableRelationsConfig],
  );

  const relatedColumns = React.useMemo(() => {
    const set = new Set(Object.keys(relationConfigMap || {}));
    Object.entries(relations || {}).forEach(([rawKey, value]) => {
      if (!value) return;
      const mapped = columnCaseMap[rawKey.toLowerCase()] || rawKey;
      if (!mapped) return;
      if (Array.isArray(value)) {
        if (value.length > 0) set.add(mapped);
        return;
      }
      if (typeof value === 'object' && Object.keys(value).length > 0) {
        set.add(mapped);
      }
    });
    Object.keys(tableRelationsConfig || {}).forEach((key) => set.add(key));
    return set;
  }, [relationConfigMapKey, relationsKey, tableRelationsKey, columnCaseMapKey, columnCaseMap]);

  // Only columns present in columnCaseMap are evaluated, preventing cross-table false positives.
  const autoSelectConfigs = React.useMemo(() => {
    const map = {};
    const ensureConfig = (field) => {
      if (!map[field]) map[field] = {};
      return map[field];
    };
    const mergeSource = (target, source) => {
      if (!source || typeof source !== 'object') return;
      if (!target.table && typeof source.table === 'string') {
        target.table = source.table;
      }
      const srcId = source.idField || source.column;
      if (!target.idField && typeof srcId === 'string') {
        target.idField = srcId;
      }
      const srcDisplay = Array.isArray(source.displayFields)
        ? source.displayFields.filter((f) => typeof f === 'string')
        : [];
      if ((!target.displayFields || target.displayFields.length === 0) && srcDisplay.length > 0) {
        target.displayFields = srcDisplay;
      }
    };

    Object.entries(columnCaseMap || {}).forEach(([lower, column]) => {
      if (!relatedColumns.has(column)) return;
      const target = ensureConfig(column);
      mergeSource(target, relationConfigMap[column]);

      const tableRelation = tableRelationsConfig[column];
      if (Array.isArray(tableRelation)) {
        tableRelation.forEach((rel) => mergeSource(target, rel));
      } else {
        mergeSource(target, tableRelation);
      }

      mergeSource(target, displayIndex[lower]);

      if (!target.table || !target.idField) {
        delete map[column];
      } else if (!target.displayFields) {
        target.displayFields = [];
      }
    });

    return map;
  }, [columnCaseMapKey, relatedColumns, relationConfigMapKey, tableRelationsKey, displayIndex]);
  const getRowValueCaseInsensitive = useCallback((rowObj, key) => {
    if (!rowObj || !key) return undefined;
    const lowerKey = key.toLowerCase();
    const match = Object.keys(rowObj).find((k) => k.toLowerCase() === lowerKey);
    if (match === undefined) return undefined;
    return rowObj[match];
  }, []);
  const viewSourceMapKey = React.useMemo(
    () => JSON.stringify(viewSourceMap || {}),
    [viewSourceMap],
  );
  const viewDisplaysKey = React.useMemo(
    () => JSON.stringify(viewDisplays || {}),
    [viewDisplays],
  );
  const viewColumnsKey = React.useMemo(
    () => JSON.stringify(viewColumns || {}),
    [viewColumns],
  );
  const fieldTypeMapKey = React.useMemo(
    () => JSON.stringify(fieldTypeMap || {}),
    [fieldTypeMap],
  );
  const columnsKey = React.useMemo(() => columns.join(','), [columns]);
  const columnLowerSet = React.useMemo(
    () => new Set(columns.map((col) => String(col).toLowerCase())),
    [columnsKey],
  );
  const rowKey = React.useMemo(() => JSON.stringify(row || {}), [row]);
  const defaultValuesKey = React.useMemo(
    () => JSON.stringify(defaultValues || {}),
    [defaultValues],
  );
  const generatedColumnEvaluators = React.useMemo(() => {
    const map = {};
    if (!Array.isArray(tableColumns)) return map;
    tableColumns.forEach((col) => {
      if (!col || typeof col !== 'object') return;
      const rawName = col.name;
      const expr =
        col.generationExpression ??
        col.GENERATION_EXPRESSION ??
        col.generation_expression ??
        null;
      if (!rawName || !expr) return;
      const key = columnCaseMap[String(rawName).toLowerCase()] || rawName;
      if (typeof key !== 'string') return;
      const evaluator = createGeneratedColumnEvaluator(expr, columnCaseMap);
      if (evaluator) map[key] = evaluator;
    });
    return map;
  }, [tableColumns, columnCaseMap, columnCaseMapKey]);
  const [formVals, setFormVals] = useState(() => {
    const init = {};
    const now = new Date();
    columns.forEach((c) => {
      const typ = fieldTypeMap[c];
      let placeholder = '';
      if (typ === 'time') {
        placeholder = 'HH:MM:SS';
      } else if (typ === 'date' || typ === 'datetime') {
        placeholder = 'YYYY-MM-DD';
      }
      const rowValue = row ? getRowValueCaseInsensitive(row, c) : undefined;
      const sourceValue =
        rowValue !== undefined ? rowValue : defaultValues[c];
      const raw = String(sourceValue ?? '');
      let val = normalizeDateInput(raw, placeholder);
      const missing =
        !row || rowValue === undefined || rowValue === '';
      if (missing && !val && dateField.includes(c)) {
        if (placeholder === 'YYYY-MM-DD') val = formatTimestamp(now).slice(0, 10);
        else if (placeholder === 'HH:MM:SS') val = formatTimestamp(now).slice(11, 19);
        else val = formatTimestamp(now);
      }
      if (autoFillSession && missing && !val) {
        if (userIdSet.has(c) && user?.empid) val = user.empid;
        else if (branchIdSet.has(c) && branch !== undefined)
          val = branch;
        else if (departmentIdSet.has(c) && department !== undefined)
          val = department;
        else if (companyIdSet.has(c) && company !== undefined)
          val = company;
      }
      init[c] = val;
    });
    return init;
  });
  const [extraVals, setExtraVals] = useState(() => {
    const extras = {};
    Object.entries(row || {}).forEach(([k, v]) => {
      const lowerKey = String(k).toLowerCase();
      if (!columnLowerSet.has(lowerKey)) {
        const typ = fieldTypeMap[k];
        let placeholder = '';
        if (typ === 'time') {
          placeholder = 'HH:MM:SS';
        } else if (typ === 'date' || typ === 'datetime') {
          placeholder = 'YYYY-MM-DD';
        }
        extras[k] = normalizeDateInput(String(v ?? ''), placeholder);
      }
    });
    return extras;
  });
  const formValsRef = useRef(formVals);
  const extraValsRef = useRef(extraVals);
  useEffect(() => {
    formValsRef.current = formVals;
  }, [formVals]);
  useEffect(() => {
    extraValsRef.current = extraVals;
  }, [extraVals]);
  const computeNextFormVals = useCallback((baseRow, prevRow) => {
    if (!baseRow || typeof baseRow !== 'object') {
      return { next: baseRow, diff: {} };
    }
    const working = baseRow;
    const evaluators = generatedColumnEvaluators || {};
    let generatedChanged = false;
    if (Object.keys(evaluators).length > 0) {
      const rows = [working];
      const result = applyGeneratedColumnEvaluators({
        targetRows: rows,
        evaluators,
        equals: valuesEqual,
      });
      generatedChanged = Boolean(result?.changed);
    }
    const source = prevRow || {};
    const diff = {};
    const keys = new Set([
      ...Object.keys(source || {}),
      ...Object.keys(working || {}),
    ]);
    keys.forEach((key) => {
      const nextVal = working?.[key];
      const prevVal = source?.[key];
      if (!valuesEqual(prevVal, nextVal)) {
        diff[key] = nextVal;
      }
    });
    if (generatedChanged) {
      return { next: { ...working }, diff };
    }
    return { next: working, diff };
  }, [generatedColumnEvaluators]);

  const setFormValuesWithGenerated = useCallback(
    (updater, { notify = true } = {}) => {
      let pendingDiff = null;
      let snapshot = null;
      setFormVals((prev) => {
        const base = typeof updater === 'function' ? updater(prev) : updater;
        if (!base) {
          snapshot = prev;
          return prev;
        }
        const working = { ...base };
        const { next, diff } = computeNextFormVals(working, prev);
        if (!diff || Object.keys(diff).length === 0) {
          snapshot = prev;
          return prev;
        }
        pendingDiff = diff;
        if (valuesEqual(prev, next)) {
          snapshot = prev;
          return prev;
        }
        snapshot = next;
        return next;
      });
      if (notify && pendingDiff && Object.keys(pendingDiff).length > 0) {
        onChange(pendingDiff);
      }
      return { snapshot: snapshot ?? formValsRef.current, diff: pendingDiff };
    },
    [computeNextFormVals, onChange],
  );
  const handleRelationChange = useCallback(
    (col, nextVal) => {
      setFormValuesWithGenerated((prev) => {
        if (valuesEqual(prev[col], nextVal)) return prev;
        return { ...prev, [col]: nextVal };
      });
      setErrors((er) => ({ ...er, [col]: undefined }));
      if (typeof loadRelationRow === 'function') {
        let raw = nextVal;
        if (raw && typeof raw === 'object' && 'value' in raw) {
          raw = raw.value;
        }
        if (raw !== undefined && raw !== null && raw !== '') {
          loadRelationRow(col, raw);
        }
      }
    },
    [loadRelationRow, setErrors, setFormValuesWithGenerated],
  );
  const inputRefs = useRef({});
  const readonlyRefs = useRef({});
  const [errors, setErrors] = useState({});
  const [submitLocked, setSubmitLocked] = useState(false);
  const tableRef = useRef(null);
  const [gridRows, setGridRows] = useState(() => (Array.isArray(rows) ? rows : []));
  const prevRowsRef = useRef(rows);
  const wrapRef = useRef(null);
  const [zoom, setZoom] = useState(1);
  const [previewRow, setPreviewRow] = useState(null);
  const [seedOptions, setSeedOptions] = useState([]);
  const [seedRecordOptions, setSeedRecordOptions] = useState({});
  const [openSeed, setOpenSeed] = useState({});
  const alreadyRequestedRef = useRef(new Set());

  useEffect(() => {
    if (visible) {
      alreadyRequestedRef.current.clear();
    }
  }, [visible]);

  useEffect(() => {
    if (!visible || typeof loadRelationRow !== 'function') return;
    const pending = [];
    Object.keys(relationConfigMap || {}).forEach((col) => {
      let val = formVals[col];
      if (val && typeof val === 'object') val = val.value;
      if (val === undefined || val === null || val === '') return;
      if (relationData[col]?.[String(val)]) return;
      pending.push(loadRelationRow(col, val));
    });
    return () => {
      pending.forEach((p) => {
        if (p && typeof p.then === 'function') {
          p.catch(() => {});
        }
      });
    };
  }, [
    visible,
    relationConfigMap,
    relationData,
    formVals,
    loadRelationRow,
  ]);

  useEffect(() => {
    if (!useGrid) return;
    if (prevRowsRef.current !== rows) {
      prevRowsRef.current = rows;
      setGridRows(Array.isArray(rows) ? rows : []);
    }
  }, [rows, useGrid]);

  useEffect(() => {
    if (!fitted) return;
    const wrap = wrapRef.current;
    const parent = wrap?.parentElement || null;

    function updateZoom() {
      if (!wrap || !parent) return;
      const { scrollWidth, scrollHeight } = wrap;
      const wRatio = scrollWidth ? parent.clientWidth / scrollWidth : 1;
      const hRatio = scrollHeight ? parent.clientHeight / scrollHeight : 1;
      const s = Math.min(1, wRatio, hRatio);
      setZoom(s);
    }

    updateZoom();
    const ro = parent ? new ResizeObserver(updateZoom) : null;
    if (ro && parent) ro.observe(parent);
    window.addEventListener('resize', updateZoom);

    return () => {
      if (ro && parent) ro.disconnect();
      window.removeEventListener('resize', updateZoom);
    };
  }, [fitted, visible]);
  const handleGridRowsChange = useCallback(
    (rs) => {
      setGridRows(rs);
      onRowsChange(rs);
    },
    [onRowsChange],
  );
  const placeholders = React.useMemo(() => {
    const map = {};
    const cols = new Set([
      ...columns,
      ...Object.keys(row || {}),
      ...Object.keys(defaultValues || {}),
    ]);
    cols.forEach((c) => {
      const typ = fieldTypeMap[c];
      if (typ === 'time') {
        map[c] = 'HH:MM:SS';
      } else if (typ === 'date' || typ === 'datetime') {
        map[c] = 'YYYY-MM-DD';
      }
    });
    return map;
  }, [columnsKey, rowKey, defaultValuesKey, fieldTypeMapKey]);

  useEffect(() => {
    const extras = {};
    Object.entries(row || {}).forEach(([k, v]) => {
      const lowerKey = String(k).toLowerCase();
      if (!columnLowerSet.has(lowerKey)) {
        extras[k] = normalizeDateInput(String(v ?? ''), placeholders[k]);
      }
    });
    setExtraVals(extras);
  }, [row, columnLowerSet, placeholders]);

  useEffect(() => {
    if (table !== 'companies' || row) return;
    fetch('/api/tenant_tables', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        const opts = (data || []).filter(
          (t) => t.seedOnCreate && !t.isShared,
        );
        setSeedOptions(opts);
        setExtraVals((e) => ({
          ...e,
          seedTables: opts.map((o) => o.tableName),
        }));
        opts.forEach((o) => loadSeedRecords(o.tableName));
      })
      .catch(() => {});
  }, [table, row]);

  function toggleSeedTable(name) {
    setExtraVals((e) => {
      const set = new Set(e.seedTables || []);
      if (set.has(name)) set.delete(name);
      else set.add(name);
      return { ...e, seedTables: Array.from(set) };
    });
  }

  async function loadSeedRecords(name) {
    setSeedRecordOptions((prev) => ({
      ...prev,
      [name]: { loading: true, columns: [], pk: null },
    }));
    try {
      const [rowsRes, colsRes] = await Promise.all([
        fetch(`/api/tables/${encodeURIComponent(name)}?company_id=0&perPage=500`, {
          credentials: 'include',
        }),
        fetch(`/api/tables/${encodeURIComponent(name)}/columns`, {
          credentials: 'include',
        }),
      ]);
      if (!rowsRes.ok || !colsRes.ok) throw new Error('Failed to load');
      const rowsData = await rowsRes.json();
      const cols = await colsRes.json();
      const pk = cols.find((c) => c.key === 'PRI')?.name;
      const recs = {};
      (rowsData.rows || []).forEach((r) => {
        if (pk && r[pk] !== undefined) recs[r[pk]] = r;
      });
      setSeedRecordOptions((prev) => ({
        ...prev,
        [name]: { loading: false, columns: cols.map((c) => c.name), pk },
      }));
      setExtraVals((e) => ({
        ...e,
        seedRecords: {
          ...(e.seedRecords || {}),
          [name]: recs,
        },
      }));
    } catch {
      setSeedRecordOptions((prev) => ({
        ...prev,
        [name]: { loading: false, columns: [], pk: null },
      }));
    }
  }

  function toggleSeedOpen(name) {
    setOpenSeed((o) => ({ ...o, [name]: !o[name] }));
  }

  function handleSeedRecordChange(tableName, id, column, value) {
    setExtraVals((e) => {
      const tables = { ...(e.seedRecords || {}) };
      const recs = { ...(tables[tableName] || {}) };
      const row = { ...(recs[id] || {}) };
      row[column] = value;
      recs[id] = row;
      tables[tableName] = recs;
      return { ...e, seedRecords: tables };
    });
  }

  function renderSeedTable(name) {
    const opt = seedRecordOptions[name];
    if (!opt) return null;
    const columns = opt.columns || [];
    const pk = opt.pk;
    const recs = (extraVals.seedRecords || {})[name] || {};
    if (Object.keys(recs).length === 0) {
      return <div className="p-2 text-sm text-gray-500">No records</div>;
    }
    return (
      <div className="p-2 overflow-x-auto">
        <table className="min-w-full text-sm border">
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c} className="border px-1">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Object.entries(recs).map(([id, row]) => (
              <tr key={id}>
                {columns.map((c) => (
                  <td key={c} className="border px-1">
                    <input
                      className="border px-1 w-full"
                      value={row[c] ?? ''}
                      readOnly={c === pk}
                      onChange={(e) => handleSeedRecordChange(name, id, c, e.target.value)}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  function normalizeNumberInput(value) {
    if (typeof value !== 'string') return value;
    return value.replace(',', '.');
  }

  function isValidDate(value, format) {
    if (!value) return true;
    const normalized = normalizeDateInput(value, format);
    const map = {
      'YYYY-MM-DD': /^\d{4}-\d{2}-\d{2}$/,
      'HH:MM:SS': /^\d{2}:\d{2}:\d{2}$/,
    };
    const re = map[format];
    if (!re) return true;
    if (!re.test(normalized)) return false;
    if (format !== 'HH:MM:SS') {
      const d = new Date(normalized.replace(' ', 'T'));
      return !isNaN(d.getTime());
    }
    return true;
  }

  useEffect(() => {
    if (!visible) return;
    const vals = {};
    columns.forEach((c) => {
      const rowValue = row ? getRowValueCaseInsensitive(row, c) : undefined;
      const sourceValue =
        rowValue !== undefined ? rowValue : defaultValues[c];
      const raw = String(sourceValue ?? '');
      let v = normalizeDateInput(raw, placeholders[c]);
      const missing =
        !row || rowValue === undefined || rowValue === '';
      if (missing && !v && dateField.includes(c)) {
        const now = new Date();
        if (placeholders[c] === 'YYYY-MM-DD') v = formatTimestamp(now).slice(0, 10);
        else if (placeholders[c] === 'HH:MM:SS') v = formatTimestamp(now).slice(11, 19);
        else v = formatTimestamp(now);
      }
      if (missing && !v) {
        if (userIdSet.has(c) && user?.empid) v = user.empid;
        else if (branchIdSet.has(c) && branch !== undefined)
          v = branch;
        else if (departmentIdSet.has(c) && department !== undefined)
          v = department;
        else if (companyIdSet.has(c) && company !== undefined)
          v = company;
      }
      vals[c] = v;
    });
    inputRefs.current = {};
    setErrors({});
    setFormValuesWithGenerated(() => vals, { notify: false });
  }, [
    row,
    visible,
    user,
    company,
    branch,
    department,
    columns,
    placeholders,
    defaultValues,
    dateField,
    userIdSet,
    branchIdSet,
    departmentIdSet,
    companyIdSet,
    setFormValuesWithGenerated,
  ]);

  function resizeInputs() {
    Object.values({ ...inputRefs.current, ...readonlyRefs.current }).forEach((el) => {
      if (!el) return;
      if (el.tagName === 'INPUT' || el.tagName === 'DIV') {
        el.style.width = 'auto';
        const w = Math.min(el.scrollWidth + 2, boxMaxWidth);
        el.style.width = `${Math.max(boxWidth, w)}px`;
      } else if (el.tagName === 'TEXTAREA') {
        el.style.height = 'auto';
        const h = Math.min(el.scrollHeight, boxMaxHeight);
        el.style.height = `${h}px`;
        el.style.overflowY = el.scrollHeight > h ? 'auto' : 'hidden';
      }
    });
  }

  useEffect(resizeInputs, [formVals, boxWidth, boxMaxWidth, boxMaxHeight]);
  useEffect(() => {
    if (visible) resizeInputs();
  }, [visible]);

  if (!visible) return null;

  const mainSet = new Set(mainFields);
  const totalAmountSet = new Set(totalAmountFields);
  const totalCurrencySet = new Set(totalCurrencyFields);
  const headerCols =
    headerFields.length > 0
      ? headerFields
      : columns.filter((c) => headerSet.has(c));
  const footerCols =
    footerFields.length > 0
      ? footerFields
      : columns.filter((c) => footerSet.has(c));
  if (window.erpDebug) {
    console.log('RowFormModal sections', {
      missingHeader: headerFields.filter((c) => !headerCols.includes(c)),
      missingFooter: footerFields.filter((c) => !footerCols.includes(c)),
    });
  }
  const mainCols =
    mainFields.length > 0
      ? columns.filter((c) => mainSet.has(c))
      : columns.filter((c) => !headerSet.has(c) && !footerSet.has(c));
  const allSectionFields = Array.from(
    new Set([
      ...headerCols,
      ...mainCols,
      ...footerCols,
    ].filter(Boolean)),
  );

  const inputFontSize = Math.max(10, labelFontSize);
  const formGridClass = fitted ? 'grid' : 'grid gap-2';
  const formGridStyle = {
    gap: '2px',
    gridTemplateColumns: fitted
      ? `repeat(auto-fill, minmax(${boxWidth}px, ${boxMaxWidth}px))`
      : isNarrow
      ? '1fr'
      : `repeat(2, minmax(${boxWidth}px, ${boxMaxWidth}px))`,
    fontSize: `${inputFontSize}px`,
  };
  const labelStyle = { fontSize: `${labelFontSize}px` };
  const inputStyle = {
    fontSize: `${inputFontSize}px`,
    padding: '0.25rem 0.5rem',
    width: `${boxWidth}px`,
    minWidth: `${boxWidth}px`,
    maxWidth: `${boxMaxWidth}px`,
    height: isNarrow ? '44px' : `${boxHeight}px`,
    maxHeight: isNarrow ? 'none' : `${boxMaxHeight}px`,
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    textOverflow: 'ellipsis',
  };

  async function handleKeyDown(e, col) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const isLookupField =
      !!relationConfigMap[col] ||
      !!viewSourceMap[col] ||
      !!autoSelectConfigs[col];
    if (isLookupField && e.lookupMatched === false) {
      setErrors((er) => ({ ...er, [col]: 'Тохирох утга олдсонгүй' }));
      const el = inputRefs.current[col];
      if (el) {
        el.focus();
        if (el.select) el.select();
      }
      return;
    }
    let label = undefined;
    let val = e.selectedOption ? e.selectedOption.value : e.target.value;
    if (e.selectedOption) label = e.selectedOption.label;
    val = normalizeDateInput(val, placeholders[col]);
    if (totalAmountSet.has(col) || totalCurrencySet.has(col)) {
      val = normalizeNumberInput(val);
    }
    const newVal = label ? { value: val, label } : val;
    let nextSnapshot = formValsRef.current;
    if (!valuesEqual(formVals[col], newVal)) {
      const result = setFormValuesWithGenerated((prev) => {
        if (valuesEqual(prev[col], newVal)) return prev;
        return { ...prev, [col]: newVal };
      });
      nextSnapshot = result?.snapshot ?? formValsRef.current;
      if (val !== e.target.value) e.target.value = val;
    }
    if (placeholders[col] && !isValidDate(val, placeholders[col])) {
      setErrors((er) => ({ ...er, [col]: 'Хугацааны формат буруу' }));
      return;
    }
    if (requiredFields.includes(col) && (val === '' || val === null || val === undefined)) {
      setErrors((er) => ({ ...er, [col]: 'Утга оруулна уу' }));
      return;
    }
    const skipNum = /code/i.test(col) || /код/i.test(labels[col] || '');
    if (
      (totalAmountSet.has(col) || totalCurrencySet.has(col)) &&
      val !== '' &&
      !skipNum &&
      isNaN(Number(normalizeNumberInput(val)))
    ) {
      setErrors((er) => ({ ...er, [col]: 'Буруу тоон утга' }));
      return;
    }
    if (hasTrigger(col)) {
      const override = { ...nextSnapshot, [col]: newVal };
      await runProcTrigger(col, override);
    }

    const enabled = columns.filter((c) => !disabledSet.has(c.toLowerCase()));
    const idx = enabled.indexOf(col);
    const next = enabled[idx + 1];
    if (next && inputRefs.current[next]) {
      const el = inputRefs.current[next];
      el.focus();
      if (el.select) el.select();
      return;
    }
    if (!next) {
      if (canPost) {
        submitForm();
        if (onNextForm) onNextForm();
      }
    }
  }

  function getDirectTriggers(col) {
    const val = procTriggers[col.toLowerCase()];
    if (!val) return [];
    return Array.isArray(val) ? val : [val];
  }

  function getParamTriggers(col) {
    const res = [];
    const colLower = col.toLowerCase();
    Object.entries(procTriggers).forEach(([tCol, cfgList]) => {
      const list = Array.isArray(cfgList) ? cfgList : [cfgList];
      list.forEach((cfg) => {
        if (Array.isArray(cfg.params) && cfg.params.includes(colLower)) {
          res.push([tCol, cfg]);
        }
      });
    });
    return res;
  }

  function hasTrigger(col) {
    return getDirectTriggers(col).length > 0 || getParamTriggers(col).length > 0;
  }

  function showTriggerInfo(col) {
    if (!general.triggerToastEnabled) return;
    const direct = getDirectTriggers(col);
    const paramTrigs = getParamTriggers(col);

    if (direct.length === 0 && paramTrigs.length === 0) {
      window.dispatchEvent(
        new CustomEvent('toast', {
          detail: { message: `${col} талбар триггер ашигладаггүй`, type: 'info' },
        }),
      );
      return;
    }

    const directNames = [...new Set(direct.map((d) => d.name))];
    directNames.forEach((name) => {
      window.dispatchEvent(
        new CustomEvent('toast', {
          detail: { message: `${col} -> ${name}`, type: 'info' },
        }),
      );
    });

    if (paramTrigs.length > 0) {
      const names = [...new Set(paramTrigs.map(([, cfg]) => cfg.name))].join(', ');
      window.dispatchEvent(
        new CustomEvent('toast', {
          detail: {
            message: `${col} талбар параметр болгож дараах процедуруудад ашиглана: ${names}`,
            type: 'info',
          },
        }),
      );
    }
  }

  function valuesEqual(a, b) {
    if (Object.is(a, b)) return true;
    if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) {
      return false;
    }
    if (Array.isArray(a) || Array.isArray(b)) {
      if (!Array.isArray(a) || !Array.isArray(b)) return false;
      if (a.length !== b.length) return false;
      for (let i = 0; i < a.length; i += 1) {
        if (!valuesEqual(a[i], b[i])) return false;
      }
      return true;
    }
    const aKeys = Object.keys(a);
    const bKeys = Object.keys(b);
    if (aKeys.length !== bKeys.length) return false;
    for (const key of aKeys) {
      if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
      if (!valuesEqual(a[key], b[key])) return false;
    }
    return true;
  }

  function applyProcedureResultToForm(rowData, formState, extraState) {
    if (!rowData || typeof rowData !== 'object') {
      return {
        formVals: formState,
        extraVals: extraState,
        changedColumns: new Set(),
        changedValues: {},
      };
    }
    const normalizedEntries = {};
    Object.entries(rowData).forEach(([rawKey, rawValue]) => {
      if (!rawKey && rawKey !== 0) return;
      const mappedKey = columnCaseMap[String(rawKey).toLowerCase()] || rawKey;
      if (typeof mappedKey !== 'string') return;
      const normalizedValue = normalizeDateInput(rawValue, placeholders[mappedKey]);
      normalizedEntries[mappedKey] = normalizedValue;
    });
    const nextFormVals = { ...formState };
    const nextExtraVals = { ...extraState };
    const changedColumns = new Set();
    const changedValues = {};
    Object.entries(normalizedEntries).forEach(([key, value]) => {
      nextExtraVals[key] = value;
      const columnMatch = columns.find(
        (c) => c.toLowerCase() === String(key).toLowerCase(),
      );
      const targetKey = columnMatch || key;
      if (columnMatch) {
        const prevValue = formState[columnMatch];
        if (!valuesEqual(prevValue, value)) {
          changedColumns.add(columnMatch);
          changedValues[columnMatch] = value;
        }
        nextFormVals[columnMatch] = value;
      } else {
        const prevExtra = extraState[targetKey];
        if (!valuesEqual(prevExtra, value)) {
          changedValues[targetKey] = value;
        }
      }
    });
    return { formVals: nextFormVals, extraVals: nextExtraVals, changedColumns, changedValues };
  }

  async function runProcTrigger(col, valsOverride = null) {
    const processed = new Set();
    const queued = new Set();
    const queue = [];

    const normalizeColumn = (name) => {
      if (!name && name !== 0) return null;
      const mapped = columnCaseMap[String(name).toLowerCase()] || name;
      return typeof mapped === 'string' ? mapped : null;
    };

    const enqueue = (name) => {
      const normalized = normalizeColumn(name);
      if (!normalized) return;
      const lower = normalized.toLowerCase();
      if (processed.has(lower) || queued.has(lower)) return;
      queue.push(normalized);
      queued.add(lower);
    };

    enqueue(col);

    let workingFormVals = { ...formValsRef.current };
    let workingExtraVals = { ...extraValsRef.current };
    if (valsOverride && typeof valsOverride === 'object') {
      Object.entries(valsOverride).forEach(([rawKey, rawValue]) => {
        if (!rawKey && rawKey !== 0) return;
        const mappedKey = normalizeColumn(rawKey) || rawKey;
        if (typeof mappedKey !== 'string') return;
        const match = columns.find((c) => c.toLowerCase() === String(mappedKey).toLowerCase());
        if (match) {
          workingFormVals[match] = rawValue;
        } else {
          workingExtraVals[mappedKey] = rawValue;
        }
      });
    }

    const aggregatedChanges = {};
    let stateChanged = false;

    const getVal = (name) => {
      const key = normalizeColumn(name) || name;
      const match = columns.find((c) => c.toLowerCase() === String(key).toLowerCase());
      let val = match ? workingFormVals[match] : workingFormVals[key];
      if (val === undefined) {
        const extraKey = match || key;
        val = workingExtraVals[extraKey];
        if (val === undefined && extraKey !== key) val = workingExtraVals[key];
      }
      if (val && typeof val === 'object' && 'value' in val) {
        val = val.value;
      }
      if (placeholders[key]) {
        val = normalizeDateInput(val, placeholders[key]);
      }
      if (totalCurrencySet.has(key) || totalAmountSet.has(key)) {
        val = normalizeNumberInput(val);
      }
      return val;
    };

    while (queue.length > 0) {
      const currentCol = queue.shift();
      if (!currentCol) continue;
      const lowerCol = currentCol.toLowerCase();
      queued.delete(lowerCol);
      if (processed.has(lowerCol)) continue;
      processed.add(lowerCol);

      const direct = getDirectTriggers(currentCol);
      const paramTrigs = getParamTriggers(currentCol);

      const map = new Map();
      const keyFor = (cfg) => {
        const out = Object.keys(cfg.outMap || {})
          .sort()
          .reduce((m, k) => {
            m[k] = cfg.outMap[k];
            return m;
          }, {});
        return JSON.stringify([cfg.name, cfg.params, out]);
      };
      const addCfg = (targetCol, cfg) => {
        if (!cfg || !cfg.name) return;
        const key = keyFor(cfg);
        const rec = map.get(key) || { cfg, cols: new Set() };
        const normalizedTarget = normalizeColumn(targetCol);
        if (normalizedTarget) {
          rec.cols.add(normalizedTarget);
        }
        map.set(key, rec);
      };
      direct.forEach((cfg) => addCfg(currentCol, cfg));
      paramTrigs.forEach(([tCol, cfg]) => addCfg(tCol, cfg));

      for (const { cfg, cols } of map.values()) {
        if (!cfg || !cfg.name) continue;
        const colList = [...cols];
        if (colList.length === 0) continue;
        const targetColumn = colList[0];
        const normalizedTarget = normalizeColumn(targetColumn);
        if (!normalizedTarget) continue;

        const { name: procName, params = [], outMap = {} } = cfg;
        const targetCols = Object.values(outMap || {})
          .map((c) => normalizeColumn(c))
          .filter(Boolean);
        const hasTarget = targetCols.some((c) => columns.includes(c));
        if (!hasTarget) continue;

        const optionalParamSet = new Set(
          Array.isArray(cfg.optionalParams)
            ? cfg.optionalParams.map((p) => String(p).toLowerCase())
            : [],
        );
        const optionalPlaceholdersRaw = Array.isArray(cfg.optionalPlaceholders)
          ? cfg.optionalPlaceholders
          : cfg.optionalPlaceholders && typeof cfg.optionalPlaceholders === 'object'
            ? Object.values(cfg.optionalPlaceholders)
            : [];
        const optionalPlaceholderSet = new Set(
          (optionalPlaceholdersRaw || [])
            .map((p) => (p === undefined || p === null ? '' : String(p).toLowerCase()))
            .filter(Boolean),
        );

        const getParam = (p) => {
          if (p === '$current') return getVal(normalizedTarget);
          if (p === '$branchId') return branch;
          if (p === '$companyId') return company;
          if (p === '$employeeId') return user?.empid;
          if (p === '$date') return formatTimestamp(new Date()).slice(0, 10);
          return getVal(p);
        };

        const paramValues = params.map(getParam);

        const getFieldName = (p) => {
          if (!p) return null;
          if (p === '$current') return normalizedTarget;
          if (p === '$branchId') return branchIdFields?.[0] || null;
          if (p === '$companyId') return companyIdFields?.[0] || null;
          if (p === '$employeeId') return userIdFields?.[0] || null;
          if (p === '$date') return dateField?.[0] || null;
          const lower = String(p).toLowerCase();
          return (
            columnCaseMap[lower] ||
            columns.find((c) => c.toLowerCase() === lower) ||
            p
          );
        };

        const missingLabels = [];
        const missingFields = [];
        params.forEach((param, idx) => {
          const value = paramValues[idx];
          const fieldName = getFieldName(param);
          const lower = fieldName ? String(fieldName).toLowerCase() : '';
          const normalizedField =
            lower && columns.find((c) => c.toLowerCase() === lower);
          const paramLower = typeof param === 'string' ? param.toLowerCase() : '';
          const isRequiredParam =
            param === '$current' ||
            param === '$branchId' ||
            param === '$companyId' ||
            param === '$employeeId' ||
            param === '$date' ||
            Boolean(normalizedField) ||
            (lower &&
              (requiredFieldSet.has(lower) ||
                branchIdLowerSet.has(lower) ||
                companyIdLowerSet.has(lower) ||
                departmentIdLowerSet.has(lower) ||
                userIdLowerSet.has(lower)));
          const isEmptyValue =
            value === undefined ||
            value === null ||
            (typeof value === 'string' && value.trim() === '');
          if (!isRequiredParam || !isEmptyValue) return;
          const optionalValueTokens = [];
          if (value === undefined) optionalValueTokens.push('undefined');
          if (value === null) optionalValueTokens.push('null');
          if (typeof value === 'string') {
            optionalValueTokens.push(value.trim().toLowerCase());
          }
          const isOptional =
            optionalParamSet.has(paramLower) ||
            optionalParamSet.has(lower) ||
            (normalizedField && optionalParamSet.has(normalizedField.toLowerCase())) ||
            optionalPlaceholderSet.has(paramLower) ||
            optionalPlaceholderSet.has(lower) ||
            (normalizedField && optionalPlaceholderSet.has(normalizedField.toLowerCase())) ||
            optionalValueTokens.some((token) => optionalPlaceholderSet.has(token));
          if (isOptional) return;
          if (normalizedField) missingFields.push(normalizedField);
          else if (fieldName) missingFields.push(fieldName);
          if (param === '$branchId') {
            const branchField = branchIdFields?.[0];
            const label =
              (branchField && (labels[branchField] || branchField)) ||
              'Branch';
            missingLabels.push(label);
            return;
          }
          if (param === '$companyId') {
            const companyField = companyIdFields?.[0];
            const label =
              (companyField && (labels[companyField] || companyField)) ||
              'Company';
            missingLabels.push(label);
            return;
          }
          if (param === '$employeeId') {
            const empField = userIdFields?.[0];
            const label =
              (empField && (labels[empField] || empField)) ||
              'Employee';
            missingLabels.push(label);
            return;
          }
          if (param === '$date') {
            const dateFieldName = dateField?.[0];
            const label =
              (dateFieldName && (labels[dateFieldName] || dateFieldName)) ||
              'Огноо';
            missingLabels.push(label);
            return;
          }
          if (param === '$current') {
            missingLabels.push(labels[normalizedTarget] || normalizedTarget);
            return;
          }
          const labelField = normalizedField || fieldName;
          missingLabels.push((labelField && (labels[labelField] || labelField)) || param);
        });

        if (missingLabels.length > 0) {
          const uniqueLabels = [...new Set(missingLabels.filter(Boolean))];
          const message =
            uniqueLabels.length > 0
              ? `Дараах талбаруудыг бөглөнө үү: ${uniqueLabels.join(', ')}`
              : 'Шаардлагатай талбаруудыг бөглөнө үү.';
          window.dispatchEvent(
            new CustomEvent('toast', {
              detail: { message, type: 'warning' },
            }),
          );
          const formFieldNames = missingFields
            .map((name) => {
              if (!name) return null;
              const lower = String(name).toLowerCase();
              return columns.find((c) => c.toLowerCase() === lower) || null;
            })
            .filter(Boolean);
          if (formFieldNames.length > 0) {
            setErrors((prev) => {
              const next = { ...prev };
              formFieldNames.forEach((field) => {
                next[field] = 'Утга оруулна уу';
              });
              return next;
            });
            const focusField = formFieldNames.find((field) => inputRefs.current[field]);
            if (focusField && inputRefs.current[focusField]) {
              const el = inputRefs.current[focusField];
              el.focus();
              if (el.select) el.select();
            }
          }
          continue;
        }

        if (params.length > 0) {
          setErrors((prev) => {
            let changed = false;
            const next = { ...prev };
            params.forEach((param) => {
              const fieldName = getFieldName(param);
              if (!fieldName) return;
              const lower = String(fieldName).toLowerCase();
              const columnName = columns.find((c) => c.toLowerCase() === lower);
              if (columnName && next[columnName]) {
                next[columnName] = undefined;
                changed = true;
              }
            });
            return changed ? next : prev;
          });
        }

        const aliases = params.map((p) => outMap[p] || null);
        const cacheKey = `${procName}|${JSON.stringify(paramValues)}`;
        let row = procCache.current[cacheKey];
        if (!row) {
          if (general.procToastEnabled) {
            window.dispatchEvent(
              new CustomEvent('toast', {
                detail: {
                  message: `${normalizedTarget} -> ${procName}(${paramValues.join(', ')})`,
                  type: 'info',
                },
              }),
            );
          }
          try {
            row = await callProcedure(procName, paramValues, aliases);
            if (row && typeof row === 'object') {
              procCache.current[cacheKey] = row;
            }
          } catch (err) {
            console.error('Procedure call failed', err);
            if (general.procToastEnabled) {
              window.dispatchEvent(
                new CustomEvent('toast', {
                  detail: { message: `Procedure failed: ${err.message}`, type: 'error' },
                }),
              );
            }
            continue;
          }
        }

        if (!row || typeof row !== 'object') continue;

        const result = applyProcedureResultToForm(row, workingFormVals, workingExtraVals);
        workingFormVals = result.formVals;
        workingExtraVals = result.extraVals;
        if (result.changedColumns.size > 0 || Object.keys(result.changedValues).length > 0) {
          stateChanged = true;
          Object.assign(aggregatedChanges, result.changedValues);
          result.changedColumns.forEach((changedCol) => {
            const normalizedChanged = normalizeColumn(changedCol) || changedCol;
            if (hasTrigger(normalizedChanged)) enqueue(normalizedChanged);
          });
        }
        if (general.procToastEnabled) {
          window.dispatchEvent(
            new CustomEvent('toast', {
              detail: { message: `Returned: ${JSON.stringify(row)}`, type: 'info' },
            }),
          );
        }
      }
    }

    if (stateChanged) {
      setExtraVals(workingExtraVals);
      const { diff: generatedDiff } = setFormValuesWithGenerated(() => workingFormVals, { notify: false }) || {};
      const combinedChanges = { ...(generatedDiff || {}), ...aggregatedChanges };
      if (Object.keys(combinedChanges).length > 0) {
        onChange(combinedChanges);
      }
    }
  }

  async function openRelationPreview(col) {
    let val = formVals[col];
    if (val && typeof val === 'object') val = val.value;
    const conf = relationConfigMap[col];
    const auto = autoSelectConfigs[col];
    const viewTbl = viewSourceMap[col] || auto?.table;
    const table = conf ? conf.table : viewTbl;
    const idField = conf
      ? conf.idField || conf.column
      : auto?.idField || viewDisplays[viewTbl]?.idField || col;
    if (!table || val === undefined || val === '') return;
    let row = relationData[col]?.[val];
    if (!row) {
      try {
        const res = await fetch(
          `/api/tables/${encodeURIComponent(table)}/${encodeURIComponent(val)}`,
          { credentials: 'include' },
        );
        if (res.ok) {
          const js = await res.json().catch(() => ({}));
          row = js.row || js;
        }
      } catch {
        row = null;
      }
    }
    if (row && typeof row === 'object') {
      setPreviewRow(row);
    }
  }

  async function handleFocusField(col) {
    showTriggerInfo(col);
    const view = viewSourceMap[col];
    if (view && !alreadyRequestedRef.current.has(view)) {
      alreadyRequestedRef.current.add(view);
      loadView(view);
    }
  }

  async function handleTemporarySave() {
    if (!allowTemporarySave || !onSaveTemporary) return;
    if (useGrid && tableRef.current) {
      if (tableRef.current.hasInvalid && tableRef.current.hasInvalid()) {
        alert('Тэмдэглэсэн талбаруудыг засна уу.');
        return;
      }
      const rows = tableRef.current.getRows();
      const cleanedRows = [];
      const rawRows = [];
      let hasMissing = false;
      let hasInvalid = false;
      rows.forEach((r) => {
        const hasValue = Object.values(r).some((v) => {
          if (v === null || v === undefined || v === '') return false;
          if (typeof v === 'object' && 'value' in v) return v.value !== '';
          return true;
        });
        if (!hasValue) return;
        const normalized = {};
        Object.entries(r).forEach(([k, v]) => {
          const raw = typeof v === 'object' && v !== null && 'value' in v ? v.value : v;
          let val = normalizeDateInput(raw, placeholders[k]);
          if (totalAmountSet.has(k) || totalCurrencySet.has(k)) {
            val = normalizeNumberInput(val);
          }
          normalized[k] = val;
        });
        requiredFields.forEach((f) => {
          if (
            normalized[f] === '' ||
            normalized[f] === null ||
            normalized[f] === undefined
          )
            hasMissing = true;
          if (
            (totalAmountSet.has(f) || totalCurrencySet.has(f)) &&
            normalized[f] !== '' &&
            !/code/i.test(f) &&
            isNaN(Number(normalizeNumberInput(normalized[f])))
          )
            hasInvalid = true;
          const ph = placeholders[f];
          if (ph && !isValidDate(normalized[f], ph)) hasInvalid = true;
        });
        cleanedRows.push(normalized);
        rawRows.push(r);
      });
      if (hasMissing) {
        alert('Шаардлагатай талбаруудыг бөглөнө үү.');
        return;
      }
      if (hasInvalid) {
        alert('Буруу утгуудыг засна уу.');
        return;
      }
      if (cleanedRows.length === 0) {
        return;
      }
      const mergedExtra = { ...extraVals };
      if (mergedExtra.seedRecords && mergedExtra.seedTables) {
        const set = new Set(mergedExtra.seedTables);
        const filtered = {};
        Object.entries(mergedExtra.seedRecords).forEach(([tbl, recs]) => {
          if (set.has(tbl)) filtered[tbl] = recs;
        });
        mergedExtra.seedRecords = filtered;
      }
      const normalizedExtra = {};
      Object.entries(mergedExtra).forEach(([k, v]) => {
        let val = normalizeDateInput(v, placeholders[k]);
        if (totalAmountSet.has(k) || totalCurrencySet.has(k)) {
          val = normalizeNumberInput(val);
        }
        normalizedExtra[k] = val;
      });
      try {
        await Promise.resolve(
          onSaveTemporary({
            values: { ...normalizedExtra, rows: cleanedRows },
            rawRows,
          }),
        );
      } catch (err) {
        console.error('Temporary save failed', err);
      }
      return;
    }
    const merged = { ...extraVals, ...formVals };
    if (merged.seedRecords && merged.seedTables) {
      const set = new Set(merged.seedTables);
      const filtered = {};
      Object.entries(merged.seedRecords).forEach(([tbl, recs]) => {
        if (set.has(tbl)) filtered[tbl] = recs;
      });
      merged.seedRecords = filtered;
    }
    const normalized = {};
    Object.entries(merged).forEach(([k, v]) => {
      let val = normalizeDateInput(v, placeholders[k]);
      if (totalAmountSet.has(k) || totalCurrencySet.has(k)) {
        val = normalizeNumberInput(val);
      }
      normalized[k] = val;
    });
    try {
      await Promise.resolve(onSaveTemporary({ values: normalized }));
    } catch (err) {
      console.error('Temporary save failed', err);
    }
  }

  async function submitForm() {
    if (!canPost) {
      alert(
        t(
          'temporary_post_not_allowed',
          'You do not have permission to post this transaction.',
        ),
      );
      return;
    }
    if (submitLocked) return;
    setSubmitLocked(true);
    if (useGrid && tableRef.current) {
      if (tableRef.current.hasInvalid && tableRef.current.hasInvalid()) {
        alert('Тэмдэглэсэн талбаруудыг засна уу.');
        setSubmitLocked(false);
        return;
      }
      const rows = tableRef.current.getRows();
      const cleanedRows = [];
      const rowIndices = [];
      let hasMissing = false;
      let hasInvalid = false;
      rows.forEach((r, idx) => {
        const hasValue = Object.values(r).some((v) => {
          if (v === null || v === undefined || v === '') return false;
          if (typeof v === 'object' && 'value' in v) return v.value !== '';
          return true;
        });
        if (!hasValue) return;
        const normalized = {};
        Object.entries(r).forEach(([k, v]) => {
          const raw = typeof v === 'object' && v !== null && 'value' in v ? v.value : v;
          let val = normalizeDateInput(raw, placeholders[k]);
          if (totalAmountSet.has(k) || totalCurrencySet.has(k)) {
            val = normalizeNumberInput(val);
          }
          normalized[k] = val;
        });
        requiredFields.forEach((f) => {
          if (
            normalized[f] === '' ||
            normalized[f] === null ||
            normalized[f] === undefined
          )
            hasMissing = true;
          if (
            (totalAmountSet.has(f) || totalCurrencySet.has(f)) &&
            normalized[f] !== '' &&
            !/code/i.test(f) &&
            isNaN(Number(normalizeNumberInput(normalized[f])))
          )
            hasInvalid = true;
          const ph = placeholders[f];
          if (ph && !isValidDate(normalized[f], ph)) hasInvalid = true;
        });
        cleanedRows.push(normalized);
        rowIndices.push(idx);
      });

      if (hasMissing) {
        alert('Шаардлагатай талбаруудыг бөглөнө үү.');
        setSubmitLocked(false);
        return;
      }
      if (hasInvalid) {
        alert('Буруу утгуудыг засна уу.');
        setSubmitLocked(false);
        return;
      }

      if (cleanedRows.length === 0) {
        setSubmitLocked(false);
        return;
      }

      {
        const failedRows = [];
        let anySuccess = false;
        for (let i = 0; i < cleanedRows.length; i++) {
          const r = cleanedRows[i];
          const extra = { ...extraVals };
          if (extra.seedRecords && extra.seedTables) {
            const set = new Set(extra.seedTables);
            const filtered = {};
            Object.entries(extra.seedRecords).forEach(([t, recs]) => {
              if (set.has(t)) filtered[t] = recs;
            });
            extra.seedRecords = filtered;
          }
          try {
            const res = await Promise.resolve(onSubmit({ ...extra, ...r }));
            if (res === false) {
              failedRows.push(rows[rowIndices[i]]);
            } else {
              anySuccess = true;
            }
          } catch (err) {
            console.error('Submit failed', err);
            failedRows.push(rows[rowIndices[i]]);
          }
        }
        if (anySuccess) {
          window.dispatchEvent(new Event('pending-request-refresh'));
        }
        if (failedRows.length === 0) {
          tableRef.current.clearRows();
        } else if (tableRef.current.replaceRows) {
          tableRef.current.replaceRows(failedRows);
        }
      }
      procCache.current = {};
      setSubmitLocked(false);
      return;
    }
    const errs = {};
    requiredFields.forEach((f) => {
      if (
        columns.includes(f) &&
        (formVals[f] === '' || formVals[f] === null || formVals[f] === undefined)
      ) {
        errs[f] = 'Утга оруулна уу';
      }
    });
    setErrors(errs);
    if (Object.keys(errs).length === 0) {
      const merged = { ...extraVals, ...formVals };
      if (merged.seedRecords && merged.seedTables) {
        const set = new Set(merged.seedTables);
        const filtered = {};
        Object.entries(merged.seedRecords).forEach(([t, recs]) => {
          if (set.has(t)) filtered[t] = recs;
        });
        merged.seedRecords = filtered;
      }
      const normalized = {};
      Object.entries(merged).forEach(([k, v]) => {
        let val = normalizeDateInput(v, placeholders[k]);
        if (totalAmountSet.has(k) || totalCurrencySet.has(k)) {
          val = normalizeNumberInput(val);
        }
        normalized[k] = val;
      });
      try {
        const res = await Promise.resolve(onSubmit(normalized));
        if (res === false) {
          setSubmitLocked(false);
          return;
        }
        procCache.current = {};
        window.dispatchEvent(new Event('pending-request-refresh'));
      } catch (err) {
        console.error('Submit failed', err);
        setSubmitLocked(false);
        return;
      }
    }
    setSubmitLocked(false);
  }
  function renderField(c, withLabel = true) {
    const err = errors[c];
    const inputClass = `w-full border rounded ${err ? 'border-red-500' : 'border-gray-300'}`;
    const isColumn = columns.includes(c);
    const disabled = disabledSet.has(c.toLowerCase()) || !isColumn;
    const tip = t(c.toLowerCase(), { ns: 'tooltip', defaultValue: labels[c] || c });
    const formVisible =
      (inline && visible) || (typeof document !== 'undefined' && !document.hidden);

    if (disabled) {
      const raw = isColumn ? formVals[c] : extraVals[c];
      const val = typeof raw === 'object' && raw !== null ? raw.value : raw;
      let display = typeof raw === 'object' && raw !== null ? raw.label || val : val;
      if (
        relationConfigMap[c] &&
        val !== undefined &&
        relationData[c]?.[val]
      ) {
        const row = relationData[c][val];
        const cfg = relationConfigMap[c];
        const parts = [];
        const identifier = getRowValueCaseInsensitive(
          row,
          cfg.idField || cfg.column,
        );
        if (identifier !== undefined && identifier !== null) {
          parts.push(identifier);
        }
        if (parts.length === 0) parts.push(val);
        (cfg.displayFields || []).forEach((df) => {
          if (row[df] !== undefined) parts.push(row[df]);
        });
        display = parts.join(' - ');
      } else if (
        viewSourceMap[c] &&
        val !== undefined &&
        relationData[c]?.[val]
      ) {
        const row = relationData[c][val];
        const cfg = viewDisplays[viewSourceMap[c]] || {};
        const parts = [];
        const identifier = getRowValueCaseInsensitive(
          row,
          cfg.idField || c,
        );
        if (identifier !== undefined && identifier !== null) {
          parts.push(identifier);
        }
        if (parts.length === 0) parts.push(val);
        (cfg.displayFields || []).forEach((df) => {
          if (row[df] !== undefined) parts.push(row[df]);
        });
        display = parts.join(' - ');
      } else if (
        autoSelectConfigs[c] &&
        val !== undefined &&
        relationData[c]?.[val]
      ) {
        const row = relationData[c][val];
        const cfg = autoSelectConfigs[c];
        const parts = [];
        const identifier = getRowValueCaseInsensitive(row, cfg.idField);
        if (identifier !== undefined && identifier !== null) {
          parts.push(identifier);
        }
        if (parts.length === 0) parts.push(val);
        (cfg.displayFields || []).forEach((df) => {
          if (row[df] !== undefined) parts.push(row[df]);
        });
        display = parts.join(' - ');
      }
      const readonlyStyle = {
        ...inputStyle,
        width: 'fit-content',
        minWidth: `${boxWidth}px`,
        maxWidth: `${boxMaxWidth}px`,
      };
      const content = (
        <div className="flex items-center space-x-1">
          <div
            className="border rounded bg-gray-100 px-2 py-1"
            style={readonlyStyle}
            ref={(el) => (readonlyRefs.current[c] = el)}
          >
            {display}
          </div>
        </div>
      );
      const wrapped = <TooltipWrapper title={tip}>{content}</TooltipWrapper>;
      if (!withLabel) return wrapped;
      return (
        <TooltipWrapper key={c} title={tip}>
          <div className={fitted ? 'mb-1' : 'mb-3'}>
            <div className="flex items-center space-x-1">
              <label className="font-medium" style={labelStyle}>
                {labels[c] || c}
              </label>
              {content}
            </div>
          </div>
        </TooltipWrapper>
      );
    }

    const control = relationConfigMap[c] ? (
      formVisible && (
        <AsyncSearchSelect
          title={tip}
          table={relationConfigMap[c].table}
          searchColumn={relationConfigMap[c].idField || relationConfigMap[c].column}
          searchColumns={[
            relationConfigMap[c].idField || relationConfigMap[c].column,
            ...(relationConfigMap[c].displayFields || []),
          ]}
          labelFields={relationConfigMap[c].displayFields || []}
          value={typeof formVals[c] === 'object' ? formVals[c].value : formVals[c]}
          onChange={(val) => handleRelationChange(c, val)}
          onSelect={(opt) => {
            const el = inputRefs.current[c];
            if (el) {
              const fake = { key: 'Enter', preventDefault: () => {}, target: el, selectedOption: opt };
              handleKeyDown(fake, c);
            }
          }}
          disabled={disabled}
          onKeyDown={(e) => handleKeyDown(e, c)}
          onFocus={(e) => {
            e.target.select();
            handleFocusField(c);
            e.target.style.width = 'auto';
            const w = Math.min(e.target.scrollWidth + 2, boxMaxWidth);
            e.target.style.width = `${Math.max(boxWidth, w)}px`;
          }}
          inputRef={(el) => (inputRefs.current[c] = el)}
          inputStyle={inputStyle}
          companyId={company}
        />
      )
    ) : viewSourceMap[c] && !Array.isArray(relations[c]) ? (
      formVisible && (
        <AsyncSearchSelect
          title={tip}
          table={viewSourceMap[c]}
          searchColumn={viewDisplays[viewSourceMap[c]]?.idField || c}
          searchColumns={[
            viewDisplays[viewSourceMap[c]]?.idField || c,
            ...(viewDisplays[viewSourceMap[c]]?.displayFields || []),
          ]}
          labelFields={viewDisplays[viewSourceMap[c]]?.displayFields || []}
          idField={viewDisplays[viewSourceMap[c]]?.idField || c}
          value={typeof formVals[c] === 'object' ? formVals[c].value : formVals[c]}
          onChange={(val) => handleRelationChange(c, val)}
          onSelect={(opt) => {
            const el = inputRefs.current[c];
            if (el) {
              const fake = { key: 'Enter', preventDefault: () => {}, target: el, selectedOption: opt };
              handleKeyDown(fake, c);
            }
          }}
          disabled={disabled}
          onKeyDown={(e) => handleKeyDown(e, c)}
          onFocus={(e) => {
            e.target.select();
            handleFocusField(c);
            e.target.style.width = 'auto';
            const w = Math.min(e.target.scrollWidth + 2, boxMaxWidth);
            e.target.style.width = `${Math.max(boxWidth, w)}px`;
          }}
          inputRef={(el) => (inputRefs.current[c] = el)}
          inputStyle={inputStyle}
          companyId={company}
        />
      )
    ) : autoSelectConfigs[c] && !Array.isArray(relations[c]) ? (
      formVisible && (
        <AsyncSearchSelect
          title={tip}
          table={autoSelectConfigs[c].table}
          searchColumn={autoSelectConfigs[c].idField}
          searchColumns={[
            autoSelectConfigs[c].idField,
            ...(autoSelectConfigs[c].displayFields || []),
          ]}
          labelFields={autoSelectConfigs[c].displayFields || []}
          idField={autoSelectConfigs[c].idField}
          value={typeof formVals[c] === 'object' ? formVals[c].value : formVals[c]}
          onChange={(val) => handleRelationChange(c, val)}
          onSelect={(opt) => {
            const el = inputRefs.current[c];
            if (el) {
              const fake = { key: 'Enter', preventDefault: () => {}, target: el, selectedOption: opt };
              handleKeyDown(fake, c);
            }
          }}
          disabled={disabled}
          onKeyDown={(e) => handleKeyDown(e, c)}
          onFocus={(e) => {
            e.target.select();
            handleFocusField(c);
            e.target.style.width = 'auto';
            const w = Math.min(e.target.scrollWidth + 2, boxMaxWidth);
            e.target.style.width = `${Math.max(boxWidth, w)}px`;
          }}
          inputRef={(el) => (inputRefs.current[c] = el)}
          inputStyle={inputStyle}
          companyId={company}
        />
      )
    ) : Array.isArray(relations[c]) ? (
      <select
        title={tip}
        ref={(el) => (inputRefs.current[c] = el)}
        value={formVals[c]}
        onFocus={() => handleFocusField(c)}
        onChange={(e) => {
          const value = e.target.value;
          setFormValuesWithGenerated((prev) => {
            if (prev[c] === value) return prev;
            return { ...prev, [c]: value };
          });
          setErrors((er) => ({ ...er, [c]: undefined }));
        }}
        onKeyDown={(e) => handleKeyDown(e, c)}
        disabled={disabled}
        className={inputClass}
        style={inputStyle}
      >
        <option value="">-- select --</option>
        {relations[c].map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    ) : (
      <input
        title={tip}
        ref={(el) => (inputRefs.current[c] = el)}
        type={(() => {
          const typ = fieldTypeMap[c];
          if (typ === 'date' || typ === 'datetime' || placeholders[c] === 'YYYY-MM-DD') return 'date';
          if (typ === 'time' || placeholders[c] === 'HH:MM:SS') return 'time';
          const lower = c.toLowerCase();
          if (lower.includes('email')) return 'email';
          if (/(amount|qty|count|price|total|number|qty|quantity)/i.test(lower))
            return 'number';
          if (lower.includes('phone')) return 'tel';
          return 'text';
        })()}
        inputMode={(() => {
          const lower = c.toLowerCase();
          return /(amount|qty|count|price|total|number|qty|quantity)/i.test(lower)
            ? 'decimal'
            : undefined;
        })()}
        placeholder={placeholders[c] || ''}
        value={
          fieldTypeMap[c] === 'date' || fieldTypeMap[c] === 'datetime'
            ? normalizeDateInput(formVals[c], 'YYYY-MM-DD')
            : formVals[c]
        }
        onChange={(e) => {
          const value = e.target.value;
          setFormValuesWithGenerated((prev) => {
            if (prev[c] === value) return prev;
            return { ...prev, [c]: value };
          });
          setErrors((er) => ({ ...er, [c]: undefined }));
        }}
        onKeyDown={(e) => handleKeyDown(e, c)}
        onFocus={(e) => {
          e.target.select();
          handleFocusField(c);
        }}
        disabled={disabled}
        className={inputClass}
        style={inputStyle}
        onInput={(e) => {
          e.target.style.width = 'auto';
          const w = Math.min(e.target.scrollWidth + 2, boxMaxWidth);
          e.target.style.width = `${Math.max(boxWidth, w)}px`;
        }}
      />
    );

    if (!withLabel) return <TooltipWrapper title={tip}>{control}</TooltipWrapper>;

    return (
      <TooltipWrapper key={c} title={tip}>
        <div className={fitted ? 'mb-1' : 'mb-3'}>
          <label className="block mb-1 font-medium" style={labelStyle}>
            {labels[c] || c}
            {requiredFields.includes(c) && (
              <span className="text-red-500">*</span>
            )}
          </label>
          {control}
          {err && <div className="text-red-500 text-sm">{err}</div>}
        </div>
      </TooltipWrapper>
    );
  }

  function renderMainTable(cols) {
    if (cols.length === 0) return null;
    if (fitted) {
      return (
        <div className="mb-1">
          <h3 className="mt-0 mb-1 font-semibold">Main</h3>
          <div className={formGridClass} style={formGridStyle}>
            {cols.map((c) => renderField(c))}
          </div>
        </div>
      );
    }
    if (inline || useGrid) {
      const configHash = [
        cols.join(','),
        relationConfigMapKey,
        viewSourceMapKey,
        viewDisplaysKey,
        viewColumnsKey,
        columnCaseMapKey,
      ].join('|');
      return (
        <div className="mb-4">
          <h3 className="mt-0 mb-1 font-semibold">Main</h3>
          <InlineTransactionTable
            ref={useGrid ? tableRef : undefined}
            fields={cols}
            allFields={allSectionFields}
            relations={relations}
            relationConfigs={relationConfigMap}
            relationData={relationData}
            fieldTypeMap={fieldTypeMap}
            labels={labels}
            totalAmountFields={totalAmountFields}
            totalCurrencyFields={totalCurrencyFields}
            viewSource={viewSourceMap}
            viewDisplays={viewDisplays}
            viewColumns={viewColumns}
            loadView={loadView}
            loadRelationRow={loadRelationRow}
            procTriggers={procTriggers}
            user={user}
            company={company}
            branch={branch}
            department={department}
            columnCaseMap={columnCaseMap}
            tableName={table}
            imagenameFields={imagenameField}
            imageIdField={imageIdField}
            userIdFields={userIdFields}
            branchIdFields={branchIdFields}
            departmentIdFields={departmentIdFields}
            companyIdFields={companyIdFields}
            collectRows={useGrid}
            minRows={1}
            onRowSubmit={onSubmit}
            onRowsChange={handleGridRowsChange}
            requiredFields={requiredFields}
            disabledFields={disabledFields}
            defaultValues={defaultValues}
            dateField={dateField}
            rows={gridRows}
            onNextForm={onNextForm}
            labelFontSize={labelFontSize}
            boxWidth={boxWidth}
            boxHeight={boxHeight}
            boxMaxWidth={boxMaxWidth}
            scope={scope}
            configHash={configHash}
            tableColumns={tableColumns}
          />
        </div>
      );
    }
    const totals = {};
    cols.forEach((c) => {
      if (totalAmountSet.has(c) || totalCurrencySet.has(c)) {
        totals[c] = Number(formVals[c] || 0);
      }
    });
    return (
      <div className="mb-4">
        <h3 className="mt-0 mb-1 font-semibold">Main</h3>
        <table className="min-w-full border border-gray-300 text-sm" style={{tableLayout:'fixed', width:'100%'}}>
          <thead className="bg-gray-50">
            <tr>
              {cols.map((c) => (
                <th
                  key={c}
                  className="border px-2 py-1"
                  style={{
                    maxWidth: `${boxMaxWidth}px`,
                    wordBreak: 'break-word',
                    fontSize: labelStyle.fontSize,
                    width: `${boxWidth}px`,
                    minWidth: `${boxWidth}px`,
                  }}
                >
                  {labels[c] || c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              {cols.map((c) => (
                <td
                  key={c}
                  className="border px-2 py-1"
                  style={{
                    maxWidth: `${boxMaxWidth}px`,
                    wordBreak: 'break-word',
                    width: `${boxWidth}px`,
                    minWidth: `${boxWidth}px`,
                  }}
                >
                  {renderField(c, false)}
                </td>
              ))}
            </tr>
          </tbody>
          {(totalAmountFields.length > 0 ||
            totalCurrencyFields.length > 0 ||
            cols.includes('TotalCur') ||
            cols.includes('TotalAmt')) && (
            <tfoot>
              <tr>
                {cols.map((c, idx) => {
                  let val = '';
                  if (idx === 0) val = 'НИЙТ';
                  if (totalAmountSet.has(c)) val = totals[c];
                  if (totalCurrencySet.has(c)) val = totals[c];
                  return (
                    <td
                      key={c}
                      className="border px-2 py-1 font-semibold"
                    >
                      {val !== '' ? val : ''}
                    </td>
                  );
                })}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    );
  }

  function renderHeaderTable(cols) {
    if (cols.length === 0) {
      return window.erpDebug ? (
        <div className={fitted ? 'mb-1' : 'mb-2'}>
          <h3 className="mt-0 mb-1 font-semibold">Header</h3>
          <div className="text-xs italic text-gray-500">No fields defined</div>
        </div>
      ) : null;
    }
    return renderSection('Header', cols);
  }

  function renderSection(title, cols) {
    if (cols.length === 0) {
      return window.erpDebug ? (
        <div className={fitted ? 'mb-1' : 'mb-2'}>
          <h3 className="mt-0 mb-1 font-semibold">{title}</h3>
          <div className="text-xs italic text-gray-500">No fields defined</div>
        </div>
      ) : null;
    }
    return (
      <div className={fitted ? 'mb-1' : 'mb-2'}>
        <h3 className="mt-0 mb-1 font-semibold">{title}</h3>
        <div className={formGridClass} style={formGridStyle}>
          {cols.map((c) => renderField(c))}
        </div>
      </div>
    );
  }

  function handlePrint(mode) {
    const all = [...headerCols, ...mainCols, ...footerCols];
    const list = mode === 'emp' ? printEmpField : printCustField;
    const allowed = new Set(list.length > 0 ? list : all);
    const h = headerCols.filter((c) => allowed.has(c));
    const m = mainCols.filter((c) => allowed.has(c));
    const f = footerCols.filter((c) => allowed.has(c));

    const rowHtml = (cols, skipEmpty = false) =>
      cols
        .filter((c) =>
          skipEmpty
            ? formVals[c] !== '' &&
              formVals[c] !== null &&
              formVals[c] !== 0 &&
              formVals[c] !== undefined
            : true,
        )
        .map(
          (c) =>
            `<tr><th>${labels[c] || c}</th><td>${
              formVals[c] !== undefined ? formVals[c] : ''
            }</td></tr>`,
        )
        .join('');

    const mainTableHtml = () => {
      if (!useGrid) return rowHtml(m, true);
      if (gridRows.length === 0) return '';
      const used = m.filter((c) =>
        gridRows.some(
          (r) => r[c] !== '' && r[c] !== null && r[c] !== 0 && r[c] !== undefined,
        ),
      );
      if (used.length === 0) return '';
      const header = used.map((c) => `<th>${labels[c] || c}</th>`).join('');
      const body = gridRows
        .map(
          (r) =>
            '<tr>' +
            used.map((c) => `<td>${r[c] !== undefined ? r[c] : ''}</td>`).join('') +
            '</tr>',
        )
        .join('');
      return `<table><thead><tr>${header}</tr></thead><tbody>${body}</tbody></table>`;
    };

    let html = '<html><head><title>Print</title>';
    html +=
      '<style>@media print{body{margin:1rem;font-size:12px}}table{width:100%;border-collapse:collapse;margin-bottom:1rem;}th,td{border:1px solid #666;padding:4px;text-align:left;}h3{margin:0 0 4px 0;font-weight:600;}</style>';
    html +=
      '<link href="https://cdn.jsdelivr.net/npm/tailwindcss@3.4.1/dist/tailwind.min.css" rel="stylesheet">';
    html += '</head><body>';
    if (h.length) html += `<h3>Header</h3><table>${rowHtml(h, true)}</table>`;
    if (m.length) html += `<h3>Main</h3>${mainTableHtml()}`;
    if (f.length) html += `<h3>Footer</h3><table>${rowHtml(f, true)}</table>`;
    html += '</body></html>';
    if (userSettings?.printerId) {
      fetch(`${API_BASE}/print`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ printerId: userSettings.printerId, content: html }),
      }).catch((err) => console.error('Print failed', err));
    } else {
      const w = window.open('', '_blank');
      w.document.write(html);
      w.document.close();
      w.focus();
      w.print();
    }
  }

  if (inline) {
    return (
      <div
        className={fitted ? 'p-4 space-y-2' : 'p-4 space-y-4'}
        ref={wrapRef}
        style={{ transform: `scale(${zoom})`, transformOrigin: '0 0' }}
      >
        {renderHeaderTable(headerCols)}
        {renderMainTable(mainCols)}
        {renderSection('Footer', footerCols)}
      </div>
    );
  }
  return (
    <>
      <Modal
        visible={visible}
        title={row ? 'Мөр засах' : 'Мөр нэмэх'}
        onClose={onCancel}
        width="70vw"
      >
        <form
          ref={wrapRef}
          style={{ transform: `scale(${zoom})`, transformOrigin: '0 0', padding: fitted ? 0 : undefined }}
          onSubmit={(e) => {
            e.preventDefault();
            submitForm();
          }}
          className={fitted ? 'p-4 space-y-2' : 'p-4 space-y-4'}
        >
        {renderHeaderTable(headerCols)}
        {renderMainTable(mainCols)}
        {renderSection('Footer', footerCols)}
        {table === 'companies' && !row && seedOptions.length > 0 && (
          <div className="mt-4">
            <h3 className="font-semibold mb-2">Seed Tables</h3>
            <div className="space-y-2">
              {seedOptions.map((t) => (
                <div key={t.tableName} className="border rounded">
                  <button
                    type="button"
                    onClick={() => toggleSeedOpen(t.tableName)}
                    className="w-full flex items-center justify-between p-2 bg-gray-100"
                  >
                    <label
                      className="flex items-center space-x-2"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        checked={(extraVals.seedTables || []).includes(t.tableName)}
                        onChange={() => toggleSeedTable(t.tableName)}
                      />
                      <span>{t.tableName}</span>
                    </label>
                    <span>{openSeed[t.tableName] ? '▾' : '▸'}</span>
                  </button>
                  {openSeed[t.tableName] && (
                    seedRecordOptions[t.tableName]?.loading ? (
                      <div className="p-2 text-sm text-gray-500">Loading...</div>
                    ) : (
                      renderSeedTable(t.tableName)
                    )
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="mt-2 text-right space-x-2">
          <button
            type="button"
            onClick={() => handlePrint('emp')}
            className="px-3 py-1 bg-gray-200 rounded"
          >
            {t('printEmp', 'Print Emp')}
          </button>
          <button
            type="button"
            onClick={() => handlePrint('cust')}
            className="px-3 py-1 bg-gray-200 rounded"
          >
            {t('printCust', 'Print Cust')}
          </button>
          {allowTemporarySave && isAdding && onSaveTemporary && (
            <button
              type="button"
              onClick={handleTemporarySave}
              className="px-3 py-1 bg-yellow-400 text-gray-900 rounded"
            >
              {t('save_temporary', 'Save as Temporary')}
            </button>
          )}
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1 bg-gray-200 rounded"
          >
            {t('cancel', 'Cancel')}
          </button>
          {canPost && (
            <button
              type="submit"
              className="px-3 py-1 bg-blue-600 text-white rounded"
            >
              {t('post', 'Post')}
            </button>
          )}
        </div>
        {!canPost && allowTemporarySave && (
          <div className="mt-2 text-sm text-gray-600">
            {t(
              'temporary_post_hint',
              'This form currently only allows temporary submissions.',
            )}
          </div>
        )}
        <div className="text-sm text-gray-600">
          Press <strong>Enter</strong> to move to next field. The field will be automatically selected. Use arrow keys to navigate selections.
        </div>
        </form>
      </Modal>
      <RowDetailModal
        visible={!!previewRow}
        onClose={() => setPreviewRow(null)}
        row={previewRow || {}}
        columns={previewRow ? Object.keys(previewRow) : []}
        relations={relations}
        labels={labels}
        fieldTypeMap={fieldTypeMap}
      />
    </>
  );
}

export default memo(RowFormModal);
