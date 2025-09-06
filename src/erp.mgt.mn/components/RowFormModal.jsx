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
  procTriggers = {},
  autoFillSession = true,
}) {
  const mounted = useRef(false);
  const renderCount = useRef(0);
  const warned = useRef(false);
  const procCache = useRef({});
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
  const userIdSet = new Set(userIdFields);
  const branchIdSet = new Set(branchIdFields);
  const departmentIdSet = new Set(departmentIdFields);
  const companyIdSet = new Set(companyIdFields);
  const disabledSet = React.useMemo(
    () => new Set(disabledFields.map((f) => f.toLowerCase())),
    [disabledFields],
  );
  const { user, company, branch, department, userSettings } = useContext(AuthContext);
  const [formVals, setFormVals] = useState(() => {
    const init = {};
    const now = new Date();
    columns.forEach((c) => {
      const lower = c.toLowerCase();
      const typ = fieldTypeMap[c];
      let placeholder = '';
      if (typ === 'time' || (!typ && lower.includes('time') && !lower.includes('date'))) {
        placeholder = 'HH:MM:SS';
      } else if (
        typ === 'date' ||
        typ === 'datetime' ||
        (!typ && (lower.includes('timestamp') || lower.includes('date')))
      ) {
        placeholder = 'YYYY-MM-DD';
      }
      const raw = row ? String(row[c] ?? '') : String(defaultValues[c] ?? '');
      let val = normalizeDateInput(raw, placeholder);
      const missing = !row || row[c] === undefined || row[c] === '';
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
      if (!columns.includes(k)) {
        const lower = k.toLowerCase();
        const typ = fieldTypeMap[k];
        let placeholder = '';
        if (typ === 'time' || (!typ && lower.includes('time') && !lower.includes('date'))) {
          placeholder = 'HH:MM:SS';
        } else if (
          typ === 'date' ||
          typ === 'datetime' ||
          (!typ && (lower.includes('timestamp') || lower.includes('date')))
        ) {
          placeholder = 'YYYY-MM-DD';
        }
        extras[k] = normalizeDateInput(String(v ?? ''), placeholder);
      }
    });
    return extras;
  });
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
      const lower = c.toLowerCase();
      const typ = fieldTypeMap[c];
      if (typ === 'time') {
        map[c] = 'HH:MM:SS';
      } else if (typ === 'date' || typ === 'datetime') {
        map[c] = 'YYYY-MM-DD';
      } else if (!typ || typ === 'string') {
        if (lower.includes('time') && !lower.includes('date')) {
          map[c] = 'HH:MM:SS';
        } else if (lower.includes('timestamp') || lower.includes('date')) {
          map[c] = 'YYYY-MM-DD';
        }
      }
    });
    return map;
  }, [columns, row, defaultValues, fieldTypeMap]);

  useEffect(() => {
    const extras = {};
    Object.entries(row || {}).forEach(([k, v]) => {
      if (!columns.includes(k)) {
        extras[k] = normalizeDateInput(String(v ?? ''), placeholders[k]);
      }
    });
    setExtraVals(extras);
  }, [row, columns, placeholders]);

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
      const raw = row ? String(row[c] ?? '') : String(defaultValues[c] ?? '');
      let v = normalizeDateInput(raw, placeholders[c]);
      const missing = !row || row[c] === undefined || row[c] === '';
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
    // Avoid triggering a state update if the values haven't actually changed.
    const same = Object.keys(vals).every((k) => formVals[k] === vals[k]);
    if (!same) setFormVals(vals);
    inputRefs.current = {};
    setErrors({});
  }, [row, visible, user, company, branch, department]);

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
      const override = { ...formVals, [col]: newVal };
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
        if (general.procToastEnabled) {
          window.dispatchEvent(
            new CustomEvent('toast', {
              detail: { message: `Returned: ${JSON.stringify(row)}`, type: 'info' },
            }),
          );
        }
        continue;
      }
      if (general.procToastEnabled) {
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
        if (general.procToastEnabled) {
          window.dispatchEvent(
            new CustomEvent('toast', {
              detail: { message: `Returned: ${JSON.stringify(row)}`, type: 'info' },
            }),
          );
        }
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
    }
    }
  }

  async function openRelationPreview(col) {
    let val = formVals[col];
    if (val && typeof val === 'object') val = val.value;
    const conf = relationConfigs[col];
    const viewTbl = viewSource[col];
    const table = conf ? conf.table : viewTbl;
    const idField = conf ? conf.idField || conf.column : viewDisplays[viewTbl]?.idField || col;
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

    if (disabled) {
      const raw = isColumn ? formVals[c] : extraVals[c];
      const val = typeof raw === 'object' && raw !== null ? raw.value : raw;
      let display = typeof raw === 'object' && raw !== null ? raw.label || val : val;
      if (
        relationConfigs[c] &&
        val !== undefined &&
        relationData[c]?.[val]
      ) {
        const row = relationData[c][val];
        const parts = [val];
        (relationConfigs[c].displayFields || []).forEach((df) => {
          if (row[df] !== undefined) parts.push(row[df]);
        });
        display = parts.join(' - ');
      } else if (
        viewSource[c] &&
        val !== undefined &&
        relationData[c]?.[val]
      ) {
        const row = relationData[c][val];
        const cfg = viewDisplays[viewSource[c]] || {};
        const parts = [val];
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

    const control = relationConfigs[c] ? (
      <AsyncSearchSelect
        title={tip}
        table={relationConfigs[c].table}
        searchColumn={relationConfigs[c].idField || relationConfigs[c].column}
        searchColumns={[
          relationConfigs[c].idField || relationConfigs[c].column,
          ...(relationConfigs[c].displayFields || []),
        ]}
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
          e.target.style.width = 'auto';
          const w = Math.min(e.target.scrollWidth + 2, boxMaxWidth);
          e.target.style.width = `${Math.max(boxWidth, w)}px`;
        }}
        inputRef={(el) => (inputRefs.current[c] = el)}
        inputStyle={inputStyle}
        companyId={company}
      />
    ) : viewSource[c] && !Array.isArray(relations[c]) ? (
      <AsyncSearchSelect
        title={tip}
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
          e.target.style.width = 'auto';
          const w = Math.min(e.target.scrollWidth + 2, boxMaxWidth);
          e.target.style.width = `${Math.max(boxWidth, w)}px`;
        }}
        inputRef={(el) => (inputRefs.current[c] = el)}
        inputStyle={inputStyle}
        companyId={company}
      />
    ) : Array.isArray(relations[c]) ? (
      <select
        title={tip}
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
      return (
        <div className="mb-4">
          <h3 className="mt-0 mb-1 font-semibold">Main</h3>
          <InlineTransactionTable
            ref={useGrid ? tableRef : undefined}
            fields={cols}
            relations={relations}
            relationConfigs={relationConfigs}
            relationData={relationData}
            fieldTypeMap={fieldTypeMap}
            labels={labels}
            totalAmountFields={totalAmountFields}
            totalCurrencyFields={totalCurrencyFields}
            viewSource={viewSource}
            viewDisplays={viewDisplays}
              viewColumns={viewColumns}
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
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1 bg-gray-200 rounded"
          >
            {t('cancel', 'Cancel')}
          </button>
          <button
            type="submit"
            className="px-3 py-1 bg-blue-600 text-white rounded"
          >
            {t('post', 'Post')}
          </button>
        </div>
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
      />
    </>
  );
}

export default memo(RowFormModal);
