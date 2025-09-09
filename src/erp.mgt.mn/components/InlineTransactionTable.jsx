import React, {
  useState,
  forwardRef,
  useImperativeHandle,
  useRef,
  useEffect,
} from 'react';
import useGeneralConfig from '../hooks/useGeneralConfig.js';
import AsyncSearchSelect from './AsyncSearchSelect.jsx';
import RowDetailModal from './RowDetailModal.jsx';
import RowImageUploadModal from './RowImageUploadModal.jsx';
import buildImageName from '../utils/buildImageName.js';
import slugify from '../utils/slugify.js';
import formatTimestamp from '../utils/formatTimestamp.js';
import callProcedure from '../utils/callProcedure.js';
import normalizeDateInput from '../utils/normalizeDateInput.js';

const currencyFmt = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function normalizeNumberInput(value) {
  if (typeof value !== 'string') return value;
  return value.replace(',', '.');
}

export default forwardRef(function InlineTransactionTable({
  fields = [],
  relations = {},
  relationConfigs = {},
  relationData = {},
  fieldTypeMap = {},
  labels = {},
  totalAmountFields = [],
  totalCurrencyFields = [],
  collectRows = false,
  minRows = 1,
  onRowSubmit = () => {},
  onRowsChange = () => {},
  requiredFields = [],
  defaultValues = {},
  onNextForm = null,
  rows: initRows = [],
  columnCaseMap = {},
  viewSource = {},
  viewDisplays = {},
  viewColumns = {},
  loadView = () => {},
  procTriggers = {},
  user = {},
  company,
  branch,
  department,
  scope = 'forms',
  labelFontSize,
  boxWidth,
  boxHeight,
  boxMaxWidth,
  boxMaxHeight,
  disabledFields = [],
  dateField = [],
  userIdFields = [],
  branchIdFields = [],
  departmentIdFields = [],
  companyIdFields = [],
  tableName = '',
  imagenameFields = [],
  imageIdField = '',
}, ref) {
  const mounted = useRef(false);
  const renderCount = useRef(0);
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
  const userIdSet = new Set(userIdFields);
  const branchIdSet = new Set(branchIdFields);
  const departmentIdSet = new Set(departmentIdFields);
  const companyIdSet = new Set(companyIdFields);
  const disabledSet = React.useMemo(
    () => new Set(disabledFields.map((f) => f.toLowerCase())),
    [disabledFields],
  );

  const viewSourceMap = React.useMemo(() => {
    const map = {};
    Object.entries(viewSource || {}).forEach(([k, v]) => {
      const key = columnCaseMap[k.toLowerCase()] || k;
      map[key] = v;
    });
    return map;
  }, [viewSource, columnCaseMap]);

  const relationConfigMap = React.useMemo(() => {
    const map = {};
    Object.entries(relationConfigs || {}).forEach(([k, v]) => {
      const key = columnCaseMap[k.toLowerCase()] || k;
      map[key] = v;
    });
    return map;
  }, [relationConfigs, columnCaseMap]);

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
  }, [tableDisplayFields]);

  // Only columns present in columnCaseMap are evaluated, preventing cross-table false positives.
  const autoSelectConfigs = React.useMemo(() => {
    const map = {};
    Object.entries(columnCaseMap || {}).forEach(([lower, key]) => {
      const cfg = displayIndex[lower];
      if (cfg) {
        map[key] = cfg;
      }
    });
    return map;
  }, [columnCaseMap, displayIndex]);

  const combinedViewSource = React.useMemo(() => {
    const map = { ...viewSourceMap };
    Object.entries(autoSelectConfigs).forEach(([k, cfg]) => {
      if (!map[k]) map[k] = cfg.table;
    });
    return map;
  }, [viewSourceMap, autoSelectConfigs]);

  function fillSessionDefaults(obj) {
    const row = { ...obj };
    if (user?.empid !== undefined) {
      userIdSet.forEach((f) => {
        if (row[f] === undefined || row[f] === '') row[f] = user.empid;
      });
    }
    if (branch !== undefined) {
      branchIdSet.forEach((f) => {
        if (row[f] === undefined || row[f] === '') row[f] = branch;
      });
    }
    if (department !== undefined) {
      departmentIdSet.forEach((f) => {
        if (row[f] === undefined || row[f] === '') row[f] = department;
      });
    }
    if (company !== undefined) {
      companyIdSet.forEach((f) => {
        if (row[f] === undefined || row[f] === '') row[f] = company;
      });
    }
    const now = formatTimestamp(new Date()).slice(0, 10);
    dateField.forEach((f) => {
      if (row[f] === undefined || row[f] === '') row[f] = now;
    });
    return row;
  }
  labelFontSize = labelFontSize ?? cfg.labelFontSize ?? 14;
  boxWidth = boxWidth ?? cfg.boxWidth ?? 60;
  boxHeight = boxHeight ?? cfg.boxHeight ?? 30;
  boxMaxWidth = boxMaxWidth ?? cfg.boxMaxWidth ?? 150;
  boxMaxHeight = boxMaxHeight ?? cfg.boxMaxHeight ?? 150;
  renderCount.current++;
  if (renderCount.current > 10) {
    console.warn('Excessive renders: InlineTransactionTable', renderCount.current);
  }

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      if (window.erpDebug) console.warn('Mounted: InlineTransactionTable');
    }
  }, []);
  const [rows, setRows] = useState(() => {
    if (Array.isArray(initRows) && initRows.length > 0) {
      return initRows.map((r) => fillSessionDefaults(r));
    }
    return Array.from({ length: minRows }, () => fillSessionDefaults(defaultValues));
  });

  const totalAmountSet = new Set(totalAmountFields);
  const totalCurrencySet = new Set(totalCurrencyFields);

  const columnTypeMap = React.useMemo(() => {
    const map = {};
    const cols = viewColumns[tableName] || [];
    cols.forEach((c) => {
      const name = typeof c === 'string' ? c : c.name;
      if (!name) return;
      const key = columnCaseMap[name.toLowerCase()] || name;
      const typ =
        (typeof c === 'string'
          ? ''
          : c.type || c.columnType || c.dataType || c.DATA_TYPE || '')
          .toLowerCase();
      if (typ) map[key] = typ;
    });
    return map;
  }, [viewColumns, tableName, columnCaseMap]);

  const placeholders = React.useMemo(() => {
    const map = {};
    fields.forEach((f) => {
      const typ = fieldTypeMap[f] || columnTypeMap[f] || '';
      if (typ === 'time') {
        map[f] = 'HH:MM:SS';
      } else if (typ === 'date' || typ === 'datetime') {
        map[f] = 'YYYY-MM-DD';
      }
    });
    return map;
  }, [fields, columnTypeMap, fieldTypeMap]);

  const fieldInputTypes = React.useMemo(() => {
    const map = {};
    fields.forEach((f) => {
      const lower = f.toLowerCase();
      const typ = fieldTypeMap[f] || columnTypeMap[f] || '';
      if (typ === 'time' || placeholders[f] === 'HH:MM:SS') {
        map[f] = 'time';
      } else if (
        typ === 'date' ||
        typ === 'datetime' ||
        placeholders[f] === 'YYYY-MM-DD'
      ) {
        map[f] = 'date';
      } else if (
        typ.match(/int|decimal|numeric|double|float|real|number|bigint/) ||
        typeof defaultValues[f] === 'number' ||
        totalAmountSet.has(f) ||
        totalCurrencySet.has(f)
      ) {
        map[f] = 'number';
      } else if (lower.includes('email')) map[f] = 'email';
      else if (lower.includes('phone')) map[f] = 'tel';
      else map[f] = 'text';
    });
    return map;
  }, [fields, columnTypeMap, fieldTypeMap, placeholders, defaultValues, totalAmountSet, totalCurrencySet]);

  useEffect(() => {
    if (!Array.isArray(initRows)) return;
    const base = Array.isArray(initRows) ? initRows : [];
    const next =
      base.length >= minRows
        ? base
        : [
            ...base,
            ...Array.from({ length: minRows - base.length }, () => fillSessionDefaults(defaultValues)),
          ];
    const normalized = next.map((row) => {
      if (!row || typeof row !== 'object') return row;
      const updated = fillSessionDefaults(row);
      Object.entries(updated).forEach(([k, v]) => {
        if (placeholders[k]) {
          updated[k] = normalizeDateInput(String(v ?? ''), placeholders[k]);
        }
      });
      return updated;
    });
    if (JSON.stringify(normalized) !== JSON.stringify(rows)) {
      setRows(normalized);
    }
  }, [initRows, minRows, defaultValues, placeholders, user?.empid, company]);
  const inputRefs = useRef({});
  const focusRow = useRef(0);
  const addBtnRef = useRef(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [invalidCell, setInvalidCell] = useState(null);
  const [previewRow, setPreviewRow] = useState(null);
  const [uploadRow, setUploadRow] = useState(null);
  const fetchFlagsRef = useRef({});
  const [fetchFlags, setFetchFlags] = useState(fetchFlagsRef.current);
  const procCache = useRef({});

  const inputFontSize = Math.max(10, labelFontSize);
  const labelStyle = { fontSize: `${labelFontSize}px` };
  const inputStyle = {
    fontSize: `${inputFontSize}px`,
    padding: '0.25rem 0.5rem',
    width: `${boxWidth}px`,
    minWidth: `${boxWidth}px`,
    maxWidth: `${boxMaxWidth}px`,
    height: `${boxHeight}px`,
    maxHeight: `${boxMaxHeight}px`,
    overflow: 'hidden',
  };
  const colStyle = {
    width: `${boxWidth}px`,
    minWidth: `${boxWidth}px`,
    maxWidth: `${boxMaxWidth}px`,
    wordBreak: 'break-word',
  };
  const enabledFields = fields.filter((f) => !disabledSet.has(f.toLowerCase()));

  function isValidDate(value, format) {
    if (!value) return true;
    const isoRe = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;
    let v = normalizeDateInput(String(value), format);
    if (isoRe.test(v)) {
      const d = new Date(v);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      const hh = String(d.getHours()).padStart(2, '0');
      const mi = String(d.getMinutes()).padStart(2, '0');
      const ss = String(d.getSeconds()).padStart(2, '0');
      if (format === 'YYYY-MM-DD') v = `${yyyy}-${mm}-${dd}`;
      else if (format === 'HH:MM:SS') v = `${hh}:${mi}:${ss}`;
    }
    const map = {
      'YYYY-MM-DD': /^\d{4}-\d{2}-\d{2}$/,
      'HH:MM:SS': /^\d{2}:\d{2}:\d{2}$/,
    };
    const re = map[format];
    if (!re) return true;
    if (!re.test(v)) return false;
    if (format !== 'HH:MM:SS') {
      const d = new Date(v.replace(' ', 'T'));
      return !isNaN(d.getTime());
    }
    return true;
  }

  useEffect(() => {
    if (rows.length < minRows) {
      setRows((r) => {
        const next = [...r];
        while (next.length < minRows) next.push({});
        return next;
      });
    }
    if (focusRow.current === null) return;
    const idx = focusRow.current;
    const first = enabledFields[0] || fields[0];
    const el = inputRefs.current[`${idx}-${fields.indexOf(first)}`];
    if (el) {
      el.focus();
      if (el.select) el.select();
    }
    focusRow.current = null;
  }, [rows, minRows]);

  function resizeInputs() {
    Object.values(inputRefs.current).forEach((el) => {
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

  useEffect(resizeInputs, [rows, boxWidth, boxMaxWidth, boxMaxHeight]);
  useEffect(() => {
    resizeInputs();
  }, []);

  useImperativeHandle(ref, () => ({
    getRows: () => rows,
    clearRows: () =>
      setRows(() => {
        const next = Array.from({ length: minRows }, () => fillSessionDefaults(defaultValues));
        onRowsChange(next);
        return next;
      }),
    replaceRows: (newRows) =>
      setRows(() => {
        const base = Array.isArray(newRows) ? newRows : [];
        const next = base.map((r) => fillSessionDefaults(r));
        onRowsChange(next);
        return next;
      }),
    hasInvalid: () => invalidCell !== null,
  }));

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

  async function runProcTrigger(rowIdx, col, rowOverride = null) {
    const showToast = general.procToastEnabled;
    const direct = getDirectTriggers(col);
    const paramTrigs = getParamTriggers(col);

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
    direct.forEach((cfg) => {
      if (!cfg || !cfg.name) return;
      const key = keyFor(cfg);
      const rec = map.get(key) || { cfg, cols: new Set() };
      rec.cols.add(col.toLowerCase());
      map.set(key, rec);
    });
    paramTrigs.forEach(([tCol, cfg]) => {
      if (!cfg || !cfg.name) return;
      const key = keyFor(cfg);
      const rec = map.get(key) || { cfg, cols: new Set() };
      rec.cols.add(tCol.toLowerCase());
      map.set(key, rec);
    });
    for (const { cfg, cols } of map.values()) {
      const tCol = [...cols][0];
      const { name: procName, params = [], outMap = {} } = cfg;
      const targetCols = Object.values(outMap || {}).map((c) =>
        columnCaseMap[c.toLowerCase()] || c,
      );
      const hasTarget = targetCols.some((c) => fields.includes(c));
      if (!hasTarget) continue;
      const getVal = (name) => {
        const key = columnCaseMap[name.toLowerCase()] || name;
        let val = (rowOverride || rows[rowIdx] || {})[key];
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
      const getParam = (p) => {
        if (p === '$current') return getVal(tCol);
        if (p === '$branchId') return branch;
        if (p === '$companyId') return company;
        if (p === '$employeeId') return user?.empid;
        if (p === '$date') return formatTimestamp(new Date()).slice(0, 10);
        return getVal(p);
      };
      const paramValues = params.map(getParam);
      const aliases = params.map((p) => outMap[p] || null);
      const cacheKey = `${procName}|${JSON.stringify(paramValues)}`;
      if (procCache.current[cacheKey]) {
        const rowData = procCache.current[cacheKey];
        setRows((r) => {
          const next = r.map((row, i) => {
            if (i !== rowIdx) return row;
            const updated = { ...row };
            Object.entries(rowData).forEach(([k, v]) => {
              const key = columnCaseMap[k.toLowerCase()];
              if (key) updated[key] = v;
            });
            return updated;
          });
          onRowsChange(next);
          return next;
        });
        if (showToast) {
          window.dispatchEvent(
            new CustomEvent('toast', {
              detail: { message: `Returned: ${JSON.stringify(rowData)}`, type: 'info' },
            }),
          );
        }
        continue;
      }
      if (showToast) {
        window.dispatchEvent(
          new CustomEvent('toast', {
            detail: {
              message: `${tCol} -> ${procName}(${paramValues.join(', ')})`,
              type: 'info',
            },
          }),
        );
      }
      try {
        const rowData = await callProcedure(
          procName,
          paramValues,
          aliases,
        );
        if (rowData && typeof rowData === 'object') {
          procCache.current[cacheKey] = rowData;
          setRows((r) => {
            const next = r.map((row, i) => {
              if (i !== rowIdx) return row;
              const updated = { ...row };
              Object.entries(rowData).forEach(([k, v]) => {
                const key = columnCaseMap[k.toLowerCase()];
                if (key) updated[key] = v;
              });
              return updated;
            });
            onRowsChange(next);
            return next;
          });
          if (showToast) {
            window.dispatchEvent(
              new CustomEvent('toast', {
                detail: { message: `Returned: ${JSON.stringify(rowData)}`, type: 'info' },
              }),
            );
          }
        }
      } catch (err) {
        console.error('Procedure call failed', err);
        if (showToast) {
          window.dispatchEvent(
            new CustomEvent('toast', {
              detail: { message: `Procedure failed: ${err.message}`, type: 'error' },
            }),
          );
        }
      }
    }
  }

  async function openRelationPreview(col, val) {
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
    if (row && typeof row === 'object') setPreviewRow(row);
  }

  function handleFocusField(col) {
    showTriggerInfo(col);
    if (!fetchFlagsRef.current[col]) {
      if (viewSourceMap[col]) {
        loadView(viewSourceMap[col]);
      }
      fetchFlagsRef.current[col] = true;
      setFetchFlags({ ...fetchFlagsRef.current });
    }
  }

  function addRow() {
    if (requiredFields.length > 0 && rows.length > 0) {
      const prev = rows[rows.length - 1];
      for (const f of fields) {
        let val = prev[f];
        if (placeholders[f]) {
          val = normalizeDateInput(val, placeholders[f]);
        }
        if (totalCurrencySet.has(f) || totalAmountSet.has(f)) {
          val = normalizeNumberInput(val);
        }
        if (requiredFields.includes(f)) {
          if (val === '' || val === null || val === undefined) {
            setErrorMsg(
              `Шинэ мөр нэмэхийн өмнө ${labels[f] || f} талбарыг бөглөнө үү.`,
            );
            setInvalidCell({ row: rows.length - 1, field: f });
            const el = inputRefs.current[`${rows.length - 1}-${fields.indexOf(f)}`];
            if (el) {
              el.focus();
              if (el.select) el.select();
            }
            return;
          }
        }
        if (val !== '' && val !== null && val !== undefined) {
          const skipNum = /code/i.test(f) || /код/i.test(labels[f] || '');
          if (
            (totalCurrencySet.has(f) || totalAmountSet.has(f)) &&
            !skipNum &&
            isNaN(Number(val))
          ) {
            setErrorMsg((labels[f] || f) + ' талбарт буруу тоо байна');
            setInvalidCell({ row: rows.length - 1, field: f });
            const el = inputRefs.current[`${rows.length - 1}-${fields.indexOf(f)}`];
            if (el) {
              el.focus();
              if (el.select) el.select();
            }
            return;
          }
          const ph = placeholders[f];
          if (ph && !isValidDate(val, ph)) {
            setErrorMsg((labels[f] || f) + ' талбарт буруу огноо байна');
            setInvalidCell({ row: rows.length - 1, field: f });
            const el = inputRefs.current[`${rows.length - 1}-${fields.indexOf(f)}`];
            if (el) {
              el.focus();
              if (el.select) el.select();
            }
            return;
          }
        }
      }
    }
    setRows((r) => {
      const row = fillSessionDefaults(defaultValues);
      const next = [...r, row];
      focusRow.current = next.length - 1;
      onRowsChange(next);
      return next;
    });
  }

  function removeRow(idx) {
    setRows((r) => {
      const next = r.filter((_, i) => i !== idx);
      onRowsChange(next);
      return next;
    });
  }

  function openUpload(idx) {
    setUploadRow(idx);
  }

  function handleUploaded(idx, name) {
    setRows((r) => {
      const next = r.map((row, i) => (i === idx ? { ...row, _imageName: name } : row));
      onRowsChange(next);
      return next;
    });
  }

  function applyAISuggestion(idx, item) {
    if (!item) return;
    setRows((r) => {
      const codeField = fields.find((f) => /code|name|item/i.test(f));
      const qtyField = fields.find((f) => /(qty|quantity|count)/i.test(f));
      const next = r.map((row, i) => {
        if (i !== idx) return row;
        const updated = { ...row };
        if (codeField && item.code !== undefined) updated[codeField] = item.code;
        if (qtyField && item.qty !== undefined) updated[qtyField] = item.qty;
        return updated;
      });
      onRowsChange(next);
      return next;
    });
  }

  function getImageFolder(row) {
    if (!row || !row._saved) return tableName;
    const lowerMap = {};
    Object.keys(row).forEach((k) => {
      lowerMap[k.toLowerCase()] = row[k];
    });
    const t1 = lowerMap['trtype'];
    const t2 =
      lowerMap['uitranstypename'] ||
      lowerMap['transtype'] ||
      lowerMap['transtypename'];
    if (!t1 || !t2) return tableName;
    return `${slugify(t1)}/${slugify(String(t2))}`;
  }


  function handleChange(rowIdx, field, value) {
    setRows((r) => {
      const next = r.map((row, i) => {
        if (i !== rowIdx) return row;
        const updated = { ...row, [field]: value };
        const conf = relationConfigMap[field];
        let val = value;
        if (val && typeof val === 'object' && 'value' in val) {
          val = val.value;
        }
        if (conf && conf.displayFields && relationData[field]?.[val]) {
          const ref = relationData[field][val];
          conf.displayFields.forEach((df) => {
            const key = columnCaseMap[df.toLowerCase()];
            if (key && ref[df] !== undefined) {
              updated[key] = ref[df];
            }
          });
        }
        return updated;
      });
      onRowsChange(next);
      return next;
    });
    if (invalidCell && invalidCell.row === rowIdx && invalidCell.field === field) {
      setInvalidCell(null);
      setErrorMsg('');
    }

    const view = combinedViewSource[field];
    if (view && value !== '') {
      const params = new URLSearchParams({ perPage: 1, debug: 1 });
      const cols = (viewColumns[view] || []).map((c) =>
        typeof c === 'string' ? c : c.name,
      );
      Object.entries(combinedViewSource).forEach(([f, v]) => {
        if (v !== view) return;
        if (!cols.includes(f)) return;
        let pv = f === field ? value : rows[rowIdx]?.[f];
        if (pv === undefined || pv === '') return;
        if (typeof pv === 'object' && 'value' in pv) pv = pv.value;
        params.set(f, pv);
      });
      const url = `/api/tables/${encodeURIComponent(view)}?${params.toString()}`;
      if (general.viewToastEnabled) {
        window.dispatchEvent(
          new CustomEvent('toast', {
            detail: { message: `Lookup ${view}: ${params.toString()}`, type: 'info' },
          }),
        );
      }
      fetch(url, { credentials: 'include' })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (!data || !Array.isArray(data.rows) || data.rows.length === 0) {
            window.dispatchEvent(
              new CustomEvent('toast', { detail: { message: 'No view rows found', type: 'error' } }),
            );
            return;
          }
          if (general.viewToastEnabled) {
            window.dispatchEvent(
              new CustomEvent('toast', { detail: { message: `SQL: ${data.sql}`, type: 'info' } }),
            );
          }
          const rowData = data.rows[0];
          if (general.viewToastEnabled) {
            window.dispatchEvent(
              new CustomEvent('toast', {
                detail: { message: `Result: ${JSON.stringify(rowData)}`, type: 'info' },
              }),
            );
          }
          setRows((r) => {
            const next = r.map((row, i) => {
              if (i !== rowIdx) return row;
              const updated = { ...row };
              Object.entries(rowData).forEach(([k, v]) => {
                const key = columnCaseMap[k.toLowerCase()];
                if (key) updated[key] = v;
              });
              return updated;
            });
            onRowsChange(next);
            return next;
          });
        })
        .catch((err) => {
          window.dispatchEvent(
            new CustomEvent('toast', {
              detail: { message: `View lookup failed: ${err.message}`, type: 'error' },
            }),
          );
        });
    }
  }

  async function saveRow(idx) {
    const row = rows[idx] || {};
    for (const f of requiredFields) {
      let val = row[f];
      if (placeholders[f]) {
        val = normalizeDateInput(val, placeholders[f]);
      }
      if (totalCurrencySet.has(f)) {
        val = normalizeNumberInput(val);
      }
      if (val === '' || val === null || val === undefined) {
        setErrorMsg(`${labels[f] || f} талбарыг бөглөнө үү.`);
        setInvalidCell({ row: idx, field: f });
        const el = inputRefs.current[`${idx}-${fields.indexOf(f)}`];
        if (el) {
          el.focus();
          if (el.select) el.select();
        }
        return;
      }
      const skipNum = /code/i.test(f) || /код/i.test(labels[f] || '');
      if (
        totalCurrencySet.has(f) &&
        val !== '' &&
        !skipNum &&
        isNaN(Number(normalizeNumberInput(val)))
      ) {
        setErrorMsg((labels[f] || f) + ' талбарт буруу тоо байна');
        setInvalidCell({ row: idx, field: f });
        const el = inputRefs.current[`${idx}-${fields.indexOf(f)}`];
        if (el) {
          el.focus();
          if (el.select) el.select();
        }
        return;
      }
      const ph = placeholders[f];
      if (ph && !isValidDate(val, ph)) {
        setErrorMsg((labels[f] || f) + ' талбарт буруу огноо байна');
        setInvalidCell({ row: idx, field: f });
        const el = inputRefs.current[`${idx}-${fields.indexOf(f)}`];
        if (el) {
          el.focus();
          if (el.select) el.select();
        }
        return;
      }
    }
    const cleaned = {};
    Object.entries(row).forEach(([k, v]) => {
      if (k === '_saved') return;
      const key = columnCaseMap[k.toLowerCase()];
      if (!key) return;
      let val = typeof v === 'object' && v !== null && 'value' in v ? v.value : v;
      if (placeholders[key]) val = normalizeDateInput(val, placeholders[key]);
      if (totalAmountSet.has(key) || totalCurrencySet.has(key)) {
        val = normalizeNumberInput(val);
      }
      cleaned[key] = val;
    });
    const ok = await Promise.resolve(onRowSubmit(cleaned));
    if (ok !== false) {
      const savedData = (ok && typeof ok === 'object') ? ok : {};
      const updated = { ...row, ...savedData, _saved: true };
      const imageFields = imagenameFields.length
        ? Array.from(
            new Set([...imagenameFields, imageIdField].filter(Boolean)),
          )
        : imageIdField
        ? [imageIdField]
        : [];
      const { name: newImageName } = buildImageName(updated, imageFields, columnCaseMap);
      const oldImageName = row._imageName;
      if (oldImageName && newImageName && oldImageName !== newImageName) {
        const safeTable = encodeURIComponent(tableName);
        const params = new URLSearchParams();
        const folder = getImageFolder(updated);
        if (folder) params.set('folder', folder);
        const renameUrl =
          `/api/transaction_images/${safeTable}/${encodeURIComponent(oldImageName)}` +
          `/rename/${encodeURIComponent(newImageName)}?${params.toString()}`;
        try {
          await fetch(renameUrl, { method: 'POST', credentials: 'include' });
          const verifyUrl =
            `/api/transaction_images/${safeTable}/${encodeURIComponent(newImageName)}?${params.toString()}`;
          const res = await fetch(verifyUrl, { credentials: 'include' });
          const imgs = res.ok ? await res.json().catch(() => []) : [];
          if (!Array.isArray(imgs) || imgs.length === 0) {
            await fetch(renameUrl, { method: 'POST', credentials: 'include' });
          }
        } catch {
          /* ignore */
        }
        updated._imageName = newImageName;
      }
      setRows((r) => {
        const next = r.map((row, i) => (i === idx ? updated : row));
        onRowsChange(next);
        return next;
      });
      procCache.current = {};
    }
  }


  const totals = React.useMemo(() => {
    const sums = {};
    fields.forEach((f) => {
      if (
        totalAmountSet.has(f) ||
        totalCurrencySet.has(f) ||
        f === 'TotalCur' ||
        f === 'TotalAmt'
      ) {
        sums[f] = rows.reduce(
          (sum, r) => sum + Number(normalizeNumberInput(r[f] || 0)),
          0,
        );
      }
    });
    const count = rows.filter((r) =>
      totalAmountFields.some((col) => {
        const v = r[col];
        return v !== undefined && v !== null && String(v).trim() !== '';
      }),
    ).length;
    return { sums, count };
  }, [rows, fields, totalAmountSet, totalCurrencySet, totalAmountFields]);

  function handleOptionSelect(rowIdx, colIdx, opt) {
    const el = inputRefs.current[`${rowIdx}-${colIdx}`];
    if (!el) return;
    const fake = {
      key: 'Enter',
      preventDefault: () => {},
      target: el,
      selectedOption: opt,
    };
    handleKeyDown(fake, rowIdx, colIdx);
  }

  async function handleKeyDown(e, rowIdx, colIdx) {
    const isEnter = e.key === 'Enter';
    const isForwardTab = e.key === 'Tab' && !e.shiftKey;
    if (!isEnter && !isForwardTab) return;
    e.preventDefault();
    const field = fields[colIdx];
    let label = undefined;
    let val = e.selectedOption ? e.selectedOption.value : e.target.value;
    if (e.selectedOption) label = e.selectedOption.label;
    const typ = fieldTypeMap[field];
    let format = placeholders[field];
    if (!format) {
      if (typ === 'time') format = 'HH:MM:SS';
      else if (typ === 'date' || typ === 'datetime') format = 'YYYY-MM-DD';
    }
    if (format) {
      val = normalizeDateInput(val, format);
    }
    if (typ === 'number' || totalCurrencySet.has(field)) {
      val = normalizeNumberInput(val);
    }
    const newValue = label ? { value: val, label } : val;
    if (JSON.stringify(rows[rowIdx]?.[field]) !== JSON.stringify(newValue)) {
      handleChange(rowIdx, field, newValue);
      if (val !== e.target.value) e.target.value = val;
    }
    if (
      requiredFields.includes(field) &&
      (val === '' || val === undefined)
    ) {
      setErrorMsg(`${labels[field] || field} талбарыг бөглөнө үү.`);
      setInvalidCell({ row: rowIdx, field });
      e.target.focus();
      if (e.target.select) e.target.select();
      return;
    }
    const skipNum = /code/i.test(field) || /код/i.test(labels[field] || '');
    if (
      (typ === 'number' || totalCurrencySet.has(field)) &&
      val !== '' &&
      !skipNum &&
      isNaN(Number(normalizeNumberInput(val)))
    ) {
      setErrorMsg((labels[field] || field) + ' талбарт буруу тоо байна');
      setInvalidCell({ row: rowIdx, field });
      e.target.focus();
      if (e.target.select) e.target.select();
      return;
    }
    if (
      (format || typ === 'date' || typ === 'time' || typ === 'datetime') &&
      !isValidDate(val, format || (typ === 'time' ? 'HH:MM:SS' : 'YYYY-MM-DD'))
    ) {
      setErrorMsg((labels[field] || field) + ' талбарт буруу огноо байна');
      setInvalidCell({ row: rowIdx, field });
      e.target.focus();
      if (e.target.select) e.target.select();
      return;
    }
    if (hasTrigger(field)) {
      const override = { ...rows[rowIdx], [field]: newValue };
      await runProcTrigger(rowIdx, field, override);
    }
    const enabledIdx = enabledFields.indexOf(field);
    const nextField = enabledFields[enabledIdx + 1];
    if (nextField) {
      const el = inputRefs.current[`${rowIdx}-${fields.indexOf(nextField)}`];
      if (el) {
        el.focus();
        if (el.select) el.select();
      }
      return;
    }
    if (rowIdx < rows.length - 1) {
      const first = enabledFields[0] || fields[0];
      const el = inputRefs.current[`${rowIdx + 1}-${fields.indexOf(first)}`];
      if (el) {
        el.focus();
        if (el.select) el.select();
      }
      return;
    }
    if (collectRows) {
      addRow();
    } else {
      addBtnRef.current?.focus();
      if (onNextForm) onNextForm();
    }
  }

  function renderCell(idx, f, colIdx) {
    const val = rows[idx]?.[f] ?? '';
    const invalid = invalidCell && invalidCell.row === idx && invalidCell.field === f;
    if (disabledSet.has(f.toLowerCase())) {
      let display = typeof val === 'object' ? val.label || val.value : val;
      const rawVal = typeof val === 'object' ? val.value : val;
      if (
        relationConfigMap[f] &&
        rawVal !== undefined &&
        relationData[f]?.[rawVal]
      ) {
        const row = relationData[f][rawVal];
        const parts = [rawVal];
        (relationConfigMap[f].displayFields || []).forEach((df) => {
          if (row[df] !== undefined) parts.push(row[df]);
        });
        display = parts.join(' - ');
      } else if (
        viewSourceMap[f] &&
        rawVal !== undefined &&
        relationData[f]?.[rawVal]
      ) {
        const row = relationData[f][rawVal];
        const cfg = viewDisplays[viewSourceMap[f]] || {};
        const parts = [rawVal];
        (cfg.displayFields || []).forEach((df) => {
          if (row[df] !== undefined) parts.push(row[df]);
        });
        display = parts.join(' - ');
      } else if (
        autoSelectConfigs[f] &&
        rawVal !== undefined &&
        relationData[f]?.[rawVal]
      ) {
        const row = relationData[f][rawVal];
        const cfg = autoSelectConfigs[f];
        const parts = [rawVal];
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
      return (
        <div className="flex items-center" title={display}>
          <div
            className="px-1 border rounded bg-gray-100"
            style={readonlyStyle}
            ref={(el) => (inputRefs.current[`ro-${idx}-${f}`] = el)}
          >
            {display}
          </div>
        </div>
      );
    }
    if (rows[idx]?._saved && !collectRows) {
      const isoDatePattern = /^\d{4}-\d{2}-\d{2}(?:T.*)?$/;
      const displayVal = typeof val === 'object' ? val.label ?? val.value : val;
      if (
        typeof displayVal === 'string' &&
        isoDatePattern.test(displayVal) &&
        !placeholders[f]
      ) {
        return normalizeDateInput(displayVal, 'YYYY-MM-DD');
      }
      return displayVal;
    }
    if (relationConfigMap[f]) {
      const conf = relationConfigMap[f];
      const inputVal = typeof val === 'object' ? val.value : val;
      return (
        <AsyncSearchSelect
          shouldFetch={fetchFlags[f]}
          table={conf.table}
          searchColumn={conf.idField || conf.column}
          searchColumns={[conf.idField || conf.column, ...(conf.displayFields || [])]}
          labelFields={conf.displayFields || []}
          value={inputVal}
          onChange={(v, label) =>
            handleChange(idx, f, label ? { value: v, label } : v)
          }
          onSelect={(opt) => handleOptionSelect(idx, colIdx, opt)}
          inputRef={(el) => (inputRefs.current[`${idx}-${colIdx}`] = el)}
          onKeyDown={(e) => handleKeyDown(e, idx, colIdx)}
          onFocus={() => handleFocusField(f)}
          className={invalid ? 'border-red-500 bg-red-100' : ''}
          inputStyle={inputStyle}
          companyId={company}
        />
      );
    }
    if (Array.isArray(relations[f])) {
      const inputVal = typeof val === 'object' ? val.value : val;
      return (
        <select
          className={`w-full border px-1 ${invalid ? 'border-red-500 bg-red-100' : ''}`}
          style={inputStyle}
          value={inputVal}
          onChange={(e) => handleChange(idx, f, e.target.value)}
          ref={(el) => (inputRefs.current[`${idx}-${colIdx}`] = el)}
          onKeyDown={(e) => handleKeyDown(e, idx, colIdx)}
          onFocus={() => handleFocusField(f)}
          title={typeof val === 'object' ? val.label || val.value : val}
        >
          <option value="">-- select --</option>
          {relations[f].map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      );
    }
    if (viewSourceMap[f]) {
      const view = viewSourceMap[f];
      const cfg = viewDisplays[view] || {};
      const inputVal = typeof val === 'object' ? val.value : val;
      const idField = cfg.idField || f;
      const labelFields = cfg.displayFields || [];
      return (
        <AsyncSearchSelect
          shouldFetch={fetchFlags[f]}
          table={view}
          searchColumn={idField}
          searchColumns={[idField, ...labelFields]}
          labelFields={labelFields}
          idField={idField}
          value={inputVal}
          onChange={(v, label) =>
            handleChange(idx, f, label ? { value: v, label } : v)
          }
          onSelect={(opt) => handleOptionSelect(idx, colIdx, opt)}
          inputRef={(el) => (inputRefs.current[`${idx}-${colIdx}`] = el)}
          onKeyDown={(e) => handleKeyDown(e, idx, colIdx)}
          onFocus={() => handleFocusField(f)}
          className={invalid ? 'border-red-500 bg-red-100' : ''}
          inputStyle={inputStyle}
          companyId={company}
        />
      );
    }
    if (autoSelectConfigs[f]) {
      const cfg = autoSelectConfigs[f];
      const inputVal = typeof val === 'object' ? val.value : val;
      return (
        <AsyncSearchSelect
          shouldFetch={fetchFlags[f]}
          table={cfg.table}
          searchColumn={cfg.idField}
          searchColumns={[cfg.idField, ...(cfg.displayFields || [])]}
          labelFields={cfg.displayFields || []}
          idField={cfg.idField}
          value={inputVal}
          onChange={(v, label) =>
            handleChange(idx, f, label ? { value: v, label } : v)
          }
          onSelect={(opt) => handleOptionSelect(idx, colIdx, opt)}
          inputRef={(el) => (inputRefs.current[`${idx}-${colIdx}`] = el)}
          onKeyDown={(e) => handleKeyDown(e, idx, colIdx)}
          onFocus={() => handleFocusField(f)}
          className={invalid ? 'border-red-500 bg-red-100' : ''}
          inputStyle={inputStyle}
          companyId={company}
        />
      );
    }
    const fieldType = fieldInputTypes[f];
    const rawVal = typeof val === 'object' ? val.value : val;
    const normalizedVal =
      fieldType === 'date'
        ? normalizeDateInput(String(rawVal ?? ''), 'YYYY-MM-DD')
        : rawVal;
    const commonProps = {
      className: `w-full border px-1 ${invalid ? 'border-red-500 bg-red-100' : ''}`,
      style: { ...inputStyle },
      value: normalizedVal,
      title: normalizedVal,
      onChange: (e) => handleChange(idx, f, e.target.value),
      ref: (el) => (inputRefs.current[`${idx}-${colIdx}`] = el),
      onKeyDown: (e) => handleKeyDown(e, idx, colIdx),
      onFocus: () => handleFocusField(f),
    };
    if (fieldType === 'date') {
      return <input type="date" {...commonProps} />;
    }
    if (fieldType === 'time') {
      return <input type="time" {...commonProps} />;
    }
    if (fieldType === 'email') {
      return <input type="email" inputMode="email" {...commonProps} />;
    }
    if (fieldType === 'tel') {
      return <input type="tel" inputMode="tel" {...commonProps} />;
    }
    if (fieldType === 'number') {
      return <input type="number" inputMode="decimal" {...commonProps} />;
    }
    return (
      <textarea
        rows={1}
        className={`w-full border px-1 resize-none whitespace-pre-wrap ${invalid ? 'border-red-500 bg-red-100' : ''}`}
        style={{ overflow: 'hidden', ...inputStyle }}
        value={typeof val === 'object' ? val.value : val}
        title={typeof val === 'object' ? val.value : val}
        onChange={(e) => handleChange(idx, f, e.target.value)}
        ref={(el) => (inputRefs.current[`${idx}-${colIdx}`] = el)}
        onKeyDown={(e) => handleKeyDown(e, idx, colIdx)}
        onFocus={() => handleFocusField(f)}
        onInput={(e) => {
          e.target.style.height = 'auto';
          const h = Math.min(e.target.scrollHeight, boxMaxHeight);
          e.target.style.height = `${h}px`;
          e.target.style.overflowY = e.target.scrollHeight > h ? 'auto' : 'hidden';
        }}
      />
    );
  }

  return (
    <div className="overflow-x-auto overflow-y-visible relative">
      <table
        className="min-w-max border border-gray-300"
        style={{ fontSize: `${inputFontSize}px` }}
      >
        <thead className="bg-gray-50">
          <tr>
            {fields.map((f) => {
              const label = labels[f] || f;
              const vertical = label.length <= 8;
              return (
                <th
                  key={f}
                  className="border px-1 py-1"
                  style={{
                    whiteSpace: 'normal',
                    wordBreak: 'break-word',
                    lineHeight: '1.1',
                    fontSize: labelStyle.fontSize,
                    maxHeight: '3em',
                    ...colStyle,
                    ...(vertical
                      ? { writingMode: 'vertical-rl', transform: 'rotate(180deg)' }
                      : {}),
                  }}
                >
                  {label}
                </th>
              );
            })}
            <th className="border px-1 py-1">Images</th>
            <th className="border px-1 py-1" />
          </tr>
        </thead>
        <tbody>
          {rows.map((r, idx) => (
            <tr key={idx}>
              {fields.map((f, cIdx) => (
                <td key={f} className="border px-1 py-1 align-top" style={colStyle}>
                  {renderCell(idx, f, cIdx)}
                </td>
              ))}
              <td className="border px-1 py-1 text-right" style={{ whiteSpace: 'nowrap' }}>
                <button type="button" onClick={() => openUpload(idx)}>Add/View Image</button>
              </td>
              <td className="border px-1 py-1 text-right">
                {collectRows ? (
                  <button onClick={() => removeRow(idx)}>Delete</button>
                ) : r._saved ? (
                  <button onClick={() => handleChange(idx, '_saved', false)}>
                    Edit
                  </button>
                ) : (
                  <button onClick={() => saveRow(idx)}>Save</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
        {(totalAmountFields.length > 0 ||
          totalCurrencyFields.length > 0 ||
          fields.includes('TotalCur') ||
          fields.includes('TotalAmt')) && (
          <tfoot>
            <tr>
              {fields.map((f) => {
                let val = '';
                if (totalCurrencySet.has(f) || f === 'TotalCur') {
                  val = currencyFmt.format(totals.sums[f] || 0);
                } else if (totalAmountSet.has(f) || f === 'TotalAmt') {
                  val = totals.sums[f] !== undefined ? totals.sums[f] : '';
                } else if (totals.sums[f] !== undefined) {
                  val = totals.sums[f];
                }
                return (
                  <td key={f} className="border px-1 py-1 font-semibold" style={colStyle}>
                    {val}
                  </td>
                );
              })}
              <td className="border px-1 py-1" />
              <td className="border px-1 py-1 font-semibold text-center">НИЙТ</td>
            </tr>
            <tr>
              {fields.map((f, idx) => (
                <td key={f} className="border px-1 py-1 font-semibold" style={colStyle}>
                  {idx === 0 ? totals.count : ''}
                </td>
              ))}
              <td className="border px-1 py-1" />
              <td className="border px-1 py-1 font-semibold text-center">
                мөрийн тоо
              </td>
            </tr>
          </tfoot>
        )}
      </table>
      {errorMsg && (
        <div className="text-red-600 text-sm mt-1">{errorMsg}</div>
      )}
      {collectRows && (
        <button
          onClick={addRow}
          ref={addBtnRef}
          className="mt-2 px-2 py-1 bg-gray-200 rounded"
        >
          + Мөр нэмэх
        </button>
      )}
      <RowDetailModal
        visible={!!previewRow}
        onClose={() => setPreviewRow(null)}
        row={previewRow || {}}
        columns={previewRow ? Object.keys(previewRow) : []}
        relations={relations}
        labels={labels}
        fieldTypeMap={fieldTypeMap}
      />
      <RowImageUploadModal
        visible={uploadRow !== null}
        onClose={() => setUploadRow(null)}
        table={tableName}
        folder={getImageFolder(rows[uploadRow])}
        row={rows[uploadRow] || {}}
        rowKey={uploadRow}
        imagenameFields={imagenameFields}
        columnCaseMap={columnCaseMap}
        imageIdField={imageIdField}
        onUploaded={(name) => handleUploaded(uploadRow, name)}
        onSuggestion={(it) => applyAISuggestion(uploadRow, it)}
      />
    </div>
  );
});
