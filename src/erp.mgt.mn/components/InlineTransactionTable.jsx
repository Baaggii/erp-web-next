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
import { valuesEqual } from '../utils/generatedColumns.js';
import {
  assignArrayMetadata,
  extractArrayMetadata,
  createGeneratedColumnPipeline,
} from '../utils/transactionValues.js';

const currencyFmt = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function normalizeNumberInput(value) {
  if (typeof value !== 'string') return value;
  return value.replace(',', '.');
}

function InlineTransactionTable(
  {
    fields = [],
    allFields = null,
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
    configHash: _configHash,
    tableColumns = [],
  },
  ref,
) {
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
    if (!tableName) return {};
    const sources = [generalConfig?.tableRelations, general?.tableRelations, cfg?.tableRelations];
    const lowerTable = String(tableName).toLowerCase();
    for (const src of sources) {
      if (!src || typeof src !== 'object') continue;
      let entry = src[tableName];
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
  }, [generalConfig, general, cfg, tableName, columnCaseMap, columnCaseMapKey]);

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
      if (!map[field]) {
        map[field] = {};
      }
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

  const combinedViewSource = React.useMemo(() => {
    const map = { ...viewSourceMap };
    Object.entries(autoSelectConfigs).forEach(([k, cfg]) => {
      if (!map[k]) map[k] = cfg.table;
    });
    return map;
  }, [viewSourceMap, autoSelectConfigs]);

  function fillSessionDefaults(obj) {
    const base =
      obj && typeof obj === 'object' && !Array.isArray(obj) ? obj : {};
    let row = base;
    let changed = false;
    const ensureRow = () => {
      if (!changed) {
        row = { ...base };
        changed = true;
      }
    };
    const maybeSet = (field, value) => {
      if (!field) return;
      const current = row[field];
      if (current !== undefined && current !== null && current !== '') return;
      ensureRow();
      row[field] = value;
    };
    if (user?.empid !== undefined) {
      userIdSet.forEach((f) => maybeSet(f, user.empid));
    }
    if (branch != null) {
      branchIdSet.forEach((f) => maybeSet(f, branch));
    }
    if (department !== undefined) {
      departmentIdSet.forEach((f) => maybeSet(f, department));
    }
    if (company != null) {
      companyIdSet.forEach((f) => maybeSet(f, company));
    }
    if (dateField.length > 0) {
      const now = formatTimestamp(new Date()).slice(0, 10);
      dateField.forEach((f) => maybeSet(f, now));
    }
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
      const next = initRows.map((r) => fillSessionDefaults(r));
      return assignArrayMetadata(next, initRows);
    }
    const next = Array.from({ length: minRows }, () => fillSessionDefaults(defaultValues));
    return assignArrayMetadata(next, initRows);
  });
  const rowsRef = useRef(rows);
  const contextDefaultsRef = useRef({ branch, company });
  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  const totalAmountSet = new Set(totalAmountFields);
  const totalCurrencySet = new Set(totalCurrencyFields);

  const viewColumnsKey = React.useMemo(
    () => JSON.stringify(viewColumns[tableName] || []),
    [viewColumns, tableName],
  );
  const fieldTypeMapKey = React.useMemo(
    () => JSON.stringify(fieldTypeMap || {}),
    [fieldTypeMap],
  );
  const fieldsKey = React.useMemo(() => fields.join(','), [fields]);
  const allFieldsList = React.useMemo(() => {
    const seen = new Set();
    const merged = [];
    fields.forEach((f) => {
      if (!f || seen.has(f)) return;
      seen.add(f);
      merged.push(f);
    });
    if (Array.isArray(allFields)) {
      allFields.forEach((f) => {
        if (!f || seen.has(f)) return;
        seen.add(f);
        merged.push(f);
      });
    }
    return merged;
  }, [fieldsKey, allFields]);
  const allFieldsKey = React.useMemo(() => allFieldsList.join(','), [allFieldsList]);
  const writableColumns = React.useMemo(() => {
    const set = new Set();
    allFieldsList.forEach((f) => {
      if (!f) return;
      const key = columnCaseMap[f.toLowerCase()] || f;
      if (typeof key === 'string') set.add(key);
    });
    Object.values(columnCaseMap || {}).forEach((name) => {
      if (typeof name === 'string') set.add(name);
    });
    return set;
  }, [allFieldsKey, columnCaseMapKey, columnCaseMap]);

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
  }, [viewColumnsKey, columnCaseMapKey, tableName]);

  const tableColumnsKey = React.useMemo(
    () =>
      JSON.stringify(
        (Array.isArray(tableColumns) ? tableColumns : []).map((c) => [
          c?.name || '',
          c?.generationExpression ?? c?.GENERATION_EXPRESSION ?? null,
        ]),
      ),
    [tableColumns],
  );

  const mainFieldSet = React.useMemo(() => {
    const set = new Set();
    fields.forEach((f) => {
      if (!f) return;
      const mapped = columnCaseMap[String(f).toLowerCase()] || f;
      if (typeof mapped === 'string') set.add(mapped);
    });
    return set;
  }, [fieldsKey, columnCaseMapKey]);

  const metadataFieldSet = React.useMemo(() => {
    const set = new Set();
    allFieldsList.forEach((f) => {
      if (!f) return;
      const mapped = columnCaseMap[String(f).toLowerCase()] || f;
      if (typeof mapped === 'string' && !mainFieldSet.has(mapped)) set.add(mapped);
    });
    return set;
  }, [allFieldsKey, columnCaseMapKey, mainFieldSet]);

  const generatedColumnPipeline = React.useMemo(
    () =>
      createGeneratedColumnPipeline({
        tableColumns,
        columnCaseMap,
        mainFields: mainFieldSet,
        metadataFields: metadataFieldSet,
        equals: valuesEqual,
      }),
    [tableColumnsKey, columnCaseMapKey, mainFieldSet, metadataFieldSet],
  );
  const generatedColumnEvaluators = generatedColumnPipeline.evaluators;
  const hasGeneratedColumnsRef = useRef(false);

  const applyGeneratedColumns = React.useCallback(
    (targetRows, indices = null) =>
      generatedColumnPipeline.apply(targetRows, indices),
    [generatedColumnPipeline],
  );

  const commitRowsUpdate = React.useCallback(
    (updater, { indices = null, notify = true, metadataSource = null } = {}) => {
      setRows((prevRows) => {
        const base = updater(prevRows);
        if (!Array.isArray(base)) return base;
        const nextRows = base === prevRows ? prevRows.slice() : base.slice();
        const source = metadataSource ?? prevRows;
        assignArrayMetadata(nextRows, source);
        const { changed, metadata } = applyGeneratedColumns(nextRows, indices);
        if (metadata) {
          Object.entries(metadata).forEach(([key, value]) => {
            nextRows[key] = value;
          });
        }
        const didChange = Boolean(
          changed ||
            metadata ||
            metadataSource ||
            base !== prevRows,
        );
        if (didChange && notify) onRowsChange(nextRows);
        return didChange ? nextRows : prevRows;
      });
    },
    [applyGeneratedColumns, onRowsChange],
  );

  useEffect(() => {
    const hasGeneratedColumns = Object.keys(generatedColumnEvaluators).length > 0;
    const prevHasGeneratedColumns = hasGeneratedColumnsRef.current;
    hasGeneratedColumnsRef.current = hasGeneratedColumns;
    if (!hasGeneratedColumns || prevHasGeneratedColumns) return;
    const currentRows = rowsRef.current;
    if (!Array.isArray(currentRows) || currentRows.length === 0) return;
    commitRowsUpdate((prev) => prev);
  }, [generatedColumnEvaluators, commitRowsUpdate]);

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
  }, [fieldsKey, columnTypeMap, fieldTypeMapKey]);

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
  }, [fieldsKey, columnTypeMap, fieldTypeMapKey, placeholders, defaultValues, totalAmountSet, totalCurrencySet]);

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
    const metadata = extractArrayMetadata(initRows) || {};
    const currentMetadata = extractArrayMetadata(rows) || {};
    const metadataChanged = JSON.stringify(metadata) !== JSON.stringify(currentMetadata);
    const withMetadata = assignArrayMetadata(normalized, initRows);
    if (metadataChanged || JSON.stringify(withMetadata) !== JSON.stringify(rows)) {
      commitRowsUpdate(() => withMetadata, { notify: false, metadataSource: initRows });
    }
  }, [initRows, minRows, defaultValues, placeholders]);

  useEffect(() => {
    const prev = contextDefaultsRef.current;
    const branchReady = branch != null && prev.branch == null;
    const companyReady = company != null && prev.company == null;
    contextDefaultsRef.current = { branch, company };
    if (!branchReady && !companyReady) return;

    commitRowsUpdate(
      (currentRows) => {
        if (!Array.isArray(currentRows)) return currentRows;
        let changed = false;
        let nextRows = currentRows;
        const ensureClone = () => {
          if (!changed) {
            nextRows = currentRows.slice();
            changed = true;
          }
        };

        currentRows.forEach((row, idx) => {
          const updated = fillSessionDefaults(row);
          if (updated !== row) {
            ensureClone();
            nextRows[idx] = updated;
          }
        });

        Object.keys(currentRows).forEach((key) => {
          if (arrayIndexPattern.test(key)) return;
          const meta = currentRows[key];
          if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return;
          const updated = fillSessionDefaults(meta);
          if (updated !== meta) {
            ensureClone();
            nextRows[key] = updated;
          }
        });

        return changed ? nextRows : currentRows;
      },
      { notify: false },
    );
  }, [branch, company, fillSessionDefaults]);
  const inputRefs = useRef({});
  const focusRow = useRef(0);
  const addBtnRef = useRef(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [invalidCell, setInvalidCell] = useState(null);
  const [previewRow, setPreviewRow] = useState(null);
  const [uploadRow, setUploadRow] = useState(null);
  const alreadyRequestedRef = useRef(new Set());
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
      commitRowsUpdate(
        (current) => {
          if (!Array.isArray(current) || current.length >= minRows) return current;
          const next = current.slice();
          while (next.length < minRows) next.push({});
          return next;
        },
        { notify: false },
      );
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
      commitRowsUpdate(
        () =>
          Array.from({ length: minRows }, () => fillSessionDefaults(defaultValues)),
      ),
    replaceRows: (newRows) =>
      commitRowsUpdate(
        () => {
          const base = Array.isArray(newRows) ? newRows : [];
          return base.map((r) => fillSessionDefaults(r));
        },
        { metadataSource: Array.isArray(newRows) ? newRows : undefined },
      ),
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

  function applyProcedureResult(rowIdx, rowData, baseRows = rowsRef.current) {
    if (!rowData || typeof rowData !== 'object') {
      return {
        rows: Array.isArray(baseRows) ? [...baseRows] : baseRows,
        changedColumns: new Set(),
      };
    }
    const sourceRows = Array.isArray(baseRows) ? baseRows : [];
    const arrayUpdates = new Map();
    const changedColumns = new Set();
    const next = sourceRows.map((row, i) => {
      if (i !== rowIdx) return row;
      const baseRow = row && typeof row === 'object' ? row : {};
      const updated = { ...baseRow };
      const keyLookup = {};
      Object.keys(baseRow).forEach((key) => {
        keyLookup[key.toLowerCase()] = key;
      });
      Object.entries(rowData).forEach(([rawKey, rawValue]) => {
        if (!rawKey && rawKey !== 0) return;
        const mappedKey = columnCaseMap[String(rawKey).toLowerCase()] || rawKey;
        if (typeof mappedKey !== 'string') return;
        const lower = mappedKey.toLowerCase();
        const existingKey = keyLookup[lower];
        const shouldWrite = writableColumns.has(mappedKey) || existingKey;
        if (!shouldWrite) return;
        const targetKey = existingKey || mappedKey;
        const previousValue = existingKey ? updated[existingKey] : undefined;
        if (existingKey) {
          updated[existingKey] = rawValue;
        } else {
          updated[mappedKey] = rawValue;
          keyLookup[lower] = mappedKey;
        }
        arrayUpdates.set(mappedKey, rawValue);
        if (!valuesEqual(previousValue, rawValue)) {
          changedColumns.add(targetKey);
        }
      });
      return updated;
    });
    const withMetadata = assignArrayMetadata(next, sourceRows);
    arrayUpdates.forEach((value, key) => {
      if (!key && key !== 0) return;
      withMetadata[key] = value;
    });
    return { rows: withMetadata, changedColumns };
  }

  async function runProcTrigger(rowIdx, col, rowOverride = null) {
    const showToast = general.procToastEnabled;
    const baseRows = Array.isArray(rowsRef.current) ? rowsRef.current : [];
    let workingRows = assignArrayMetadata(
      baseRows.map((row) => (row && typeof row === 'object' ? { ...row } : row)),
      baseRows,
    );

    if (
      rowOverride &&
      typeof rowIdx === 'number' &&
      rowIdx >= 0 &&
      rowIdx < workingRows.length &&
      workingRows[rowIdx] &&
      typeof workingRows[rowIdx] === 'object'
    ) {
      const originalRow = workingRows[rowIdx];
      const updatedRow = { ...originalRow };
      const keyLookup = {};
      Object.keys(originalRow).forEach((key) => {
        keyLookup[key.toLowerCase()] = key;
      });
      Object.entries(rowOverride).forEach(([rawKey, rawValue]) => {
        if (!rawKey && rawKey !== 0) return;
        const mappedKey = columnCaseMap[String(rawKey).toLowerCase()] || rawKey;
        if (typeof mappedKey !== 'string') return;
        const lower = mappedKey.toLowerCase();
        const existingKey = keyLookup[lower];
        if (existingKey) {
          updatedRow[existingKey] = rawValue;
        } else {
          updatedRow[mappedKey] = rawValue;
          keyLookup[lower] = mappedKey;
        }
      });
      workingRows = workingRows.map((row, idx) => (idx === rowIdx ? updatedRow : row));
      workingRows = assignArrayMetadata(workingRows, baseRows);
    }

    const updates = [];
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

    const getRowValue = (row, key) => {
      if (!row || typeof row !== 'object' || !key) return undefined;
      if (Object.prototype.hasOwnProperty.call(row, key)) return row[key];
      const matchKey = Object.keys(row).find(
        (existing) => existing.toLowerCase() === String(key).toLowerCase(),
      );
      if (matchKey !== undefined) return row[matchKey];
      return undefined;
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
        const hasTarget = targetCols.some((c) => writableColumns.has(c));
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

        const getVal = (name) => {
          const key = normalizeColumn(name) || name;
          const row = workingRows[rowIdx] || {};
          let val = getRowValue(row, key);
          if (val === undefined && key !== name) {
            val = getRowValue(row, name);
          }
          if (val === undefined) {
            const tableMeta = workingRows || {};
            val = getRowValue(tableMeta, key);
            if (val === undefined && key !== name) {
              val = getRowValue(tableMeta, name);
            }
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
            fields.find((f) => f.toLowerCase() === lower) ||
            p
          );
        };

        const missingLabels = [];
        const missingFields = [];
        params.forEach((param, idx) => {
          const value = paramValues[idx];
          const fieldName = getFieldName(param);
          const fieldLower = fieldName ? String(fieldName).toLowerCase() : '';
          const normalizedField =
            fieldLower && fields.find((f) => f.toLowerCase() === fieldLower);
          const paramLower = typeof param === 'string' ? param.toLowerCase() : '';
          const shouldValidate =
            param === '$current' ||
            param === '$branchId' ||
            param === '$companyId' ||
            param === '$employeeId' ||
            param === '$date' ||
            Boolean(normalizedField) ||
            (fieldLower &&
              (requiredFieldSet.has(fieldLower) ||
                branchIdLowerSet.has(fieldLower) ||
                companyIdLowerSet.has(fieldLower) ||
                departmentIdLowerSet.has(fieldLower) ||
                userIdLowerSet.has(fieldLower)));
          const isEmptyValue =
            value === undefined ||
            value === null ||
            (typeof value === 'string' && value.trim() === '');
          if (!shouldValidate || !isEmptyValue) return;
          const optionalValueTokens = [];
          if (value === undefined) optionalValueTokens.push('undefined');
          if (value === null) optionalValueTokens.push('null');
          if (typeof value === 'string') {
            optionalValueTokens.push(value.trim().toLowerCase());
          }
          const isOptional =
            optionalParamSet.has(paramLower) ||
            optionalParamSet.has(fieldLower) ||
            (normalizedField && optionalParamSet.has(normalizedField.toLowerCase())) ||
            optionalPlaceholderSet.has(paramLower) ||
            optionalPlaceholderSet.has(fieldLower) ||
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
          missingLabels.push(
            (labelField && (labels[labelField] || labelField)) || param,
          );
        });

        if (missingLabels.length > 0) {
          const uniqueLabels = [...new Set(missingLabels.filter(Boolean))];
          const message =
            uniqueLabels.length > 0
              ? `Дараах талбаруудыг бөглөнө үү: ${uniqueLabels.join(', ')}`
              : 'Шаардлагатай талбаруудыг бөглөнө үү.';
          setErrorMsg(message);
          const focusFieldName = missingFields.find((name) => {
            if (!name) return false;
            const lower = String(name).toLowerCase();
            return fields.some((f) => f.toLowerCase() === lower);
          });
          if (focusFieldName) {
            const normalized =
              fields.find((f) => f.toLowerCase() === focusFieldName.toLowerCase()) ||
              focusFieldName;
            setInvalidCell({ row: rowIdx, field: normalized });
            const el =
              inputRefs.current[
                `${rowIdx}-${fields.indexOf(normalized)}`
              ];
            if (el) {
              el.focus();
              if (el.select) el.select();
            }
          }
          if (showToast) {
            window.dispatchEvent(
              new CustomEvent('toast', {
                detail: { message, type: 'warning' },
              }),
            );
          }
          continue;
        }

        const aliases = params.map((p) => outMap[p] || null);
        const cacheKey = `${procName}|${JSON.stringify(paramValues)}`;
        let rowData = procCache.current[cacheKey];
        if (!rowData) {
          if (showToast) {
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
            rowData = await callProcedure(procName, paramValues, aliases);
            if (rowData && typeof rowData === 'object') {
              procCache.current[cacheKey] = rowData;
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
            continue;
          }
        }

        if (!rowData || typeof rowData !== 'object') continue;

        const { rows: updatedRows, changedColumns } = applyProcedureResult(
          rowIdx,
          rowData,
          workingRows,
        );
        workingRows = updatedRows;
        if (changedColumns.size > 0) {
          updates.push({ rowIdx, rowData });
          changedColumns.forEach((changedCol) => {
            const normalizedChanged = normalizeColumn(changedCol) || changedCol;
            if (hasTrigger(normalizedChanged)) enqueue(normalizedChanged);
          });
        }
        if (showToast) {
          window.dispatchEvent(
            new CustomEvent('toast', {
              detail: { message: `Returned: ${JSON.stringify(rowData)}`, type: 'info' },
            }),
          );
        }
      }
    }

    if (updates.length > 0) {
      const changedRows = Array.from(new Set(updates.map((u) => u.rowIdx)));
      commitRowsUpdate(
        (currentRows) => {
          let next = currentRows;
          updates.forEach(({ rowIdx: idx, rowData }) => {
            const result = applyProcedureResult(idx, rowData, next);
            next = result.rows;
          });
          return next;
        },
        { indices: changedRows },
      );
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
    const view = viewSourceMap[col];
    if (view && !alreadyRequestedRef.current.has(view)) {
      alreadyRequestedRef.current.add(view);
      loadView(view);
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
    const newIndex = rows.length;
    focusRow.current = newIndex;
    commitRowsUpdate(
      (r) => {
        const row = fillSessionDefaults(defaultValues);
        return [...r, row];
      },
      { indices: [newIndex] },
    );
  }

  function removeRow(idx) {
    commitRowsUpdate((r) => r.filter((_, i) => i !== idx));
  }

  function openUpload(idx) {
    setUploadRow(idx);
  }

  function handleUploaded(idx, name) {
    commitRowsUpdate(
      (r) =>
        r.map((row, i) => (i === idx ? { ...row, _imageName: name } : row)),
      { indices: [idx] },
    );
  }

  function applyAISuggestion(idx, item) {
    if (!item) return;
    const codeField = fields.find((f) => /code|name|item/i.test(f));
    const qtyField = fields.find((f) => /(qty|quantity|count)/i.test(f));
    commitRowsUpdate(
      (r) =>
        r.map((row, i) => {
          if (i !== idx) return row;
          const updated = { ...row };
          if (codeField && item.code !== undefined) updated[codeField] = item.code;
          if (qtyField && item.qty !== undefined) updated[qtyField] = item.qty;
          return updated;
        }),
      { indices: [idx] },
    );
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
    commitRowsUpdate(
      (r) =>
        r.map((row, i) => {
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
        }),
      { indices: [rowIdx] },
    );
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
          commitRowsUpdate(
            (r) =>
              r.map((row, i) => {
                if (i !== rowIdx) return row;
                const updated = { ...row };
                Object.entries(rowData).forEach(([k, v]) => {
                  const key = columnCaseMap[k.toLowerCase()];
                  if (key) updated[key] = v;
                });
                return updated;
              }),
            { indices: [rowIdx] },
          );
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
      commitRowsUpdate(
        (r) => r.map((row, i) => (i === idx ? updated : row)),
        { indices: [idx] },
      );
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
    const isLookupField =
      !!relationConfigMap[field] ||
      !!viewSourceMap[field] ||
      !!autoSelectConfigs[field];
    if (isLookupField && e.lookupMatched === false) {
      const label = labels[field] || field;
      const message = `${label} талбарт тохирох утга олдсонгүй.`;
      setErrorMsg(message);
      setInvalidCell({ row: rowIdx, field });
      e.target.focus();
      if (e.target.select) e.target.select();
      return;
    }
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
}

const FwdInlineTransactionTable = forwardRef(InlineTransactionTable);

function areEqual(prev, next) {
  return prev.tableName === next.tableName && prev.configHash === next.configHash;
}

export default React.memo(FwdInlineTransactionTable, areEqual);
