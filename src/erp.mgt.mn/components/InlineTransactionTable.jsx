import React, {
  useState,
  forwardRef,
  useImperativeHandle,
  useRef,
  useEffect,
} from 'react';
import AsyncSearchSelect from './AsyncSearchSelect.jsx';
import formatTimestamp from '../utils/formatTimestamp.js';

const currencyFmt = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function normalizeNumberInput(value) {
  if (typeof value !== 'string') return value;
  return value.replace(',', '.');
}

function normalizeDateInput(value, format) {
  if (typeof value !== 'string') return value;
  let v = value.replace(/^(\d{4})[.,](\d{2})[.,](\d{2})/, '$1-$2-$3');
  const isoRe = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;
  if (isoRe.test(v)) {
    const local = formatTimestamp(new Date(v));
    if (format === 'YYYY-MM-DD') return local.slice(0, 10);
    if (format === 'HH:MM:SS') return local.slice(11, 19);
    return local;
  }
  return v;
}

export default forwardRef(function InlineTransactionTable({
  fields = [],
  relations = {},
  relationConfigs = {},
  relationData = {},
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
  procTriggers = {},
  user = {},
  company = {},
}, ref) {
  const mounted = useRef(false);
  const renderCount = useRef(0);
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
      return initRows;
    }
    return Array.from({ length: minRows }, () => ({ ...defaultValues }));
  });

  useEffect(() => {
    if (!Array.isArray(initRows)) return;
    setRows((r) => {
      const base = Array.isArray(initRows) ? initRows : [];
      const next = base.length >= minRows
        ? base
        : [...base, ...Array.from({ length: minRows - base.length }, () => ({ ...defaultValues }))];
      return next;
    });
  }, [initRows, minRows, defaultValues]);
  const inputRefs = useRef({});
  const focusRow = useRef(0);
  const addBtnRef = useRef(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [invalidCell, setInvalidCell] = useState(null);
  const procCache = useRef({});

  const totalAmountSet = new Set(totalAmountFields);
  const totalCurrencySet = new Set(totalCurrencyFields);

  const placeholders = React.useMemo(() => {
    const map = {};
    fields.forEach((f) => {
      const lower = f.toLowerCase();
      if (lower.includes('timestamp') || (lower.includes('date') && lower.includes('time'))) {
        map[f] = 'YYYY-MM-DD HH:MM:SS';
      } else if (lower.includes('date')) {
        map[f] = 'YYYY-MM-DD';
      } else if (lower.includes('time')) {
        map[f] = 'HH:MM:SS';
      }
    });
    return map;
  }, [fields]);

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
      else v = `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
    }
    const map = {
      'YYYY-MM-DD': /^\d{4}-\d{2}-\d{2}$/,
      'HH:MM:SS': /^\d{2}:\d{2}:\d{2}$/,
      'YYYY-MM-DD HH:MM:SS': /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/,
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
    const el = inputRefs.current[`${idx}-0`];
    if (el) {
      el.focus();
      if (el.select) el.select();
    }
    focusRow.current = null;
  }, [rows, minRows]);

  useImperativeHandle(ref, () => ({
    getRows: () => rows,
    clearRows: () =>
      setRows(() => {
        const next = Array.from({ length: minRows }, () => ({ ...defaultValues }));
        onRowsChange(next);
        return next;
      }),
    replaceRows: (newRows) =>
      setRows(() => {
        const next = Array.isArray(newRows) ? newRows : [];
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

  async function runProcTrigger(rowIdx, col) {
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
        return rows[rowIdx]?.[key];
      };
      const getParam = (p) => {
        if (p === '$current') return getVal(tCol);
        if (p === '$branchId') return company?.branch_id;
        if (p === '$companyId') return company?.company_id;
        if (p === '$employeeId') return user?.empid;
        if (p === '$date') return new Date().toISOString().slice(0, 10);
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
        window.dispatchEvent(
          new CustomEvent('toast', {
            detail: { message: `Returned: ${JSON.stringify(rowData)}`, type: 'info' },
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
        const res = await fetch('/api/procedures', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ name: procName, params: paramValues, aliases }),
        });
      const js = await res.json();
      const rowData = js.row || {};
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
          window.dispatchEvent(
            new CustomEvent('toast', {
              detail: { message: `Returned: ${JSON.stringify(rowData)}`, type: 'info' },
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

  function handleFocusField(col) {
    showTriggerInfo(col);
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
          if ((totalCurrencySet.has(f) || totalAmountSet.has(f)) && isNaN(Number(val))) {
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
      const next = [...r, { ...defaultValues }];
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

  function handleChange(rowIdx, field, value) {
    setRows((r) => {
      const next = r.map((row, i) => {
        if (i !== rowIdx) return row;
        const updated = { ...row, [field]: value };
        const conf = relationConfigs[field];
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

    const view = viewSource[field];
    if (view && value !== '') {
      const params = new URLSearchParams({ perPage: 1, debug: 1 });
      Object.entries(viewSource).forEach(([f, v]) => {
        if (v !== view) return;
        let pv = f === field ? value : rows[rowIdx]?.[f];
        if (pv === undefined || pv === '') return;
        if (typeof pv === 'object' && 'value' in pv) pv = pv.value;
        params.set(f, pv);
      });
      const url = `/api/tables/${encodeURIComponent(view)}?${params.toString()}`;
      window.dispatchEvent(
        new CustomEvent('toast', {
          detail: { message: `Lookup ${view}: ${params.toString()}`, type: 'info' },
        }),
      );
      fetch(url, { credentials: 'include' })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (!data || !Array.isArray(data.rows) || data.rows.length === 0) {
            window.dispatchEvent(
              new CustomEvent('toast', { detail: { message: 'No view rows found', type: 'error' } }),
            );
            return;
          }
          window.dispatchEvent(new CustomEvent('toast', { detail: { message: `SQL: ${data.sql}`, type: 'info' } }));
          const rowData = data.rows[0];
          window.dispatchEvent(
            new CustomEvent('toast', {
              detail: { message: `Result: ${JSON.stringify(rowData)}`, type: 'info' },
            }),
          );
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
      if (
        totalCurrencySet.has(f) &&
        val !== '' &&
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
      setRows((r) => {
        const next = r.map((row, i) => (i === idx ? { ...row, _saved: true } : row));
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

  async function handleKeyDown(e, rowIdx, colIdx) {
    const isEnter = e.key === 'Enter';
    const isForwardTab = e.key === 'Tab' && !e.shiftKey;
    if (!isEnter && !isForwardTab) return;
    e.preventDefault();
    const field = fields[colIdx];
    let val = e.target.value;
    if (placeholders[field]) {
      val = val.replace(/^(\d{4})[.,](\d{2})[.,](\d{2})/, '$1-$2-$3');
    }
    if (totalCurrencySet.has(field)) {
      val = normalizeNumberInput(val);
    }
    if (rows[rowIdx]?.[field] !== val) {
      handleChange(rowIdx, field, val);
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
    if (
      totalCurrencySet.has(field) &&
      val !== '' &&
      isNaN(Number(normalizeNumberInput(val)))
    ) {
      setErrorMsg((labels[field] || field) + ' талбарт буруу тоо байна');
      setInvalidCell({ row: rowIdx, field });
      e.target.focus();
      if (e.target.select) e.target.select();
      return;
    }
    if (placeholders[field] && !isValidDate(val, placeholders[field])) {
      setErrorMsg((labels[field] || field) + ' талбарт буруу огноо байна');
      setInvalidCell({ row: rowIdx, field });
      e.target.focus();
      if (e.target.select) e.target.select();
      return;
    }
    if (hasTrigger(field)) {
      await runProcTrigger(rowIdx, field);
    }
    const nextCol = colIdx + 1;
    if (nextCol < fields.length) {
      const el = inputRefs.current[`${rowIdx}-${nextCol}`];
      if (el) {
        el.focus();
        if (el.select) el.select();
      }
      return;
    }
    if (rowIdx < rows.length - 1) {
      const el = inputRefs.current[`${rowIdx + 1}-0`];
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
    const isRel = relationConfigs[f] || Array.isArray(relations[f]);
    const invalid = invalidCell && invalidCell.row === idx && invalidCell.field === f;
    if (rows[idx]?._saved && !collectRows) {
      return typeof val === 'object' ? val.label : val;
    }
    if (isRel) {
      if (relationConfigs[f]) {
        const conf = relationConfigs[f];
        const inputVal = typeof val === 'object' ? val.value : val;
        return (
          <AsyncSearchSelect
            table={conf.table}
            searchColumn={conf.column}
            labelFields={conf.displayFields || []}
            value={inputVal}
            onChange={(v, label) =>
              handleChange(idx, f, label ? { value: v, label } : v)
            }
            inputRef={(el) => (inputRefs.current[`${idx}-${colIdx}`] = el)}
            onKeyDown={(e) => handleKeyDown(e, idx, colIdx)}
            onFocus={() => handleFocusField(f)}
            className={invalid ? 'border-red-500 bg-red-100' : ''}
          />
        );
      }
      if (Array.isArray(relations[f])) {
        const inputVal = typeof val === 'object' ? val.value : val;
        return (
          <select
            className={`w-full border px-1 ${invalid ? 'border-red-500 bg-red-100' : ''}`}
            value={inputVal}
            onChange={(e) => handleChange(idx, f, e.target.value)}
            ref={(el) => (inputRefs.current[`${idx}-${colIdx}`] = el)}
            onKeyDown={(e) => handleKeyDown(e, idx, colIdx)}
            onFocus={() => handleFocusField(f)}
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
    }
    return (
      <textarea
        rows={1}
        className={`w-full border px-1 resize-none whitespace-pre-wrap ${invalid ? 'border-red-500 bg-red-100' : ''}`}
        style={{ overflow: 'hidden' }}
        value={typeof val === 'object' ? val.value : val}
        onChange={(e) => handleChange(idx, f, e.target.value)}
        ref={(el) => (inputRefs.current[`${idx}-${colIdx}`] = el)}
        onKeyDown={(e) => handleKeyDown(e, idx, colIdx)}
        onFocus={() => handleFocusField(f)}
        onInput={(e) => {
          e.target.style.height = 'auto';
          e.target.style.height = `${e.target.scrollHeight}px`;
        }}
      />
    );
  }

  return (
    <div className="overflow-x-auto overflow-y-visible relative">
      <table className="min-w-max border border-gray-300 text-xs">
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
                    fontSize: '0.75rem',
                    maxHeight: '3em',
                    ...(vertical
                      ? { writingMode: 'vertical-rl', transform: 'rotate(180deg)' }
                      : {}),
                  }}
                >
                  {label}
                </th>
              );
            })}
            <th className="border px-1 py-1" />
          </tr>
        </thead>
        <tbody>
          {rows.map((r, idx) => (
            <tr key={idx}>
              {fields.map((f, cIdx) => (
                <td key={f} className="border px-1 py-1 align-top">
                  {renderCell(idx, f, cIdx)}
                </td>
              ))}
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
        {(totalAmountFields.length > 0 || totalCurrencyFields.length > 0) && (
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
                  <td key={f} className="border px-1 py-1 font-semibold">
                    {val}
                  </td>
                );
              })}
              <td className="border px-1 py-1 font-semibold text-center">НИЙТ</td>
            </tr>
            <tr>
              {fields.map((f, idx) => (
                <td key={f} className="border px-1 py-1 font-semibold">
                  {idx === 0 ? totals.count : ''}
                </td>
              ))}
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
    </div>
  );
});
