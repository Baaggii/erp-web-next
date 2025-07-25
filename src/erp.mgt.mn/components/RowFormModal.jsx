import React, { useState, useEffect, useRef, useContext, memo } from 'react';
import AsyncSearchSelect from './AsyncSearchSelect.jsx';
import Modal from './Modal.jsx';
import InlineTransactionTable from './InlineTransactionTable.jsx';
import { AuthContext } from '../context/AuthContext.jsx';
import formatTimestamp from '../utils/formatTimestamp.js';
import callProcedure from '../utils/callProcedure.js';
import useGeneralConfig from '../hooks/useGeneralConfig.js';

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
  disabledFields = [],
  labels = {},
  requiredFields = [],
  onChange = () => {},
  onRowsChange = () => {},
  headerFields = [],
  footerFields = [],
  mainFields = [],
  printEmpField = [],
  printCustField = [],
  totalAmountFields = [],
  totalCurrencyFields = [],
  defaultValues = {},
  dateField = [],
  inline = false,
  useGrid = false,
  fitted = false,
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
  procTriggers = {},
}) {
  const mounted = useRef(false);
  const renderCount = useRef(0);
  const warned = useRef(false);
  const procCache = useRef({});
  const generalConfig = useGeneralConfig();
  const cfg = generalConfig[scope] || {};
  labelFontSize = labelFontSize ?? cfg.labelFontSize ?? 14;
  boxWidth = boxWidth ?? cfg.boxWidth ?? 60;
  boxHeight = boxHeight ?? cfg.boxHeight ?? 30;
  boxMaxWidth = boxMaxWidth ?? cfg.boxMaxWidth ?? 150;
  boxMaxHeight = boxMaxHeight ?? cfg.boxMaxHeight ?? 150;

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
  const { user, company } = useContext(AuthContext);
  const [formVals, setFormVals] = useState(() => {
    const init = {};
    const now = new Date();
    columns.forEach((c) => {
      const lower = c.toLowerCase();
      let placeholder = '';
      if (lower.includes('time') && !lower.includes('date')) {
        placeholder = 'HH:MM:SS';
      } else if (lower.includes('timestamp') || lower.includes('date')) {
        placeholder = 'YYYY-MM-DD';
      }
      const raw = row ? String(row[c] ?? '') : String(defaultValues[c] ?? '');
      let val = normalizeDateInput(raw, placeholder);
      if (!row && !val && dateField.includes(c)) {
        if (placeholder === 'YYYY-MM-DD') val = formatTimestamp(now).slice(0, 10);
        else if (placeholder === 'HH:MM:SS') val = formatTimestamp(now).slice(11, 19);
        else val = formatTimestamp(now);
      }
      if (!row && !val && headerSet.has(c)) {
        if (
          ['created_by', 'employee_id', 'emp_id', 'empid', 'user_id'].includes(c) &&
          user?.empid
        ) {
          val = user.empid;
        } else if (c === 'branch_id' && company?.branch_id !== undefined) {
          val = company.branch_id;
        } else if (c === 'department_id' && company?.department_id !== undefined) {
          val = company.department_id;
        } else if (c === 'company_id' && company?.company_id !== undefined) {
          val = company.company_id;
        }
      }
      init[c] = val;
    });
    return init;
  });
  const [extraVals, setExtraVals] = useState(() => {
    const extras = {};
    Object.entries(row || {}).forEach(([k, v]) => {
      if (!columns.includes(k)) {
        const lower = k.toLowerCase();
        let placeholder = '';
        if (lower.includes('time') && !lower.includes('date')) {
          placeholder = 'HH:MM:SS';
        } else if (lower.includes('timestamp') || lower.includes('date')) {
          placeholder = 'YYYY-MM-DD';
        }
        extras[k] = normalizeDateInput(String(v ?? ''), placeholder);
      }
    });
    return extras;
  });
  const inputRefs = useRef({});
  const [errors, setErrors] = useState({});
  const [submitLocked, setSubmitLocked] = useState(false);
  const tableRef = useRef(null);
  const [gridRows, setGridRows] = useState(() => (Array.isArray(rows) ? rows : []));
  const wrapRef = useRef(null);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    if (useGrid) {
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
  const placeholders = React.useMemo(() => {
    const map = {};
    const cols = new Set([
      ...columns,
      ...Object.keys(row || {}),
      ...Object.keys(defaultValues || {}),
    ]);
    cols.forEach((c) => {
      const lower = c.toLowerCase();
      if (lower.includes('time') && !lower.includes('date')) {
        map[c] = 'HH:MM:SS';
      } else if (lower.includes('timestamp') || lower.includes('date')) {
        map[c] = 'YYYY-MM-DD';
      }
    });
    return map;
  }, [columns, row, defaultValues]);

  useEffect(() => {
    const extras = {};
    Object.entries(row || {}).forEach(([k, v]) => {
      if (!columns.includes(k)) {
        extras[k] = normalizeDateInput(String(v ?? ''), placeholders[k]);
      }
    });
    setExtraVals(extras);
  }, [row, columns, placeholders]);

  function normalizeDateInput(value, format) {
    if (typeof value !== 'string') return value;
    let v = value.trim().replace(/^(\d{4})[.,](\d{2})[.,](\d{2})/, '$1-$2-$3');
    if (/^\d{4}-\d{2}-\d{2}T/.test(v) && !isNaN(Date.parse(v))) {
      const local = formatTimestamp(new Date(v));
      return format === 'HH:MM:SS' ? local.slice(11, 19) : local.slice(0, 10);
    }
    return v;
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
      const raw = row ? String(row[c] ?? '') : String(defaultValues[c] ?? '');
      let v = normalizeDateInput(raw, placeholders[c]);
        if (!row && !v && dateField.includes(c)) {
          const now = new Date();
          if (placeholders[c] === 'YYYY-MM-DD') v = formatTimestamp(now).slice(0, 10);
          else if (placeholders[c] === 'HH:MM:SS') v = formatTimestamp(now).slice(11, 19);
          else v = formatTimestamp(now);
        }
      if (!row && !v && headerSet.has(c)) {
        if (
          ['created_by', 'employee_id', 'emp_id', 'empid', 'user_id'].includes(c) &&
          user?.empid
        ) {
          v = user.empid;
        } else if (c === 'branch_id' && company?.branch_id !== undefined) {
          v = company.branch_id;
        } else if (c === 'department_id' && company?.department_id !== undefined) {
          v = company.department_id;
        } else if (c === 'company_id' && company?.company_id !== undefined) {
          v = company.company_id;
        }
      }
      vals[c] = v;
    });
    // Avoid triggering a state update if the values haven't actually changed.
    const same = Object.keys(vals).every((k) => formVals[k] === vals[k]);
    if (!same) setFormVals(vals);
    inputRefs.current = {};
    setErrors({});
  }, [row, visible, user, company]);

  useEffect(() => {
    Object.values(inputRefs.current).forEach((el) => {
      if (!el) return;
      if (el.tagName === 'INPUT') {
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
  }, [formVals, boxWidth, boxMaxWidth, boxMaxHeight]);

  if (!visible) return null;

  const mainSet = new Set(mainFields);
  const totalAmountSet = new Set(totalAmountFields);
  const totalCurrencySet = new Set(totalCurrencyFields);
  const headerCols = columns.filter((c) => headerSet.has(c));
  const footerCols = columns.filter((c) => footerSet.has(c));
  const mainCols =
    mainFields.length > 0
      ? columns.filter((c) => mainSet.has(c))
      : columns.filter((c) => !headerSet.has(c) && !footerSet.has(c));

  const inputFontSize = Math.max(10, labelFontSize);
  const formGridClass = fitted ? 'grid' : 'grid gap-2';
  const formGridStyle = {
    gap: '2px',
    gridTemplateColumns: fitted
      ? `repeat(auto-fill, minmax(${boxWidth}px, ${boxMaxWidth}px))`
      : `repeat(2, minmax(${boxWidth}px, ${boxMaxWidth}px))`,
    fontSize: `${inputFontSize}px`,
  };
  const labelStyle = { fontSize: `${labelFontSize}px` };
  const inputStyle = {
    fontSize: `${inputFontSize}px`,
    padding: '0.25rem 0.5rem',
    width: 'auto',
    minWidth: `${boxWidth}px`,
    maxWidth: `${boxMaxWidth}px`,
    height: `${boxHeight}px`,
    maxHeight: `${boxMaxHeight}px`,
    overflow: 'hidden',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  };

  async function handleKeyDown(e, col) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    let label = undefined;
    let val = e.selectedOption ? e.selectedOption.value : e.target.value;
    if (e.selectedOption) label = e.selectedOption.label;
    val = normalizeDateInput(val, placeholders[col]);
    if (totalAmountSet.has(col) || totalCurrencySet.has(col)) {
      val = normalizeNumberInput(val);
    }
    const newVal = label ? { value: val, label } : val;
    if (JSON.stringify(formVals[col]) !== JSON.stringify(newVal)) {
      setFormVals((v) => ({ ...v, [col]: newVal }));
      onChange({ [col]: newVal });
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
    if (
      (totalAmountSet.has(col) || totalCurrencySet.has(col)) &&
      val !== '' &&
      isNaN(Number(normalizeNumberInput(val)))
    ) {
      setErrors((er) => ({ ...er, [col]: 'Буруу тоон утга' }));
      return;
    }
    if (hasTrigger(col)) {
      const override = { ...formVals, [col]: newVal };
      await runProcTrigger(col, override);
    }

    const enabled = columns.filter((c) => !disabledFields.includes(c));
    const idx = enabled.indexOf(col);
    const next = enabled[idx + 1];
    if (next && inputRefs.current[next]) {
      const el = inputRefs.current[next];
      el.focus();
      if (el.select) el.select();
      return;
    }
    if (!next) {
      submitForm();
      if (onNextForm) onNextForm();
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

  async function runProcTrigger(col, valsOverride = null) {
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
      const hasTarget = targetCols.some((c) => columns.includes(c));
      if (!hasTarget) continue;
      const getVal = (name) => {
        const key = columnCaseMap[name.toLowerCase()] || name;
        let val = (valsOverride || formVals)[key];
        if (val === undefined) val = extraVals[key];
        if (val && typeof val === 'object' && 'value' in val) {
          val = val.value;
        }
        return val;
      };
      const getParam = (p) => {
        if (p === '$current') return getVal(tCol);
        if (p === '$branchId') return company?.branch_id;
        if (p === '$companyId') return company?.company_id;
        if (p === '$employeeId') return user?.empid;
        if (p === '$date') return formatTimestamp(new Date()).slice(0, 10);
        return getVal(p);
      };
      const paramValues = params.map(getParam);
      const aliases = params.map((p) => outMap[p] || null);
      const cacheKey = `${procName}|${JSON.stringify(paramValues)}`;
      if (procCache.current[cacheKey]) {
        const row = procCache.current[cacheKey];
        const norm = {};
        Object.entries(row).forEach(([k, v]) => {
          norm[k] = normalizeDateInput(v, placeholders[k]);
        });
        setExtraVals((v) => ({ ...v, ...norm }));
        setFormVals((vals) => {
          const updated = { ...vals };
          Object.entries(norm).forEach(([k, v]) => {
            if (updated[k] !== undefined) updated[k] = v;
          });
          return updated;
        });
        onChange(norm);
        window.dispatchEvent(
          new CustomEvent('toast', {
            detail: { message: `Returned: ${JSON.stringify(row)}`, type: 'info' },
          }),
        );
        continue;
      }
      window.dispatchEvent(
        new CustomEvent('toast', {
          detail: {
            message: `${tCol} -> ${procName}(${paramValues.join(', ')})`,
            type: 'info',
        },
      }),
    );
    try {
      const row = await callProcedure(procName, paramValues, aliases);
      if (row && typeof row === 'object') {
        procCache.current[cacheKey] = row;
        const norm = {};
        Object.entries(row).forEach(([k, v]) => {
          norm[k] = normalizeDateInput(v, placeholders[k]);
        });
        setExtraVals((v) => ({ ...v, ...norm }));
        setFormVals((vals) => {
          const updated = { ...vals };
          Object.entries(norm).forEach(([k, v]) => {
            if (updated[k] !== undefined) updated[k] = v;
          });
          return updated;
        });
        onChange(norm);
        window.dispatchEvent(
          new CustomEvent('toast', {
            detail: { message: `Returned: ${JSON.stringify(row)}`, type: 'info' },
          }),
        );
      }
    } catch (err) {
      console.error('Procedure call failed', err);
      window.dispatchEvent(
        new CustomEvent('toast', {
          detail: { message: `Procedure failed: ${err.message}`, type: 'error' },
        }),
      );
    }
    }
  }

  async function handleFocusField(col) {
    showTriggerInfo(col);
  }

  async function submitForm() {
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
        for (let i = 0; i < cleanedRows.length; i++) {
          const r = cleanedRows[i];
          try {
            const res = await Promise.resolve(onSubmit(r));
            if (res === false) failedRows.push(rows[rowIndices[i]]);
          } catch (err) {
            console.error('Submit failed', err);
            failedRows.push(rows[rowIndices[i]]);
          }
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
      const normalized = {};
      Object.entries({ ...extraVals, ...formVals }).forEach(([k, v]) => {
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
    const disabled = disabledFields.includes(c);

    if (disabled) {
      const val = formVals[c];
      if (!withLabel) {
        return (
          <div className="w-full border rounded bg-gray-100 px-2 py-1" style={inputStyle} title={val}>
            {val}
          </div>
        );
      }
      return (
        <div key={c} className={fitted ? 'mb-1' : 'mb-3'}>
          <label className="block mb-1 font-medium" style={labelStyle}>
            {labels[c] || c}
          </label>
          <div className="w-full border rounded bg-gray-100 px-2 py-1" style={inputStyle} title={val}>
            {val}
          </div>
        </div>
      );
    }

    const control = relationConfigs[c] ? (
      <AsyncSearchSelect
        title={labels[c] || c}
        table={relationConfigs[c].table}
        searchColumn={relationConfigs[c].column}
        labelFields={relationConfigs[c].displayFields || []}
        value={typeof formVals[c] === 'object' ? formVals[c].value : formVals[c]}
        onChange={(val) => {
          setFormVals((v) => ({ ...v, [c]: val }));
          setErrors((er) => ({ ...er, [c]: undefined }));
          onChange({ [c]: val });
        }}
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
        }}
        inputRef={(el) => (inputRefs.current[c] = el)}
        inputStyle={inputStyle}
      />
    ) : viewSource[c] && !Array.isArray(relations[c]) ? (
      <AsyncSearchSelect
        title={labels[c] || c}
        table={viewSource[c]}
        searchColumn={viewDisplays[viewSource[c]]?.idField || c}
        searchColumns={[
          viewDisplays[viewSource[c]]?.idField || c,
          ...(viewDisplays[viewSource[c]]?.displayFields || []),
        ]}
        labelFields={viewDisplays[viewSource[c]]?.displayFields || []}
        idField={viewDisplays[viewSource[c]]?.idField || c}
        value={typeof formVals[c] === 'object' ? formVals[c].value : formVals[c]}
        onChange={(val) => {
          setFormVals((v) => ({ ...v, [c]: val }));
          setErrors((er) => ({ ...er, [c]: undefined }));
          onChange({ [c]: val });
        }}
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
        }}
        inputRef={(el) => (inputRefs.current[c] = el)}
        inputStyle={inputStyle}
      />
    ) : Array.isArray(relations[c]) ? (
      <select
        title={formVals[c]}
        ref={(el) => (inputRefs.current[c] = el)}
        value={formVals[c]}
        onFocus={() => handleFocusField(c)}
        onChange={(e) => {
          setFormVals((prev) => {
            if (prev[c] === e.target.value) return prev;
            const updated = { ...prev, [c]: e.target.value };
            onChange({ [c]: e.target.value });
            return updated;
          });
          setErrors((er) => ({ ...er, [c]: undefined }));
          onChange({ [c]: e.target.value });
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
        title={formVals[c]}
        ref={(el) => (inputRefs.current[c] = el)}
        type="text"
        placeholder={placeholders[c] || ''}
        value={formVals[c]}
        onChange={(e) => {
          setFormVals((prev) => {
            if (prev[c] === e.target.value) return prev;
            const updated = { ...prev, [c]: e.target.value };
            onChange({ [c]: e.target.value });
            return updated;
          });
          setErrors((er) => ({ ...er, [c]: undefined }));
          onChange({ [c]: e.target.value });
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

    if (!withLabel) return <>{control}</>;

    return (
      <div key={c} className={fitted ? 'mb-1' : 'mb-3'}>
        <label className="block mb-1 font-medium" style={labelStyle}>
          {labels[c] || c}
          {requiredFields.includes(c) && (
            <span className="text-red-500">*</span>
          )}
        </label>
        {control}
        {err && <div className="text-red-500 text-sm">{err}</div>}
      </div>
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
      return (
        <div className="mb-4">
          <h3 className="mt-0 mb-1 font-semibold">Main</h3>
          <InlineTransactionTable
            ref={useGrid ? tableRef : undefined}
            fields={cols}
            relations={relations}
            relationConfigs={relationConfigs}
            relationData={relationData}
            labels={labels}
            totalAmountFields={totalAmountFields}
            totalCurrencyFields={totalCurrencyFields}
            viewSource={viewSource}
            viewDisplays={viewDisplays}
            viewColumns={viewColumns}
            procTriggers={procTriggers}
            user={user}
            company={company}
            columnCaseMap={columnCaseMap}
            collectRows={useGrid}
            minRows={1}
            onRowSubmit={onSubmit}
            onRowsChange={(rows) => {
              setGridRows(rows);
              onRowsChange(rows);
            }}
            requiredFields={requiredFields}
            disabledFields={disabledFields}
            defaultValues={defaultValues}
            dateField={dateField}
            rows={rows}
            onNextForm={onNextForm}
            labelFontSize={labelFontSize}
            boxWidth={boxWidth}
            boxHeight={boxHeight}
            boxMaxWidth={boxMaxWidth}
            scope={scope}
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
    if (cols.length === 0) return null;
    const grid = (
      <div className={formGridClass} style={formGridStyle}>
        {cols.map((c) => {
          let val = formVals[c];
          if ((val === '' || val === undefined) && headerSet.has(c)) {
            if (
              ['created_by', 'employee_id', 'emp_id', 'empid', 'user_id'].includes(c) &&
              user?.empid
            ) {
              val = user.empid;
            } else if (c === 'branch_id' && company?.branch_id !== undefined) {
              val = company.branch_id;
            } else if (c === 'department_id' && company?.department_id !== undefined) {
              val = company.department_id;
            } else if (c === 'company_id' && company?.company_id !== undefined) {
              val = company.company_id;
            }
          }
          return (
            <div key={c} className={fitted ? 'mb-1' : 'mb-3'}>
              <label className="block mb-1 font-medium" style={labelStyle}>{labels[c] || c}</label>
              <div className="w-full border rounded bg-gray-100 px-2 py-1" style={inputStyle} title={val}>
                {val}
              </div>
            </div>
          );
        })}
      </div>
    );
    if (fitted) {
      return (
        <div className="mb-1">
          <h3 className="mt-0 mb-1 font-semibold">Header</h3>
          {grid}
        </div>
      );
    }
    return (
      <div className="mb-4">
        <h3 className="mt-0 mb-1 font-semibold">Header</h3>
        <table className="min-w-full border border-gray-300 text-sm" style={{tableLayout:'fixed',width:'100%'}}>
          <tbody>
            {cols.map((c) => {
              let val = formVals[c];
              if ((val === '' || val === undefined) && headerSet.has(c)) {
                if (
                  ['created_by', 'employee_id', 'emp_id', 'empid', 'user_id'].includes(c) &&
                  user?.empid
                ) {
                  val = user.empid;
                } else if (c === 'branch_id' && company?.branch_id !== undefined) {
                  val = company.branch_id;
                } else if (c === 'department_id' && company?.department_id !== undefined) {
                  val = company.department_id;
                } else if (c === 'company_id' && company?.company_id !== undefined) {
                  val = company.company_id;
                }
              }
              return (
                <tr key={c}>
                  <th
                    className="border px-2 py-1 text-left"
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
                <td
                  className="border px-2 py-1"
                  style={{
                    maxWidth: `${boxMaxWidth}px`,
                    wordBreak: 'break-word',
                    width: `${boxWidth}px`,
                    minWidth: `${boxWidth}px`,
                  }}
                >
                  {val}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  function renderSection(title, cols) {
    if (cols.length === 0) return null;
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
    const w = window.open('', '_blank');
    w.document.write(html);
    w.document.close();
    w.focus();
    w.print();
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
        <div className="mt-2 text-right space-x-2">
          <button
            type="button"
            onClick={() => handlePrint('emp')}
            className="px-3 py-1 bg-gray-200 rounded"
          >
            Print Emp
          </button>
          <button
            type="button"
            onClick={() => handlePrint('cust')}
            className="px-3 py-1 bg-gray-200 rounded"
          >
            Print Cust
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1 bg-gray-200 rounded"
          >
            Cancel
          </button>
          <button type="submit" className="px-3 py-1 bg-blue-600 text-white rounded">
            Post
          </button>
        </div>
        <div className="text-sm text-gray-600">
          Press <strong>Enter</strong> to move to next field. The field will be automatically selected. Use arrow keys to navigate selections.
        </div>
      </form>
    </Modal>
  );
}

export default memo(RowFormModal);
