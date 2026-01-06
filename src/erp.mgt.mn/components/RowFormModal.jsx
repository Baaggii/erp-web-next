import React, { useState, useEffect, useRef, useContext, memo, useCallback } from 'react';
import AsyncSearchSelect from './AsyncSearchSelect.jsx';
import Modal from './Modal.jsx';
import InlineTransactionTable from './InlineTransactionTable.jsx';
import RowDetailModal from './RowDetailModal.jsx';
import TooltipWrapper from './TooltipWrapper.jsx';
import TagMultiInput from './TagMultiInput.jsx';
import { useTranslation } from 'react-i18next';
import { AuthContext } from '../context/AuthContext.jsx';
import formatTimestamp from '../utils/formatTimestamp.js';
import normalizeDateInput from '../utils/normalizeDateInput.js';
import callProcedure from '../utils/callProcedure.js';
import {
  applyGeneratedColumnEvaluators,
  createGeneratedColumnEvaluator,
  extractGenerationDependencies,
} from '../utils/generatedColumns.js';
import selectDisplayFieldsForRelation from '../utils/selectDisplayFieldsForRelation.js';
import extractCombinationFilterValue from '../utils/extractCombinationFilterValue.js';
import useGeneralConfig from '../hooks/useGeneralConfig.js';
import { API_BASE } from '../utils/apiBase.js';
import {
  formatJsonItem,
  formatJsonList,
  normalizeInputValue,
} from '../utils/jsonValueFormatting.js';

const DEFAULT_RECEIPT_TYPES = ['B2C', 'B2B_SALE', 'B2B_PURCHASE', 'STOCK_QR'];

function normalizeRelationOptionKey(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === 'object') {
    if (Object.prototype.hasOwnProperty.call(value, 'value')) {
      return normalizeRelationOptionKey(value.value);
    }
    if (Object.prototype.hasOwnProperty.call(value, 'id')) {
      return normalizeRelationOptionKey(value.id);
    }
    try {
      return JSON.stringify(value);
    } catch (err) {
      console.warn('Failed to normalize relation option value', err);
      return null;
    }
  }
  return String(value);
}

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
  disabledFieldReasons = {},
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
  numericScaleMap = {},
  viewSource = {},
  viewDisplays = {},
  viewColumns = {},
  loadView = () => {},
  procTriggers = {},
  autoFillSession = true,
  tableColumns = [],
  onSaveTemporary = null,
  allowTemporarySave = false,
  temporarySaveLabel = null,
  readOnly = false,
  isAdding = false,
  isEditingTemporaryDraft = false,
  canPost = true,
  workflowHint = {},
  forceEditable = false,
  posApiEnabled = false,
  posApiTypeField = '',
  posApiEndpointMeta = null,
  posApiInfoEndpointMeta = [],
  posApiInfoEndpointConfig = {},
  posApiReceiptTypes = [],
  posApiPaymentMethods = [],
  extraFooterContent = null,
  allowTemporaryOnly = false,
}) {
  const mounted = useRef(false);
  const renderCount = useRef(0);
  const warned = useRef(false);
  const procCache = useRef({});
  const submitIntentRef = useRef(null);
  const [tableDisplayFields, setTableDisplayFields] = useState([]);
  useEffect(() => {
    fetch('/api/display_fields', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : {}))
      .then((data) => {
        if (Array.isArray(data?.entries)) {
          setTableDisplayFields(data.entries);
        } else if (Array.isArray(data)) {
          setTableDisplayFields(data);
        } else {
          setTableDisplayFields([]);
        }
      })
      .catch(() => {});
  }, []);
  const generalConfig = useGeneralConfig();
  const cfg = generalConfig[scope] || {};
  const general = generalConfig.general || {};
  const { t } = useTranslation(['translation', 'tooltip']);
  const formatReceiptTypeLabel = React.useCallback(
    (type) => {
      if (!type) return '';
      const fallback = type
        .toLowerCase()
        .split('_')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
      return t(`posapi_type_${type.toLowerCase()}`, fallback);
    },
    [t],
  );
  const normalizedReceiptTypes = React.useMemo(() => {
    const configured = Array.isArray(posApiReceiptTypes)
      ? posApiReceiptTypes
          .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
          .filter((entry) => entry)
      : [];
    const merged = [...configured];
    DEFAULT_RECEIPT_TYPES.forEach((type) => {
      if (!merged.includes(type)) merged.push(type);
    });
    return merged.length ? merged : DEFAULT_RECEIPT_TYPES;
  }, [posApiReceiptTypes]);
  const posApiTypeOptions = React.useMemo(
    () => [
      {
        value: '',
        label: t('posapi_type_auto', 'Auto (determine automatically)'),
      },
      ...normalizedReceiptTypes.map((type) => ({
        value: type,
        label: formatReceiptTypeLabel(type),
      })),
    ],
    [normalizedReceiptTypes, formatReceiptTypeLabel, t],
  );
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

  const workflowState = workflowHint || {};
  const isRejectedWorkflow = Boolean(workflowState.isRejected);
  const isTemporaryWorkflow = Boolean(workflowState.isTemporary);

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
  const disabledSet = React.useMemo(() => {
    if (readOnly) {
      const all = new Set();
      [columns, headerFields, mainFields, footerFields].forEach((list) => {
        (list || []).forEach((field) => {
          if (!field) return;
          all.add(String(field).toLowerCase());
        });
      });
      return all;
    }
    if (forceEditable) return new Set();
    return new Set(disabledFields.map((f) => f.toLowerCase()));
  }, [columns, disabledFields, forceEditable, footerFields, headerFields, mainFields, readOnly]);
  const disabledReasonLookup = React.useMemo(() => {
    const map = {};
    Object.entries(disabledFieldReasons || {}).forEach(([key, value]) => {
      if (!key) return;
      const lower = String(key).toLowerCase();
      const list = Array.isArray(value) ? value : [value];
      const unique = map[lower] ? new Set(map[lower]) : new Set();
      list.forEach((entry) => {
        if (!entry && entry !== 0) return;
        unique.add(String(entry));
      });
      map[lower] = Array.from(unique);
    });
    return map;
  }, [disabledFieldReasons]);
  const guardToastEnabled = !forceEditable && !readOnly && !!general.posGuardToastEnabled;
  const isReadOnly = Boolean(readOnly);
  const lastGuardToastRef = useRef({ field: null, ts: 0 });
  const describeGuardReasons = React.useCallback(
    (codes = []) => {
      if (!Array.isArray(codes) || codes.length === 0) return [];
      const seen = new Set();
      const messages = [];
      codes.forEach((code) => {
        if (!code && code !== 0) return;
        const normalized = String(code);
        if (seen.has(normalized)) return;
        seen.add(normalized);
        switch (normalized) {
          case 'missingEditableConfig':
            messages.push(
              t(
                'pos_guard_reason_missing_editable',
                'Field is not configured as editable in the POS layout',
              ),
            );
            break;
          case 'posLock':
            messages.push(
              t(
                'pos_guard_reason_pos_lock',
                'Field is locked and cannot be edited',
              ),
            );
            break;
          case 'calcField':
            messages.push(
              t(
                'pos_guard_reason_calc_field',
                'Value is derived from a calc field mapping',
              ),
            );
            break;
          case 'posFormula':
            messages.push(
              t(
                'pos_guard_reason_pos_formula',
                'Value is calculated by a POS formula',
              ),
            );
            break;
          case 'computed':
            messages.push(
              t('pos_guard_reason_computed', 'Value is automatically computed'),
            );
            break;
          default:
            messages.push(normalized);
        }
      });
      return messages;
    },
    [t],
  );
  const { user, company, branch, department, userSettings } = useContext(AuthContext);
  const columnCaseMapKey = React.useMemo(
    () => JSON.stringify(columnCaseMap || {}),
    [columnCaseMap],
  );
  const numericScaleMapKey = React.useMemo(
    () => JSON.stringify(numericScaleMap || {}),
    [numericScaleMap],
  );
  const viewSourceKey = React.useMemo(() => JSON.stringify(viewSource || {}), [viewSource]);
  const relationConfigsKey = React.useMemo(
    () => JSON.stringify(relationConfigs || {}),
    [relationConfigs],
  );
  const tableDisplayFieldsKey = React.useMemo(
    () => JSON.stringify(tableDisplayFields || []),
    [tableDisplayFields],
  );

  const numericScaleLookup = React.useMemo(() => {
    const map = {};
    Object.entries(numericScaleMap || {}).forEach(([key, value]) => {
      if (key == null) return;
      const lower = String(key).toLowerCase();
      const scale = Number(value);
      if (!Number.isNaN(scale)) {
        map[lower] = scale;
      }
    });
    return map;
  }, [numericScaleMapKey]);

  const getNumericScale = React.useCallback(
    (col) => {
      if (!col) return null;
      const lower = String(col).toLowerCase();
      return numericScaleLookup[lower] ?? null;
    },
    [numericScaleLookup],
  );

  const formatNumericValue = React.useCallback(
    (col, value) => {
      if (value === null || value === undefined || value === '') return value === 0 ? '0' : '';
      if (typeof value === 'object') {
        if ('value' in value) return formatNumericValue(col, value.value);
        return value;
      }
      const scale = getNumericScale(col);
      if (scale === null) return String(value);
      const num =
        typeof value === 'number' ? value : Number(normalizeNumberInput(String(value)));
      if (!Number.isFinite(num)) return String(value);
      return num.toFixed(scale);
    },
    [getNumericScale],
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

  const relationsKey = React.useMemo(() => JSON.stringify(relations || {}), [relations]);
  const relationOptionLabelLookup = React.useMemo(() => {
    const lookup = {};
    Object.entries(relations || {}).forEach(([rawKey, options]) => {
      if (!Array.isArray(options) || options.length === 0) return;
      const canonicalKey = columnCaseMap[String(rawKey).toLowerCase()] || rawKey;
      if (!canonicalKey) return;
      const optionLabels = {};
      options.forEach((opt) => {
        if (!opt || typeof opt !== 'object') return;
        const candidateValue =
          opt.value !== undefined
            ? opt.value
            : opt.id !== undefined
            ? opt.id
            : opt.key !== undefined
            ? opt.key
            : undefined;
        const normalizedValue = normalizeRelationOptionKey(candidateValue);
        if (!normalizedValue) return;
        const label =
          typeof opt.label === 'string'
            ? opt.label
            : typeof opt.display === 'string'
            ? opt.display
            : typeof opt.name === 'string'
            ? opt.name
            : typeof opt.text === 'string'
            ? opt.text
            : undefined;
        if (label === undefined) return;
        optionLabels[normalizedValue] = label;
      });
      if (Object.keys(optionLabels).length === 0) return;
      lookup[canonicalKey] = optionLabels;
      lookup[canonicalKey.toLowerCase()] = optionLabels;
    });
    return lookup;
  }, [relationsKey, columnCaseMapKey]);

  const tableRelationsConfig = React.useMemo(() => {
    if (!table) return {};
    const sources = [generalConfig?.tableRelations, general?.tableRelations, cfg?.tableRelations];
    const lowerTable = String(table).toLowerCase();
    const aggregate = {};
    const addEntry = (column, value) => {
      if (!column) return;
      const mapped = columnCaseMap[String(column).toLowerCase()] || column;
      if (!mapped) return;
      const existing = aggregate[mapped] || [];
      const normalizedList = Array.isArray(value) ? value : [value];
      normalizedList.forEach((rel) => {
        if (rel && typeof rel === 'object' && Object.keys(rel).length > 0) {
          existing.push(rel);
        }
      });
      if (existing.length > 0) aggregate[mapped] = existing;
    };

    sources.forEach((src) => {
      if (!src || typeof src !== 'object') return;
      let entry = src[table];
      if (!entry) {
        const match = Object.keys(src).find(
          (key) => typeof key === 'string' && key.toLowerCase() === lowerTable,
        );
        if (match) entry = src[match];
      }
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return;
      Object.keys(entry).forEach((col) => addEntry(col, entry[col]));
    });
    return aggregate;
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

  // Only columns present in relatedColumns are evaluated, preventing cross-table false positives.
  const autoSelectConfigs = React.useMemo(() => {
    const map = {};
    const addCandidate = (column, source) => {
      if (!source || typeof source !== 'object') return;
      const list = Array.isArray(source) ? source : [source];
      list.forEach((rel) => {
        if (!rel || typeof rel !== 'object') return;
        const candidate = { ...rel };
        if (!candidate.table && typeof rel.table === 'string') {
          candidate.table = rel.table;
        }
        const srcId = rel.idField || rel.column;
        if (!candidate.idField && typeof srcId === 'string') {
          candidate.idField = srcId;
        }
        const srcDisplay = Array.isArray(rel.displayFields)
          ? rel.displayFields.filter((f) => typeof f === 'string')
          : [];
        if ((!candidate.displayFields || candidate.displayFields.length === 0) && srcDisplay.length > 0) {
          candidate.displayFields = srcDisplay;
        }
        if (
          !candidate.combinationSourceColumn &&
          typeof rel.combinationSourceColumn === 'string' &&
          rel.combinationSourceColumn.trim()
        ) {
          candidate.combinationSourceColumn = rel.combinationSourceColumn;
        }
        if (
          !candidate.combinationTargetColumn &&
          typeof rel.combinationTargetColumn === 'string' &&
          rel.combinationTargetColumn.trim()
        ) {
          candidate.combinationTargetColumn = rel.combinationTargetColumn;
        }
        if (!candidate.filterColumn && typeof rel.filterColumn === 'string' && rel.filterColumn.trim()) {
          candidate.filterColumn = rel.filterColumn;
        }
        if (candidate.filterValue === undefined || candidate.filterValue === null || candidate.filterValue === '') {
          const rawFilterValue = rel.filterValue ?? rel.filter_value;
          if (rawFilterValue !== undefined && rawFilterValue !== null) {
            const normalized = String(rawFilterValue).trim();
            if (normalized) {
              candidate.filterValue = normalized;
            }
          }
        }
        if (
          candidate.table &&
          (!candidate.displayFields || candidate.displayFields.length === 0 || !candidate.idField)
        ) {
          const matchedDisplay = selectDisplayFieldsForRelation(
            tableDisplayFields,
            candidate.table,
            candidate,
          );
          if (matchedDisplay) {
            if (!candidate.idField && matchedDisplay.idField) {
              candidate.idField = matchedDisplay.idField;
            }
            if (!candidate.displayFields || candidate.displayFields.length === 0) {
              candidate.displayFields = matchedDisplay.displayFields || [];
            }
          }
        }
        if (!candidate.table || !candidate.idField) return;
        if (!map[column]) map[column] = [];
        map[column].push(candidate);
      });
    };

    Array.from(relatedColumns || []).forEach((column) => {
      addCandidate(column, relationConfigMap[column]);
      addCandidate(column, tableRelationsConfig[column]);
    });

    return map;
  }, [
    relatedColumns,
    relationConfigMapKey,
    tableRelationsKey,
    tableDisplayFieldsKey,
    tableDisplayFields,
  ]);
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
  const effectiveRow = React.useMemo(() => {
    if (row && Object.keys(row || {}).length > 0) return row;
    if (useGrid && Array.isArray(rows) && rows.length > 0) return rows[0];
    return row;
  }, [row, rows, useGrid]);
  const fieldTypeMapKey = React.useMemo(
    () => JSON.stringify(fieldTypeMap || {}),
    [fieldTypeMap],
  );
  const columnsKey = React.useMemo(() => columns.join(','), [columns]);
  const columnLowerSet = React.useMemo(
    () => new Set(columns.map((col) => String(col).toLowerCase())),
    [columnsKey],
  );
  const columnByLowerMap = React.useMemo(() => {
    const map = {};
    columns.forEach((col) => {
      if (col === undefined || col === null) return;
      const lower = String(col).toLowerCase();
      if (!map[lower]) {
        map[lower] = col;
      }
    });
    return map;
  }, [columns]);
  const isHeaderLocation = React.useCallback((value) => {
    if (typeof value !== 'string') return false;
    const normalized = value.trim().toLowerCase();
    return normalized === 'header' || normalized === 'headers';
  }, []);
  const isHeaderParameter = React.useCallback(
    (param) => {
      if (!param || typeof param !== 'object') return false;
      const locationCandidates = [
        param.in,
        param.location,
        param.loc,
        param.scope,
        param.place,
        param.target,
        param.position,
        param.type,
        param.paramType,
      ];
      if (locationCandidates.some((candidate) => isHeaderLocation(candidate))) return true;
      const name =
        (typeof param.name === 'string' && param.name) ||
        (typeof param.field === 'string' && param.field) ||
        '';
      if (!name) return false;
      const lower = name.toLowerCase();
      return lower === 'accept' || lower === 'authorization' || lower === 'content-type';
    },
    [isHeaderLocation],
  );
  const rowKey = React.useMemo(() => JSON.stringify(effectiveRow || {}), [effectiveRow]);
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
      const evaluator = createGeneratedColumnEvaluator(expr, columnCaseMap, { columnName: key });
      if (evaluator) map[key] = evaluator;
    });
    return map;
  }, [tableColumns, columnCaseMap, columnCaseMapKey]);
  const generatedColumnSet = React.useMemo(() => {
    const set = new Set();
    if (!Array.isArray(tableColumns)) return set;
    tableColumns.forEach((col) => {
      if (!col || typeof col !== 'object') return;
      const key = columnCaseMap[String(col.name || '').toLowerCase()] || col.name;
      if (!key) return;
      const extra = String(col.extra || col.EXTRA || '').toLowerCase();
      const expr =
        col.generationExpression ?? col.GENERATION_EXPRESSION ?? col.generation_expression;
      if (expr || extra.includes('generated')) {
        set.add(key);
      }
    });
    return set;
  }, [tableColumns, columnCaseMap]);
  const generatedDependencyLookup = React.useMemo(() => {
    const map = {};
    if (!Array.isArray(tableColumns)) return map;
    tableColumns.forEach((col) => {
      if (!col || typeof col !== 'object') return;
      const expr =
        col.generationExpression ??
        col.GENERATION_EXPRESSION ??
        col.generation_expression ??
        null;
      if (!expr) return;
      const target = columnCaseMap[String(col.name || '').toLowerCase()] || col.name;
      if (!target) return;
      const deps = extractGenerationDependencies(expr);
      deps.forEach((dep) => {
        const source = columnCaseMap[dep] || dep;
        if (!source) return;
        const lower = String(source).toLowerCase();
        if (!map[lower]) map[lower] = new Set();
        map[lower].add(target);
      });
    });
    return map;
  }, [tableColumns, columnCaseMap]);
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
      const rowValue = effectiveRow ? getRowValueCaseInsensitive(effectiveRow, c) : undefined;
      const sourceValue =
        rowValue !== undefined ? rowValue : defaultValues[c];
      const missing =
        !effectiveRow || rowValue === undefined || rowValue === '';
      let val;
      if (typ === 'json') {
        val = normalizeJsonArrayForState(sourceValue);
      } else if (placeholder) {
        val = normalizeDateInput(String(sourceValue ?? ''), placeholder);
      } else if (typ === 'number') {
        val = formatNumericValue(c, sourceValue);
      } else if (sourceValue === null || sourceValue === undefined) {
        val = '';
      } else {
        val = String(sourceValue);
      }
      if (missing && (!val || val === '') && dateField.includes(c)) {
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
      if (typ === 'json') {
        val = normalizeJsonArrayForState(val);
      } else if (typ === 'number') {
        val = formatNumericValue(c, val);
      } else if (placeholder) {
        val = normalizeDateInput(String(val ?? ''), placeholder);
      } else if (val === null || val === undefined) {
        val = '';
      } else {
        val = String(val);
      }
      init[c] = val;
    });
    return init;
  });
  const [extraVals, setExtraVals] = useState(() => {
    const extras = {};
    Object.entries(effectiveRow || {}).forEach(([k, v]) => {
      const lowerKey = String(k).toLowerCase();
      if (!columnLowerSet.has(lowerKey)) {
        const typ = fieldTypeMap[k];
        let placeholder = '';
        if (typ === 'time') {
          placeholder = 'HH:MM:SS';
        } else if (typ === 'date' || typ === 'datetime') {
          placeholder = 'YYYY-MM-DD';
        }
        if (typ === 'json') {
          extras[k] = normalizeJsonArrayForState(v);
        } else {
          extras[k] = normalizeDateInput(String(v ?? ''), placeholder);
        }
      }
    });
    return extras;
  });

  const resolveCombinationFilters = useCallback(
    (column, overrideConfig = null) => {
      if (!column) return null;
      const autoCandidates = autoSelectConfigs[column];
      const autoDefault = Array.isArray(autoCandidates) ? autoCandidates[0] : autoCandidates;
      const config =
        overrideConfig || relationConfigMap[column] || autoDefault;
      const sourceField = config?.combinationSourceColumn;
      const targetField = config?.combinationTargetColumn;
      if (!sourceField || !targetField) return null;
      const mappedSource =
        columnCaseMap[String(sourceField).toLowerCase()] || sourceField;
      const rawValue = formVals[mappedSource];
      const value = extractCombinationFilterValue(rawValue);
      if (value === undefined || value === null || value === '') return null;
      return { [targetField]: value };
    },
    [autoSelectConfigs, columnCaseMap, formVals, relationConfigMap],
  );

  const isCombinationFilterReady = (hasCombination, targetColumn, filters) => {
    if (!hasCombination) return true;
    if (!targetColumn || !filters) return false;
    const value = filters[targetColumn];
    return !(value === undefined || value === null || value === '');
  };

  const getAutoSelectConfig = useCallback(
    (column) => {
      const entries = autoSelectConfigs[column];
      if (!Array.isArray(entries) || entries.length === 0) return null;
      let best = null;
      let bestScore = -Infinity;
      entries.forEach((entry) => {
        if (!entry || typeof entry !== 'object') return;
        const filters = resolveCombinationFilters(column, entry);
        const hasCombination = Boolean(
          entry?.combinationSourceColumn && entry?.combinationTargetColumn,
        );
        const combinationReady = isCombinationFilterReady(
          hasCombination,
          entry?.combinationTargetColumn,
          filters,
        );
        const score =
          (hasCombination ? (combinationReady ? 3 : -1) : 0) +
          (entry.filterColumn ? 1 : 0) +
          (entry.filterValue ? 1 : 0) +
          (combinationReady ? 1 : 0);
        if (best === null || score > bestScore) {
          best = { config: entry, filters, combinationReady };
          bestScore = score;
        }
      });
      if (best) return best;
      const fallback = entries[0];
      return {
        config: fallback,
        filters: resolveCombinationFilters(column, fallback),
        combinationReady: true,
      };
    },
    [autoSelectConfigs, resolveCombinationFilters],
  );

  const filterRelationOptions = useCallback(
    (column, options) => {
      if (!Array.isArray(options) || options.length === 0) return options;
      const resolved = getAutoSelectConfig(column);
      const config = relationConfigMap[column] || resolved?.config;
      const hasCombination = Boolean(
        config?.combinationSourceColumn && config?.combinationTargetColumn,
      );
      const filters = resolved?.filters || resolveCombinationFilters(column, config);
      if (!filters) return hasCombination ? [] : options;
      const targetColumn = config?.combinationTargetColumn;
      if (!targetColumn) return hasCombination ? [] : options;
      const filterValue = filters[targetColumn];
      if (filterValue === undefined || filterValue === null || filterValue === '') {
        return hasCombination ? [] : options;
      }
      const columnRows = relationData[column];
      if (!columnRows || typeof columnRows !== 'object') return options;
      const normalizedFilter = String(filterValue);
      return options.filter((opt) => {
        if (!opt) return false;
        const rawValue =
          typeof opt.value === 'object' && opt.value !== null ? opt.value.value : opt.value;
        const row = columnRows[rawValue];
        if (!row || typeof row !== 'object') return false;
        const targetValue = getRowValueCaseInsensitive(row, targetColumn);
        if (targetValue === undefined || targetValue === null || targetValue === '') {
          return false;
        }
        return String(targetValue) === normalizedFilter;
      });
    },
    [getAutoSelectConfig, getRowValueCaseInsensitive, relationConfigMap, relationData, resolveCombinationFilters],
  );
  const extraKeys = React.useMemo(() => Object.keys(extraVals || {}), [extraVals]);
  const extraKeyLookup = React.useMemo(() => {
    const map = {};
    extraKeys.forEach((key) => {
      if (key === undefined || key === null) return;
      const lower = String(key).toLowerCase();
      if (!map[lower]) map[lower] = key;
    });
    return map;
  }, [extraKeys]);
  const getFieldDefaultFromRecord = useCallback(
    (fieldName) => {
      if (!fieldName) return '';
      const lower = String(fieldName).toLowerCase();
      if (columnByLowerMap[lower] !== undefined) {
        const columnKey = columnByLowerMap[lower];
        const value = formVals?.[columnKey];
        if (value !== undefined && value !== null && value !== '') {
          return value;
        }
      }
      if (extraKeyLookup[lower] !== undefined) {
        const extraKey = extraKeyLookup[lower];
        const value = extraVals?.[extraKey];
        if (value !== undefined && value !== null && value !== '') {
          return value;
        }
      }
      return '';
    },
    [columnByLowerMap, extraKeyLookup, formVals, extraVals],
  );
  const infoEndpoints = React.useMemo(() => {
    if (!Array.isArray(posApiInfoEndpointMeta)) return [];
    const overrideMap =
      posApiInfoEndpointConfig && typeof posApiInfoEndpointConfig === 'object'
        ? posApiInfoEndpointConfig
        : {};
    return posApiInfoEndpointMeta
      .filter((entry) => entry && typeof entry === 'object' && typeof entry.id === 'string')
      .map((entry) => {
        const override = overrideMap[entry.id] || {};
        const displayLabel =
          typeof override.label === 'string' && override.label
            ? override.label
            : entry.name || entry.id;
        const quickActionLabel =
          typeof override.quickActionLabel === 'string' && override.quickActionLabel
            ? override.quickActionLabel
            : '';
        const autoInvoke =
          override.autoInvoke === undefined
            ? Boolean(quickActionLabel)
            : Boolean(override.autoInvoke);
        const payloadDefaults = {};
        if (override.payloadDefaults && typeof override.payloadDefaults === 'object') {
          Object.entries(override.payloadDefaults).forEach(([key, val]) => {
            if (typeof key !== 'string') return;
            if (val === undefined || val === null) return;
            payloadDefaults[key] = typeof val === 'string' ? val : String(val);
          });
        }
        const parameterFields = Array.isArray(entry.parameters)
          ? entry.parameters
              .map((param) => {
                const locationRaw = typeof param.in === 'string' && param.in ? param.in : '';
                const location = locationRaw.toLowerCase();
                if (location === 'header') return null;
                const field = typeof param.name === 'string' ? param.name : '';
                if (!field) return null;
                const description =
                  typeof param.description === 'string' && param.description
                    ? param.description
                    : undefined;
                const suffix = location ? ` (${location})` : '';
                return {
                  field,
                  required: Boolean(param.required),
                  description: description ? `${description}${suffix}` : suffix || undefined,
                };
              })
              .filter(Boolean)
          : [];
        const requestFields = Array.isArray(entry.requestFields)
          ? entry.requestFields.filter((field) => {
              if (!field || typeof field !== 'object') return true;
              const locationRaw =
                (typeof field.location === 'string' && field.location) ||
                (typeof field.in === 'string' && field.in) ||
                '';
              const location = locationRaw.toLowerCase();
              return location !== 'header';
            })
          : [];
        const combinedRequestFields = [...requestFields];
        parameterFields.forEach((param) => {
          if (combinedRequestFields.some((field) => field?.field === param.field)) return;
          combinedRequestFields.push(param);
        });
        const responseFields = Array.isArray(entry.responseFields) ? entry.responseFields : [];
        const requestMappingsRaw = Array.isArray(override.requestMappings)
          ? override.requestMappings
          : [];
        const responseMappingsRaw = Array.isArray(override.responseMappings)
          ? override.responseMappings
          : [];
        const requestMappings = [];
        const requestPrefill = {};
        const requiredPayloadFields = new Set(
          combinedRequestFields
            .filter((field) => field && typeof field.field === 'string' && field.required)
            .map((field) => field.field),
        );
        requestMappingsRaw.forEach((mapping) => {
          if (!mapping || typeof mapping !== 'object') return;
          const mappingLocation =
            (typeof mapping.location === 'string' && mapping.location) ||
            (typeof mapping.in === 'string' && mapping.in) ||
            '';
          if (mappingLocation.toLowerCase() === 'header') return;
          const fieldName = typeof mapping.field === 'string' ? mapping.field : '';
          if (!fieldName) return;
          const normalized = {
            field: fieldName,
            required: Boolean(mapping.required),
          };
          if (normalized.required) requiredPayloadFields.add(fieldName);
          if (typeof mapping.description === 'string' && mapping.description) {
            normalized.description = mapping.description;
          }
          if (mapping.fallback !== undefined && mapping.fallback !== null && mapping.fallback !== '') {
            normalized.fallback =
              typeof mapping.fallback === 'string'
                ? mapping.fallback
                : String(mapping.fallback);
          }
          if (mapping.value !== undefined && mapping.value !== null && mapping.value !== '') {
            normalized.scope = 'constant';
            normalized.value =
              typeof mapping.value === 'string' ? mapping.value : String(mapping.value);
          } else if (typeof mapping.source === 'string' && mapping.source.trim()) {
            const sourceValue = mapping.source.trim();
            const lower = sourceValue.toLowerCase();
            if (columnByLowerMap[lower] !== undefined) {
              normalized.scope = 'form';
              normalized.resolvedSource = columnByLowerMap[lower];
            } else if (extraKeyLookup[lower] !== undefined) {
              normalized.scope = 'extra';
              normalized.resolvedSource = extraKeyLookup[lower];
            } else {
              normalized.scope = 'custom';
              normalized.resolvedSource = sourceValue;
            }
            normalized.source = sourceValue;
          } else {
            normalized.scope = 'none';
          }
          requestMappings.push(normalized);
          requestPrefill[fieldName] = normalized;
        });
        const responseMappings = [];
        responseMappingsRaw.forEach((mapping) => {
          if (!mapping || typeof mapping !== 'object') return;
          const fieldName = typeof mapping.field === 'string' ? mapping.field : '';
          if (!fieldName) return;
          const target =
            typeof mapping.target === 'string' && mapping.target
              ? mapping.target
              : fieldName;
          const lowerTarget = target.toLowerCase();
          let scope = 'extra';
          let resolvedTarget = target;
          if (columnByLowerMap[lowerTarget] !== undefined) {
            scope = 'form';
            resolvedTarget = columnByLowerMap[lowerTarget];
          } else if (extraKeyLookup[lowerTarget] !== undefined) {
            scope = 'extra';
            resolvedTarget = extraKeyLookup[lowerTarget];
          }
          const joinWith =
            typeof mapping.joinWith === 'string' && mapping.joinWith
              ? mapping.joinWith
              : ', ';
          const pick = mapping.pick === 'first' ? 'first' : 'join';
          const fallback =
            mapping.fallback !== undefined && mapping.fallback !== null && mapping.fallback !== ''
              ? typeof mapping.fallback === 'string'
                ? mapping.fallback
                : String(mapping.fallback)
              : undefined;
          const required = Boolean(mapping.required);
          const description =
            typeof mapping.description === 'string' && mapping.description
              ? mapping.description
              : undefined;
          const targetLabel =
            typeof mapping.targetLabel === 'string' && mapping.targetLabel
              ? mapping.targetLabel
              : labels?.[resolvedTarget] || labels?.[target] || target;
          responseMappings.push({
            field: fieldName,
            target,
            resolvedTarget,
            scope,
            joinWith,
            pick,
            fallback,
            required,
            description,
            targetLabel,
          });
        });
        return {
          id: entry.id,
          name: entry.name || entry.id,
          method: entry.method || 'GET',
          path: entry.path || '/',
          parameters: parameterFields,
          requestFields: combinedRequestFields,
          responseFields,
          displayLabel,
          quickActionLabel,
          autoInvoke,
          payloadDefaults,
          requestMappings,
          requestPrefill,
          responseMappings,
          requiredPayloadFields,
          description:
            typeof override.description === 'string' && override.description
              ? override.description
              : undefined,
          modalTitle:
            typeof override.modalTitle === 'string' && override.modalTitle
              ? override.modalTitle
              : undefined,
        };
      })
      .filter(Boolean);
  }, [
    posApiInfoEndpointMeta,
    posApiInfoEndpointConfig,
    columnByLowerMap,
    extraKeyLookup,
    labels,
  ]);
  const infoEndpointsKey = React.useMemo(
    () => JSON.stringify(infoEndpoints.map((entry) => entry.id)),
    [infoEndpoints],
  );
  const quickInfoEndpoints = React.useMemo(
    () => infoEndpoints.filter((entry) => entry.quickActionLabel),
    [infoEndpoints],
  );
  const [infoModalOpen, setInfoModalOpen] = useState(false);
  const [activeInfoEndpointId, setActiveInfoEndpointId] = useState(
    () => infoEndpoints[0]?.id || '',
  );
  const [infoPayload, setInfoPayload] = useState({});
  const [infoResponse, setInfoResponse] = useState(null);
  const [infoError, setInfoError] = useState(null);
  const [infoLoading, setInfoLoading] = useState(false);
  const [infoHistory, setInfoHistory] = useState([]);
  const pendingInfoInvokeRef = useRef(null);
  useEffect(() => {
    if (!infoEndpoints.length) {
      setActiveInfoEndpointId('');
      return;
    }
    setActiveInfoEndpointId((prev) => {
      if (prev && infoEndpoints.some((entry) => entry.id === prev)) {
        return prev;
      }
      return infoEndpoints[0].id;
    });
  }, [infoEndpoints, infoEndpointsKey]);
  useEffect(() => {
    if (!infoModalOpen) return;
    const endpoint = infoEndpoints.find((entry) => entry.id === activeInfoEndpointId);
    if (!endpoint) {
      setInfoPayload({});
      return;
    }
    const fields = endpoint.requestFields
      .map((item) => (item && typeof item.field === 'string' ? item.field : ''))
      .filter((field) => field);
    if (!fields.length) {
      setInfoPayload({});
      return;
    }
    setInfoPayload((prev) => {
      const next = {};
      fields.forEach((field) => {
        if (prev[field] !== undefined && prev[field] !== null && prev[field] !== '') {
          next[field] = prev[field];
        } else {
          const auto = getFieldDefaultFromRecord(field);
          if (auto !== '') {
            next[field] = auto;
          }
        }
      });
      return next;
    });
  }, [infoModalOpen, activeInfoEndpointId, infoEndpoints, getFieldDefaultFromRecord]);
  const formValsRef = useRef(formVals);
  const extraValsRef = useRef(extraVals);
  const manualOverrideRef = useRef(new Map());
  const pendingManualOverrideRef = useRef(new Set());
  useEffect(() => {
    formValsRef.current = formVals;
  }, [formVals]);
  useEffect(() => {
    extraValsRef.current = extraVals;
  }, [extraVals]);
  const buildPayloadForEndpoint = useCallback(
    (endpoint, prevPayload = {}) => {
      if (!endpoint || typeof endpoint !== 'object') return {};
      const next = {};
      const prev = prevPayload && typeof prevPayload === 'object' ? prevPayload : {};
      const assignValue = (field, value) => {
        if (!field) return;
        if (value === undefined || value === null) return;
        const str = typeof value === 'string' ? value : String(value);
        if (str === '') return;
        next[field] = str;
      };
      Object.entries(endpoint.payloadDefaults || {}).forEach(([key, value]) => {
        assignValue(key, value);
      });
      const formSnapshot = formValsRef.current || {};
      const extraSnapshot = extraValsRef.current || {};
      const resolveMappingValue = (mapping) => {
        if (!mapping || typeof mapping !== 'object') return undefined;
        if (mapping.scope === 'constant') return mapping.value;
        if (mapping.scope === 'form' && mapping.resolvedSource) {
          return formSnapshot[mapping.resolvedSource];
        }
        if (mapping.scope === 'extra' && mapping.resolvedSource) {
          return extraSnapshot[mapping.resolvedSource];
        }
        if (mapping.scope === 'custom' && mapping.source) {
          const lower = mapping.source.toLowerCase();
          if (columnByLowerMap[lower] !== undefined) {
            return formSnapshot[columnByLowerMap[lower]];
          }
          if (extraKeyLookup[lower] !== undefined) {
            return extraSnapshot[extraKeyLookup[lower]];
          }
        }
        return undefined;
      };
      (endpoint.requestMappings || []).forEach((mapping) => {
        if (!mapping || typeof mapping !== 'object') return;
        const field = typeof mapping.field === 'string' ? mapping.field : '';
        if (!field) return;
        if (prev[field] !== undefined && prev[field] !== null && prev[field] !== '') {
          assignValue(field, prev[field]);
          return;
        }
        const value = resolveMappingValue(mapping);
        if (value !== undefined && value !== null && value !== '') {
          assignValue(field, value);
          return;
        }
        if (mapping.fallback) assignValue(field, mapping.fallback);
      });
      const requestedFields = Array.isArray(endpoint.requestFields)
        ? endpoint.requestFields
            .map((item) => (item && typeof item.field === 'string' ? item.field : ''))
            .filter((field) => field)
        : [];
      requestedFields.forEach((field) => {
        if (!field) return;
        if (next[field] !== undefined && next[field] !== null && next[field] !== '') return;
        if (prev[field] !== undefined && prev[field] !== null && prev[field] !== '') {
          assignValue(field, prev[field]);
          return;
        }
        const mapping = endpoint.requestPrefill?.[field];
        const mappedValue = resolveMappingValue(mapping);
        if (mappedValue !== undefined && mappedValue !== null && mappedValue !== '') {
          assignValue(field, mappedValue);
          return;
        }
        const lower = field.toLowerCase();
        if (columnByLowerMap[lower] !== undefined) {
          const formValue = formSnapshot[columnByLowerMap[lower]];
          if (formValue !== undefined && formValue !== null && formValue !== '') {
            assignValue(field, formValue);
            return;
          }
        }
        if (extraKeyLookup[lower] !== undefined) {
          const extraValue = extraSnapshot[extraKeyLookup[lower]];
          if (extraValue !== undefined && extraValue !== null && extraValue !== '') {
            assignValue(field, extraValue);
            return;
          }
        }
        if (endpoint.payloadDefaults && endpoint.payloadDefaults[field]) {
          assignValue(field, endpoint.payloadDefaults[field]);
        }
      });
      (endpoint.requestMappings || []).forEach((mapping) => {
        if (!mapping || typeof mapping !== 'object') return;
        const field = typeof mapping.field === 'string' ? mapping.field : '';
        if (!field) return;
        if (next[field] !== undefined && next[field] !== null && next[field] !== '') return;
        const fallback = mapping.fallback;
        if (fallback) assignValue(field, fallback);
      });
      return next;
    },
    [columnByLowerMap, extraKeyLookup],
  );
  const handleInvokeInfoEndpoint = useCallback(
    async ({ endpointId: overrideId, payloadOverride } = {}) => {
      const targetId = overrideId || activeInfoEndpointId;
      const endpoint = infoEndpoints.find((entry) => entry.id === targetId);
      if (!endpoint) return;
      const rawPayload =
        payloadOverride && typeof payloadOverride === 'object'
          ? payloadOverride
          : infoPayload;
      const sanitizedPayload = Object.entries(rawPayload || {}).reduce((acc, [key, val]) => {
        if (!key) return acc;
        const normalized = typeof val === 'string' ? val.trim() : val;
        if (normalized !== '' && normalized !== undefined && normalized !== null) {
          acc[key] = normalized;
        }
        return acc;
      }, {});
      (endpoint.requestMappings || []).forEach((mapping) => {
        if (!mapping || typeof mapping !== 'object') return;
        const field = typeof mapping.field === 'string' ? mapping.field : '';
        if (!field) return;
        if (sanitizedPayload[field] !== undefined && sanitizedPayload[field] !== null && sanitizedPayload[field] !== '') {
          sanitizedPayload[field] =
            typeof sanitizedPayload[field] === 'string'
              ? sanitizedPayload[field]
              : String(sanitizedPayload[field]);
          return;
        }
        let value;
        if (mapping.scope === 'constant') value = mapping.value;
        else if (mapping.scope === 'form' && mapping.resolvedSource)
          value = formValsRef.current?.[mapping.resolvedSource];
        else if (mapping.scope === 'extra' && mapping.resolvedSource)
          value = extraValsRef.current?.[mapping.resolvedSource];
        if (value !== undefined && value !== null && value !== '') {
          sanitizedPayload[field] = typeof value === 'string' ? value : String(value);
          return;
        }
        if (mapping.fallback) sanitizedPayload[field] = mapping.fallback;
      });
      const missingRequired = [];
      if (endpoint.requiredPayloadFields && endpoint.requiredPayloadFields instanceof Set) {
        endpoint.requiredPayloadFields.forEach((field) => {
          const value = sanitizedPayload[field];
          if (value === undefined || value === null || value === '') {
            missingRequired.push(field);
          }
        });
      }
      if (missingRequired.length) {
        const message = `Missing required lookup fields: ${missingRequired.join(', ')}`;
        setInfoError(message);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('toast', {
              detail: { message, type: 'warning' },
            }),
          );
        }
        return;
      }
      setInfoPayload(sanitizedPayload);
      setInfoLoading(true);
      setInfoError(null);
      try {
        const res = await fetch('/api/posapi/proxy/invoke', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            endpointId: endpoint.id,
            payload: sanitizedPayload,
            context: {
              table,
              recordId:
                row?.id ?? row?.ID ?? row?.id_field ?? row?.Id ?? row?.IdField ?? row?.record_id ?? null,
            },
          }),
        });
        if (!res.ok) {
          const message = await res.text();
          throw new Error(message || res.statusText || 'Lookup failed');
        }
        const data = await res.json();
        const responsePayload = data?.response ?? data ?? null;
        setInfoResponse(responsePayload);
        setInfoHistory((prev) => [
          ...prev.slice(-4),
          {
            timestamp: new Date().toISOString(),
            endpointId: endpoint.id,
            payload: sanitizedPayload,
            response: responsePayload,
          },
        ]);
      } catch (err) {
        const message = err.message || 'Lookup failed';
        setInfoError(message);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('toast', {
              detail: { message, type: 'error' },
            }),
          );
        }
      } finally {
        setInfoLoading(false);
      }
    },
    [infoEndpoints, activeInfoEndpointId, infoPayload, table, row],
  );
  useEffect(() => {
    if (!infoModalOpen) return;
    const endpoint = infoEndpoints.find((entry) => entry.id === activeInfoEndpointId);
    if (!endpoint) {
      setInfoPayload({});
      setInfoResponse(null);
      setInfoError(null);
      return;
    }
    setInfoPayload(buildPayloadForEndpoint(endpoint, {}));
    setInfoResponse(null);
    setInfoError(null);
  }, [infoModalOpen, activeInfoEndpointId, infoEndpoints, buildPayloadForEndpoint]);
  useEffect(() => {
    if (!infoModalOpen) {
      pendingInfoInvokeRef.current = null;
      return;
    }
    const pending = pendingInfoInvokeRef.current;
    if (!pending) return;
    if (pending.endpointId !== activeInfoEndpointId) return;
    pendingInfoInvokeRef.current = null;
    handleInvokeInfoEndpoint({ endpointId: pending.endpointId, payloadOverride: pending.payload });
  }, [infoModalOpen, activeInfoEndpointId, handleInvokeInfoEndpoint]);
  const openInfoModal = useCallback(() => {
    pendingInfoInvokeRef.current = null;
    setInfoModalOpen(true);
    setInfoError(null);
    setInfoResponse(null);
  }, []);
  const closeInfoModal = useCallback(() => {
    setInfoModalOpen(false);
    setInfoError(null);
    setInfoResponse(null);
  }, []);
  const resetInfoEndpointState = useCallback(
    (endpointId) => {
      const endpoint = infoEndpoints.find((entry) => entry.id === endpointId);
      if (!endpoint) {
        setInfoPayload({});
        setInfoResponse(null);
        setInfoError(null);
        setInfoLoading(false);
        return;
      }
      const nextPayload = buildPayloadForEndpoint(endpoint, {});
      setInfoPayload(nextPayload);
      setInfoResponse(null);
      setInfoError(null);
      setInfoLoading(false);
    },
    [infoEndpoints, buildPayloadForEndpoint],
  );
  const handleChangeActiveInfoEndpoint = useCallback(
    (endpointId) => {
      setActiveInfoEndpointId(endpointId);
      resetInfoEndpointState(endpointId);
    },
    [resetInfoEndpointState],
  );
  const openInfoModalForEndpoint = useCallback(
    (endpointId, { autoInvoke = false } = {}) => {
      if (!endpointId) return;
      const endpoint = infoEndpoints.find((entry) => entry.id === endpointId);
      if (!endpoint) return;
      const nextPayload = buildPayloadForEndpoint(endpoint, {});
      setActiveInfoEndpointId(endpointId);
      setInfoPayload(nextPayload);
      setInfoError(null);
      setInfoResponse(null);
      setInfoModalOpen(true);
      pendingInfoInvokeRef.current = autoInvoke
        ? { endpointId, payload: nextPayload }
        : null;
    },
    [infoEndpoints, buildPayloadForEndpoint],
  );
  const handleQuickInfoAction = useCallback(
    (endpoint) => {
      if (!endpoint) return;
      const shouldAutoInvoke = endpoint.autoInvoke !== false;
      openInfoModalForEndpoint(endpoint.id, { autoInvoke: shouldAutoInvoke });
    },
    [openInfoModalForEndpoint],
  );
  const handleInfoPayloadChange = useCallback((field, value) => {
    if (!field) return;
    const normalized = typeof value === 'string' ? value : value ?? '';
    setInfoPayload((prev) => {
      const next = { ...prev };
      if (normalized === '') {
        delete next[field];
      } else {
        next[field] = normalized;
      }
      return next;
    });
  }, []);
  const getResponseFieldValues = useCallback((response, path) => {
    if (!response || typeof response !== 'object') return [];
    if (!path) return [];
    const segments = String(path)
      .split('.')
      .map((segment) => segment.trim())
      .filter((segment) => segment);
    if (segments.length === 0) return [];
    let current = [response];
    segments.forEach((segment) => {
      const isArraySegment = segment.endsWith('[]');
      const key = isArraySegment ? segment.slice(0, -2) : segment;
      const next = [];
      current.forEach((item) => {
        if (item === undefined || item === null) return;
        if (key === '') {
          if (isArraySegment && Array.isArray(item)) next.push(...item);
          else next.push(item);
          return;
        }
        if (typeof item !== 'object') return;
        const candidate = item[key];
        if (candidate === undefined || candidate === null) return;
        if (isArraySegment) {
          if (Array.isArray(candidate)) next.push(...candidate);
          else next.push(candidate);
        } else {
          next.push(candidate);
        }
      });
      current = next;
    });
    return current;
  }, []);
  const formatResponseValue = useCallback((value) => {
    if (value === undefined || value === null) return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'bigint') return String(value);
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }, []);
  const extractResponseFields = useCallback((response) => {
    const result = {};
    if (!response || typeof response !== 'object') return result;
    Object.entries(response).forEach(([key, val]) => {
      if (val === undefined || val === null) return;
      if (typeof val === 'object') {
        try {
          result[key] = JSON.stringify(val);
        } catch {
          result[key] = String(val);
        }
      } else {
        result[key] = val;
      }
    });
    return result;
  }, []);
  const posApiTypeFieldLower = React.useMemo(
    () => (typeof posApiTypeField === 'string' ? posApiTypeField.toLowerCase() : ''),
    [posApiTypeField],
  );
  const posApiTypeBinding = React.useMemo(() => {
    if (!posApiTypeFieldLower) return null;
    const columnMatch = columns.find((col) => col.toLowerCase() === posApiTypeFieldLower);
    if (columnMatch) {
      return { scope: 'form', key: columnMatch };
    }
    const extraMatch = extraKeys.find((key) => key.toLowerCase() === posApiTypeFieldLower);
    if (extraMatch) {
      return { scope: 'extra', key: extraMatch };
    }
    if (columnLowerSet.has(posApiTypeFieldLower)) {
      return { scope: 'form', key: posApiTypeField };
    }
    return { scope: 'extra', key: posApiTypeField };
  }, [posApiTypeFieldLower, columns, extraKeys, columnLowerSet, posApiTypeField]);
  const currentPosApiType = React.useMemo(() => {
    if (!posApiTypeBinding || !posApiTypeBinding.key) return '';
    const source = posApiTypeBinding.scope === 'form' ? formVals : extraVals;
    const raw = source?.[posApiTypeBinding.key];
    if (raw === undefined || raw === null) return '';
    if (typeof raw === 'object' && raw !== null && 'value' in raw) {
      return String(raw.value ?? '');
    }
    return String(raw);
  }, [posApiTypeBinding, formVals, extraVals]);
  const canUsePosApi = React.useMemo(
    () => Boolean(posApiEnabled && canPost && !allowTemporaryOnly),
    [posApiEnabled, canPost, allowTemporaryOnly],
  );
  const showPosApiTypeSelect = Boolean(
    canUsePosApi && posApiTypeBinding && posApiTypeBinding.key,
  );
  useEffect(() => {
    if (pendingManualOverrideRef.current.size === 0) return;
    const pending = Array.from(pendingManualOverrideRef.current);
    pendingManualOverrideRef.current.clear();
    const overrides = manualOverrideRef.current;
    pending.forEach((lower) => {
      if (!lower) return;
      const match = columns.find((c) => c.toLowerCase() === lower);
      if (!match) return;
      overrides.set(lower, formVals[match]);
    });
  }, [formVals, columnsKey]);
  const computeNextFormVals = useCallback((baseRow, prevRow) => {
    if (!baseRow || typeof baseRow !== 'object') {
      return { next: baseRow, diff: {} };
    }
    let working = baseRow;
    const evaluators = generatedColumnEvaluators || {};
    let generatedChanged = false;
    let evaluationRow = null;
    if (Object.keys(evaluators).length > 0) {
      evaluationRow = { ...(extraValsRef.current || {}), ...working };
      const rows = [evaluationRow];
      const result = applyGeneratedColumnEvaluators({
        targetRows: rows,
        evaluators,
        equals: valuesEqual,
      });
      generatedChanged = Boolean(result?.changed);
      if (generatedChanged) {
        const evaluated = rows[0] || {};
        evaluationRow = rows[0] || evaluationRow;
        const merged = { ...working };
        columns.forEach((col) => {
          if (evaluated[col] !== undefined) {
            merged[col] = evaluated[col];
          }
        });
        working = merged;
      }
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
    let generatedExtra = null;
    if (generatedChanged) {
      const generatedKeys = Object.keys(evaluators || {});
      const lookup = columns.reduce((m, col) => {
        m[col.toLowerCase()] = col;
        return m;
      }, {});
      const latestExtra = extraValsRef.current || {};
      const evaluatedRow =
        evaluationRow || { ...(extraValsRef.current || {}), ...working };
      generatedKeys.forEach((rawKey) => {
        const lower = String(rawKey).toLowerCase();
        if (lookup[lower]) return;
        const val = evaluatedRow[rawKey];
        const prevExtra = latestExtra[rawKey];
        if (!valuesEqual(prevExtra, val)) {
          if (!generatedExtra) generatedExtra = {};
          generatedExtra[rawKey] = val;
        }
      });
      return { next: { ...working }, diff, generatedExtra };
    }
    return { next: working, diff };
  }, [generatedColumnEvaluators, columns]);

  const setFormValuesWithGenerated = useCallback(
    (updater, { notify = true } = {}) => {
      let pendingDiff = null;
      let snapshot = null;
      let pendingGeneratedExtra = null;
      setFormVals((prev) => {
        const base = typeof updater === 'function' ? updater(prev) : updater;
        if (!base) {
          snapshot = prev;
          return prev;
        }
        const working = { ...base };
        Object.entries(working).forEach(([key, value]) => {
          if (fieldTypeMap[key] === 'json') {
            working[key] = normalizeJsonArrayForState(value);
          }
        });
        const { next, diff, generatedExtra } = computeNextFormVals(working, prev);
        if (!diff || Object.keys(diff).length === 0) {
          snapshot = prev;
          return prev;
        }
        if (generatedExtra && Object.keys(generatedExtra).length > 0) {
          pendingGeneratedExtra = generatedExtra;
        }
        pendingDiff = diff;
        if (valuesEqual(prev, next)) {
          snapshot = prev;
          return prev;
        }
        snapshot = next;
        return next;
      });
      if (pendingGeneratedExtra && Object.keys(pendingGeneratedExtra).length > 0) {
        setExtraVals((prev) => {
          const next = { ...prev };
          Object.entries(pendingGeneratedExtra).forEach(([k, v]) => {
            next[k] = v;
          });
          return next;
        });
      }
      if (notify && pendingDiff && Object.keys(pendingDiff).length > 0) {
        onChange(pendingDiff);
      }
      return { snapshot: snapshot ?? formValsRef.current, diff: pendingDiff };
    },
    [computeNextFormVals, onChange],
  );
  const handleApplyInfoResponse = useCallback(() => {
    if (!infoResponse || typeof infoResponse !== 'object') return;
    const endpoint = infoEndpoints.find((entry) => entry.id === activeInfoEndpointId);
    const formUpdates = {};
    const extraUpdates = {};
    const appliedTargets = [];
    const missingRequiredTargets = [];
    if (endpoint && Array.isArray(endpoint.responseMappings) && endpoint.responseMappings.length > 0) {
      endpoint.responseMappings.forEach((mapping) => {
        if (!mapping || typeof mapping !== 'object') return;
        const values = getResponseFieldValues(infoResponse, mapping.field);
        const formatted = values
          .map((value) => formatResponseValue(value))
          .filter((value) => value !== undefined && value !== null && value !== '');
        let finalValue = '';
        if (formatted.length > 0) {
          if (mapping.pick === 'first') finalValue = formatted[0];
          else finalValue = formatted.join(mapping.joinWith || ', ');
        }
        if (!finalValue && mapping.fallback) finalValue = mapping.fallback;
        if (!finalValue && mapping.required) {
          missingRequiredTargets.push(mapping.targetLabel || mapping.resolvedTarget || mapping.target || mapping.field);
          return;
        }
        if (!finalValue) return;
        if (mapping.scope === 'form') {
          formUpdates[mapping.resolvedTarget || mapping.target] = finalValue;
        } else if (mapping.scope === 'extra') {
          extraUpdates[mapping.resolvedTarget || mapping.target] = finalValue;
        }
        appliedTargets.push(mapping.targetLabel || mapping.resolvedTarget || mapping.target || mapping.field);
      });
    } else {
      const flat = extractResponseFields(infoResponse);
      Object.entries(flat).forEach(([key, value]) => {
        if (value === undefined || value === null || value === '') return;
        const lower = String(key).toLowerCase();
        const normalized = typeof value === 'string' ? value : String(value);
        if (columnByLowerMap[lower] !== undefined) {
          formUpdates[columnByLowerMap[lower]] = normalized;
        } else if (extraKeyLookup[lower] !== undefined) {
          extraUpdates[extraKeyLookup[lower]] = normalized;
        }
      });
    }
    if (Object.keys(formUpdates).length) {
      setFormValuesWithGenerated((prev) => ({ ...prev, ...formUpdates }));
    }
    if (Object.keys(extraUpdates).length) {
      setExtraVals((prev) => ({ ...prev, ...extraUpdates }));
    }
    if (missingRequiredTargets.length && typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('toast', {
          detail: {
            message: `Lookup response missing required fields: ${missingRequiredTargets.join(', ')}`,
            type: 'warning',
          },
        }),
      );
    }
    if (appliedTargets.length && typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('toast', {
          detail: {
            message: `Applied ${appliedTargets.join(', ')}`,
            type: 'success',
          },
        }),
      );
    }
  }, [
    infoResponse,
    infoEndpoints,
    activeInfoEndpointId,
    getResponseFieldValues,
    formatResponseValue,
    extractResponseFields,
    columnByLowerMap,
    extraKeyLookup,
    setFormValuesWithGenerated,
    setExtraVals,
  ]);
  const activeInfoEndpoint = infoEndpoints.find((entry) => entry.id === activeInfoEndpointId) || null;
  const inputRefs = useRef({});
  const readonlyRefs = useRef({});
  const [errors, setErrors] = useState({});
  const errorsRef = useRef(errors);
  useEffect(() => {
    errorsRef.current = errors;
  }, [errors]);
  const [submitLocked, setSubmitLocked] = useState(false);
  const [temporaryLocked, setTemporaryLocked] = useState(false);
  const [issueEbarimtEnabled, setIssueEbarimtEnabled] = useState(() =>
    Boolean(posApiEnabled && !allowTemporaryOnly),
  );
  const formProcessing = submitLocked || temporaryLocked;
  const prevVisibleRef = useRef(visible);
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
    if (visible && !prevVisibleRef.current) {
      setIssueEbarimtEnabled(Boolean(posApiEnabled && !allowTemporaryOnly));
    }
    prevVisibleRef.current = visible;
  }, [visible, posApiEnabled, allowTemporaryOnly]);

  useEffect(() => {
    if (!visible) {
      setSubmitLocked(false);
      setTemporaryLocked(false);
    }
  }, [visible]);

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
      ...Object.keys(effectiveRow || {}),
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

  const resolveFormColumn = useCallback(
    (name) => {
      if (!name && name !== 0) return null;
      const lower = String(name).toLowerCase();
      const direct = columns.find((c) => c.toLowerCase() === lower);
      if (direct) return direct;
      const mapped = columnCaseMap[lower];
      if (typeof mapped === 'string' && mapped) return mapped;
      return null;
    },
    [columns, columnCaseMap],
  );

  useEffect(() => {
    const extras = {};
    Object.entries(effectiveRow || {}).forEach(([k, v]) => {
      const lowerKey = String(k).toLowerCase();
      if (!columnLowerSet.has(lowerKey)) {
        if (fieldTypeMap[k] === 'json') {
          extras[k] = normalizeJsonArrayForState(v);
        } else {
          extras[k] = normalizeDateInput(String(v ?? ''), placeholders[k]);
        }
      }
    });
    setExtraVals(extras);
  }, [effectiveRow, columnLowerSet, placeholders, fieldTypeMap]);

  useEffect(() => {
    if (table !== 'companies' || effectiveRow) return;
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
  }, [table, effectiveRow]);

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

  const handlePosApiTypeChange = useCallback(
    (event) => {
      if (!posApiTypeBinding || !posApiTypeBinding.key) return;
      const nextValue = event?.target?.value ?? '';
      if (posApiTypeBinding.scope === 'form') {
        setFormValuesWithGenerated((prev) => {
          if (!prev) return prev;
          const current = prev[posApiTypeBinding.key];
          if (current === nextValue) return prev;
          return { ...prev, [posApiTypeBinding.key]: nextValue };
        });
      } else {
        let changed = false;
        setExtraVals((prev) => {
          const currentRaw = prev[posApiTypeBinding.key];
          const current =
            currentRaw === undefined || currentRaw === null
              ? ''
              : String(
                  typeof currentRaw === 'object' && currentRaw !== null && 'value' in currentRaw
                    ? currentRaw.value
                    : currentRaw,
                );
          if (current === nextValue) return prev;
          changed = true;
          return { ...prev, [posApiTypeBinding.key]: nextValue };
        });
        if (changed && typeof onChange === 'function') {
          onChange({ [posApiTypeBinding.key]: nextValue });
        }
      }
    },
    [posApiTypeBinding, setFormValuesWithGenerated, onChange],
  );

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
                      value={normalizeInputValue(row[c])}
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

  function ensureJsonArray(value) {
    if (Array.isArray(value)) return value;
    if (value === undefined || value === null || value === '') return [];
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) return parsed;
        if (parsed === undefined || parsed === null || parsed === '') return [];
        return [parsed];
      } catch {
        return value ? [value] : [];
      }
    }
    return [value];
  }

  function normalizeJsonValueForState(value) {
    if (value === null || value === undefined || value === '') return '';
    if (typeof value === 'object') {
      const isPlainObject = Object.prototype.toString.call(value) === '[object Object]';
      if (isPlainObject && Object.keys(value).length === 0) return '';
      try {
        return JSON.stringify(value);
      } catch {
        return '';
      }
    }
    return String(value);
  }

  function normalizeJsonArrayForState(value) {
    const list = Array.isArray(value)
      ? value
      : value === undefined || value === null || value === ''
      ? []
      : [value];
    return list
      .map((entry) => normalizeJsonValueForState(entry))
      .filter((entry) => entry !== '');
  }

  function parseJsonFieldValue(value) {
    const list = ensureJsonArray(value);
    return list
      .map((entry) => {
        if (typeof entry !== 'string') return entry;
        const trimmed = entry.trim();
        if (!trimmed) return '';
        try {
          return JSON.parse(trimmed);
        } catch {
          return entry;
        }
      })
      .filter((entry) => entry !== '' && entry !== null && entry !== undefined);
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
      const sourceValue = rowValue !== undefined ? rowValue : defaultValues[c];
      const missing = !row || rowValue === undefined || rowValue === '';
      let v;
      if (fieldTypeMap[c] === 'json') {
        v = normalizeJsonArrayForState(sourceValue);
      } else if (placeholders[c]) {
        v = normalizeDateInput(String(sourceValue ?? ''), placeholders[c]);
      } else if (fieldTypeMap[c] === 'number') {
        v = formatNumericValue(c, sourceValue);
      } else if (sourceValue === null || sourceValue === undefined) {
        v = '';
      } else {
        v = String(sourceValue);
      }
      if (missing && (!v || v === '') && dateField.includes(c)) {
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
      if (fieldTypeMap[c] === 'json') {
        v = normalizeJsonArrayForState(v);
      } else if (fieldTypeMap[c] === 'number') {
        v = formatNumericValue(c, v);
      } else if (placeholders[c]) {
        v = normalizeDateInput(String(v ?? ''), placeholders[c]);
      } else if (v === null || v === undefined) {
        v = '';
      } else {
        v = String(v);
      }
      vals[c] = v;
    });
    inputRefs.current = {};
    if (errorsRef.current && Object.keys(errorsRef.current).length > 0) {
      setErrors({});
    }
    manualOverrideRef.current.clear();
    pendingManualOverrideRef.current.clear();
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
    fieldTypeMap,
    formatNumericValue,
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
  const baseBoxStyle = {
    fontSize: `${inputFontSize}px`,
    padding: '0.25rem 0.5rem',
    minWidth: `${boxWidth}px`,
    maxWidth: `${boxMaxWidth}px`,
    overflowWrap: 'anywhere',
    wordBreak: 'break-word',
    display: 'block',
  };
  const inputStyle = {
    ...baseBoxStyle,
    width: `${boxWidth}px`,
    height: isNarrow ? '44px' : `${boxHeight}px`,
    maxHeight: isNarrow ? 'none' : `${boxMaxHeight}px`,
    whiteSpace: 'normal',
  };
  const readonlyBoxStyle = {
    ...baseBoxStyle,
    width: '100%',
    height: 'auto',
    minHeight: isNarrow ? 'auto' : `${boxHeight}px`,
    maxHeight: isNarrow ? 'none' : `${boxMaxHeight}px`,
    whiteSpace: 'pre-wrap',
    overflowY: 'auto',
    overflowX: 'hidden',
  };

  function notifyAutoResetGuardOnEdit(col) {
    if (!col && col !== 0) return;
    const lower = String(col).toLowerCase();
    pendingManualOverrideRef.current.add(lower);
    if (typeof window !== 'undefined') {
      const handler = window.notifyAutoResetGuardOnEdit;
      if (typeof handler === 'function') {
        try {
          handler(col);
        } catch (err) {
          console.error('notifyAutoResetGuardOnEdit failed', err);
        }
      }
    }
  }

  async function handleKeyDown(e, col) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const isLookupField =
      !!relationConfigMap[col] ||
      !!viewSourceMap[col] ||
      (Array.isArray(autoSelectConfigs[col]) && autoSelectConfigs[col].length > 0);
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
    notifyAutoResetGuardOnEdit(col);
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
    const triggerAware =
      hasTrigger(col) ||
      Object.prototype.hasOwnProperty.call(procTriggers || {}, col.toLowerCase());
    if (triggerAware) {
      const override = { ...nextSnapshot, [col]: newVal };
      await runProcTrigger(col, override);
      await previewTriggerAssignments(override);
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

  const isAssignmentTrigger = (cfg) =>
    cfg && (cfg.kind === 'assignment' || cfg.name === '__assignment__');

  function hasTrigger(col) {
    const lower = col.toLowerCase();
    return (
      getDirectTriggers(col).length > 0 ||
      getParamTriggers(col).length > 0 ||
      Object.prototype.hasOwnProperty.call(procTriggers || {}, lower)
    );
  }

  function showTriggerInfo(col) {
    if (!general.triggerToastEnabled) return;
    if (!procTriggers || Object.keys(procTriggers || {}).length === 0) return;
    const colLower = col.toLowerCase();
    const normalizedCol = columnCaseMap[colLower] || col;
    const direct = getDirectTriggers(col);
    const paramTrigs = getParamTriggers(col);
    const hasEntry = Object.prototype.hasOwnProperty.call(procTriggers, colLower);

    const assignmentTargets = new Set();
    const collectAssignmentTargets = (cfg, fallbackTarget = null) => {
      if (!isAssignmentTrigger(cfg)) return;
      const targets = Array.isArray(cfg?.targets) ? cfg.targets : [];
      const normalizedTargets = targets.length > 0 ? targets : fallbackTarget ? [fallbackTarget] : [];
      normalizedTargets.forEach((target) => {
        if (!target) return;
        const lower = String(target).toLowerCase();
        const resolved = columnCaseMap[lower] || target;
        assignmentTargets.add(resolved);
      });
      Object.values(cfg?.outMap || {}).forEach((target) => {
        if (!target) return;
        const lower = String(target).toLowerCase();
        const resolved = columnCaseMap[lower] || target;
        assignmentTargets.add(resolved);
      });
    };

    direct.forEach((cfg) => collectAssignmentTargets(cfg));
    paramTrigs.forEach(([targetCol, cfg]) => collectAssignmentTargets(cfg, targetCol));

    const procDirect = direct.filter((cfg) => !isAssignmentTrigger(cfg));
    const procParam = paramTrigs.filter(([, cfg]) => !isAssignmentTrigger(cfg));
    const virtualDependents = generatedDependencyLookup[colLower];
    const combinedTargets = new Set([
      ...assignmentTargets,
      ...(virtualDependents ? Array.from(virtualDependents) : []),
    ]);
    const isVirtual = generatedColumnSet.has(normalizedCol);
    const hasAnyAssignments = combinedTargets.size > 0;
    const hasAnyProcedures = procDirect.length > 0 || procParam.length > 0;

    if (!hasAnyAssignments && !hasAnyProcedures && !isVirtual) {
      const message = hasEntry
        ? `${col} талбар нь өгөгдлийн сангийн триггерээр бөглөгдөнө. Урьдчилсан тооцоолол хязгаарлагдмал байж болно.`
        : `${col} талбар триггер ашигладаггүй`;
      window.dispatchEvent(
        new CustomEvent('toast', {
          detail: { message, type: 'info' },
        }),
      );
      return;
    }

    if (combinedTargets.size > 0) {
      const targets = Array.from(combinedTargets).join(', ');
      window.dispatchEvent(
        new CustomEvent('toast', {
          detail: {
            message: `${col} талбарын утга өөрчлөгдвөл дараах талбарууд автоматаар бөглөгдөнө: ${targets}`,
            type: 'info',
          },
        }),
      );
    }

    if (isVirtual) {
      window.dispatchEvent(
        new CustomEvent('toast', {
          detail: {
            message: `${col} талбар нь виртуал тооцоолол бөгөөд утгыг автоматаар тооцно.`,
            type: 'info',
          },
        }),
      );
    }

    const directNames = [...new Set(procDirect.map((d) => d.name))];
    directNames.forEach((name) => {
      window.dispatchEvent(
        new CustomEvent('toast', {
          detail: { message: `${col} -> ${name}`, type: 'info' },
        }),
      );
    });

    if (procParam.length > 0) {
      const names = [...new Set(procParam.map(([, cfg]) => cfg.name))].join(', ');
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

  function applyProcedureResultToForm(
    rowData,
    formState,
    extraState,
    manualOverrides = manualOverrideRef.current,
  ) {
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
      const columnMatch = resolveFormColumn(key);
      const targetKey = columnMatch || key;
      if (columnMatch) {
        const lower = columnMatch.toLowerCase();
        if (manualOverrides && manualOverrides.has(lower)) {
          const manualValue = manualOverrides.get(lower);
          if (!valuesEqual(manualValue, value)) {
            nextFormVals[columnMatch] = manualValue;
            return;
          }
          manualOverrides.delete(lower);
        }
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
        const assignmentTargets =
          isAssignmentTrigger(cfg) && Array.isArray(cfg.targets) ? cfg.targets : [];
        const normalizedAssignmentTargets = assignmentTargets
          .map((target) => normalizeColumn(target))
          .filter(Boolean);
        const hasTarget = [...targetCols, ...normalizedAssignmentTargets].some((c) =>
          columns.includes(c),
        );
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

        const result = applyProcedureResultToForm(
          row,
          workingFormVals,
          workingExtraVals,
          manualOverrideRef.current,
        );
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

  async function previewTriggerAssignments(payloadOverride = null) {
    if (!table) return;
    const merged = { ...(extraValsRef.current || {}), ...(formValsRef.current || {}) };
    if (payloadOverride && typeof payloadOverride === 'object') {
      Object.entries(payloadOverride).forEach(([k, v]) => {
        const key = resolveFormColumn(k) || k;
        merged[key] = v;
      });
    }
    try {
      const res = await fetch('/api/proc_triggers/preview', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table, values: merged }),
      });
      if (!res.ok) return;
      const data = await res.json().catch(() => ({}));
      if (!data || typeof data !== 'object') return;
      const previewRow = (() => {
        if (!data || typeof data !== 'object') return null;
        const base = {};
        if (Array.isArray(data.rows) && data.rows.length > 0 && typeof data.rows[0] === 'object') {
          Object.assign(base, data.rows[0]);
        }
        if (data.row && typeof data.row === 'object' && !Array.isArray(data.row)) {
          Object.assign(base, data.row);
        }
        const directEntries = Object.entries(data).filter(
          ([key]) => key !== 'rows' && key !== 'row',
        );
        if (directEntries.length > 0) {
          directEntries.forEach(([key, value]) => {
            base[key] = value;
          });
        }
        if (Object.keys(base).length > 0) return base;
        return null;
      })();
      if (!previewRow || typeof previewRow !== 'object') return;
      const { formVals: nextForm, extraVals: nextExtra, changedValues } =
        applyProcedureResultToForm(previewRow, formValsRef.current, extraValsRef.current);
      extraValsRef.current = nextExtra;
      setExtraVals(nextExtra);
      const result = setFormValuesWithGenerated(() => nextForm, { notify: false });
      const combined = { ...(changedValues || {}), ...(result?.diff || {}) };
      if (Object.keys(combined).length > 0) onChange(combined);
    } catch {
      // silently ignore preview failures
    }
  }

  async function openRelationPreview(col) {
    let val = formVals[col];
    if (val && typeof val === 'object') val = val.value;
    const auto = getAutoSelectConfig(col);
    const conf = relationConfigMap[col] || auto?.config;
    const viewTbl = viewSourceMap[col] || auto?.config?.table;
    const table = conf ? conf.table : viewTbl;
    const idField = conf
      ? conf.idField || conf.column
      : auto?.config?.idField || viewDisplays[viewTbl]?.idField || col;
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
    if (guardToastEnabled && col) {
      const lower = String(col).toLowerCase();
      if (disabledSet.has(lower)) {
        const reasons = describeGuardReasons(disabledReasonLookup[lower] || []);
        const message =
          reasons.length > 0
            ? t('pos_guard_toast_message_with_reasons', '{{field}} is read-only: {{reasons}}', {
                field: col,
                reasons: reasons.join('; '),
              })
            : t('pos_guard_toast_message', '{{field}} is read-only.', { field: col });
        const now = Date.now();
        const last = lastGuardToastRef.current;
        if (last.field !== lower || now - last.ts > 400) {
          window.dispatchEvent(
            new CustomEvent('toast', {
              detail: { message, type: 'info' },
            }),
          );
          lastGuardToastRef.current = { field: lower, ts: now };
        }
      }
    }
    const view = viewSourceMap[col];
    if (view && !alreadyRequestedRef.current.has(view)) {
      alreadyRequestedRef.current.add(view);
      loadView(view);
    }
  }

  async function handleTemporarySave() {
    if (!allowTemporarySave || !onSaveTemporary || temporaryLocked) return;
    setTemporaryLocked(true);
    try {
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
        const jsonValueMap = {};
        Object.entries(r).forEach(([k, v]) => {
          const raw = typeof v === 'object' && v !== null && 'value' in v ? v.value : v;
          let val = raw;
          if (fieldTypeMap[k] === 'json') {
            const arr = parseJsonFieldValue(val);
            jsonValueMap[k] = arr;
            val = JSON.stringify(arr);
          } else {
            val = normalizeDateInput(val, placeholders[k]);
            if (totalAmountSet.has(k) || totalCurrencySet.has(k)) {
              val = normalizeNumberInput(val);
            }
          }
          normalized[k] = val;
        });
        requiredFields.forEach((f) => {
          const missing =
            normalized[f] === '' ||
            normalized[f] === null ||
            normalized[f] === undefined ||
            (fieldTypeMap[f] === 'json' &&
              Array.isArray(jsonValueMap[f]) &&
              jsonValueMap[f].length === 0);
          if (missing) hasMissing = true;
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
          let val = v;
          if (fieldTypeMap[k] === 'json') {
            const parsed = parseJsonFieldValue(v);
            val = JSON.stringify(parsed);
          } else {
            val = normalizeDateInput(v, placeholders[k]);
            if (totalAmountSet.has(k) || totalCurrencySet.has(k)) {
              val = normalizeNumberInput(val);
            }
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
        let val = v;
        if (fieldTypeMap[k] === 'json') {
          const parsed = parseJsonFieldValue(v);
          val = JSON.stringify(parsed);
        } else {
          val = normalizeDateInput(v, placeholders[k]);
          if (totalAmountSet.has(k) || totalCurrencySet.has(k)) {
            val = normalizeNumberInput(val);
          }
        }
        normalized[k] = val;
      });
      try {
        await Promise.resolve(onSaveTemporary({ values: normalized }));
      } catch (err) {
        console.error('Temporary save failed', err);
      }
    } finally {
      setTemporaryLocked(false);
    }
  }

  async function submitForm(options = {}) {
    const submitOptions = options || {};
    const submitIntent = submitOptions.submitIntent || submitIntentRef.current || 'post';
    submitOptions.submitIntent = submitIntent;
    submitIntentRef.current = null;
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
        const jsonValueMap = {};
        Object.entries(r).forEach(([k, v]) => {
          const raw = typeof v === 'object' && v !== null && 'value' in v ? v.value : v;
          let val = raw;
          if (fieldTypeMap[k] === 'json') {
            const arr = parseJsonFieldValue(val);
            jsonValueMap[k] = arr;
            val = JSON.stringify(arr);
          } else {
            val = normalizeDateInput(val, placeholders[k]);
            if (totalAmountSet.has(k) || totalCurrencySet.has(k)) {
              val = normalizeNumberInput(val);
            }
          }
          normalized[k] = val;
        });
        requiredFields.forEach((f) => {
          if (
            normalized[f] === '' ||
            normalized[f] === null ||
            normalized[f] === undefined
          ) {
            hasMissing = true;
          } else if (
            fieldTypeMap[f] === 'json' &&
            Array.isArray(jsonValueMap[f]) &&
            jsonValueMap[f].length === 0
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
            const rowOptions =
              i === 0
                ? submitOptions
                : { ...submitOptions, issueEbarimt: false };
            const res = await Promise.resolve(
              onSubmit({ ...extra, ...r }, rowOptions),
            );
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
      if (!columns.includes(f)) return;
      const val = formVals[f];
      const isJson = fieldTypeMap[f] === 'json';
      const isMissing =
        val === '' ||
        val === null ||
        val === undefined ||
        (isJson && Array.isArray(val) && val.length === 0);
      if (isMissing) {
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
        let val = v;
        if (fieldTypeMap[k] === 'json') {
          const parsed = parseJsonFieldValue(v);
          val = JSON.stringify(parsed);
        } else {
          val = normalizeDateInput(v, placeholders[k]);
          if (totalAmountSet.has(k) || totalCurrencySet.has(k)) {
            val = normalizeNumberInput(val);
          }
        }
        normalized[k] = val;
      });
      try {
        const res = await Promise.resolve(onSubmit(normalized, submitOptions));
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
    const numericScale = getNumericScale(c);
    const numericStep =
      numericScale === null
        ? undefined
        : numericScale <= 0
        ? '1'
        : (1 / 10 ** numericScale).toFixed(numericScale);
    const isNumericField = fieldTypeMap[c] === 'number';
    const isJsonField = fieldTypeMap[c] === 'json';
    const autoSelectForField = getAutoSelectConfig(c);
    const resolvedRelationConfig = relationConfigMap[c] || autoSelectForField?.config;

    if (disabled) {
      const raw = isColumn ? formVals[c] : extraVals[c];
      const val = typeof raw === 'object' && raw !== null ? raw.value : raw;
      let display = typeof raw === 'object' && raw !== null ? raw.label || val : val;
      const normalizedValueKey = normalizeRelationOptionKey(val);
      let resolvedOptionLabel = false;
      const labelMap =
        relationOptionLabelLookup[c] || relationOptionLabelLookup[String(c).toLowerCase()];
      if (normalizedValueKey && labelMap) {
        const optionLabel = labelMap[normalizedValueKey];
        if (optionLabel !== undefined) {
          display = optionLabel;
          resolvedOptionLabel = true;
        }
      }
      if (fieldTypeMap[c] === 'json') {
        const values = normalizeJsonArrayForState(val);
        const relationRows = relationData[c] || {};
        const parts = [];
        const pushFormattedPart = (input) => {
          const formatted = formatJsonItem(input);
          if (formatted || formatted === 0 || formatted === false) {
            parts.push(typeof formatted === 'string' ? formatted : String(formatted));
          }
        };
        values.forEach((item) => {
          const row = relationRows[item] || relationRows[String(item)];
          if (row && resolvedRelationConfig) {
            const identifier =
              getRowValueCaseInsensitive(row, resolvedRelationConfig.idField || resolvedRelationConfig.column) ??
              item;
            const extras = (resolvedRelationConfig.displayFields || [])
              .map((df) => row[df])
              .filter((v) => v !== undefined && v !== null && v !== '');
            const formattedParts = [identifier, ...extras]
              .map((entry) => formatJsonItem(entry))
              .filter((entry) => entry || entry === 0 || entry === false)
              .map((entry) => (typeof entry === 'string' ? entry : String(entry)));
            if (formattedParts.length > 0) {
              parts.push(formattedParts.join(' - '));
            }
          } else {
            pushFormattedPart(item);
          }
        });
        display = parts.join(', ');
      } else if (
        !resolvedOptionLabel &&
        resolvedRelationConfig &&
        val !== undefined &&
        relationData[c]?.[val]
      ) {
        const row = relationData[c][val];
        const cfg = resolvedRelationConfig;
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
        !resolvedOptionLabel &&
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
        !resolvedOptionLabel &&
        autoSelectForField?.config &&
        val !== undefined &&
        relationData[c]?.[val]
      ) {
        const row = relationData[c][val];
        const cfg = autoSelectForField?.config || {};
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
      if (isNumericField && display !== undefined && display !== null && display !== '') {
        display = formatNumericValue(c, display);
      }
      if (display === null || display === undefined) display = '';
      const content = (
        <div
          className="border rounded bg-gray-100 px-2 py-1"
          style={readonlyBoxStyle}
          ref={(el) => (readonlyRefs.current[c] = el)}
          tabIndex={0}
          role="textbox"
          aria-readonly="true"
          onFocus={() => handleFocusField(c)}
        >
          {display}
        </div>
      );
      if (!withLabel) return <TooltipWrapper title={tip}>{content}</TooltipWrapper>;
      return (
        <TooltipWrapper key={c} title={tip}>
          <div className={fitted ? 'mb-1' : 'mb-3'}>
            <label className="block mb-1 font-medium" style={labelStyle}>
              {labels[c] || c}
              {requiredFields.includes(c) && (
                <span className="text-red-500">*</span>
              )}
            </label>
            {content}
          </div>
        </TooltipWrapper>
      );
    }

    const control = isJsonField ? (
      (() => {
        const currentValues = normalizeJsonArrayForState(formVals[c]);
        if (resolvedRelationConfig && resolvedRelationConfig.table) {
          const comboFilters =
            autoSelectForField?.filters ?? resolveCombinationFilters(c, resolvedRelationConfig);
          const hasCombination = Boolean(
            resolvedRelationConfig?.combinationSourceColumn &&
              resolvedRelationConfig?.combinationTargetColumn,
          );
          const combinationReady =
            autoSelectForField?.combinationReady ??
            isCombinationFilterReady(
              hasCombination,
              resolvedRelationConfig?.combinationTargetColumn,
              comboFilters,
            );
          return (
            formVisible && (
              <AsyncSearchSelect
                title={tip}
                table={resolvedRelationConfig.table}
                searchColumn={resolvedRelationConfig.idField || resolvedRelationConfig.column}
                searchColumns={[
                  resolvedRelationConfig.idField || resolvedRelationConfig.column,
                  ...(resolvedRelationConfig.displayFields || []),
                ]}
                labelFields={resolvedRelationConfig.displayFields || []}
                value={currentValues}
                onChange={(vals) => {
                  notifyAutoResetGuardOnEdit(c);
                  setFormValuesWithGenerated((prev) => {
                    const normalizedVals = normalizeJsonArrayForState(vals);
                    if (valuesEqual(prev[c], normalizedVals)) return prev;
                    return { ...prev, [c]: normalizedVals };
                  });
                  setErrors((er) => ({ ...er, [c]: undefined }));
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
                  handleFocusField(c);
                  e.target.style.width = 'auto';
                  const w = Math.min(e.target.scrollWidth + 2, boxMaxWidth);
                  e.target.style.width = `${Math.max(boxWidth, w)}px`;
                }}
                inputRef={(el) => (inputRefs.current[c] = el)}
                inputStyle={inputStyle}
                companyId={company}
                filters={comboFilters || undefined}
                shouldFetch={combinationReady}
                isMulti
              />
            )
          );
        }
        return (
          <TagMultiInput
            value={currentValues}
            onChange={(vals) => {
              notifyAutoResetGuardOnEdit(c);
              setFormValuesWithGenerated((prev) => {
                const normalizedVals = normalizeJsonArrayForState(vals);
                if (valuesEqual(prev[c], normalizedVals)) return prev;
                return { ...prev, [c]: normalizedVals };
              });
              setErrors((er) => ({ ...er, [c]: undefined }));
            }}
            placeholder={tip}
            inputStyle={inputStyle}
            disabled={disabled}
            onFocus={() => handleFocusField(c)}
          />
        );
      })()
    ) : resolvedRelationConfig ? (
      (() => {
        const conf = resolvedRelationConfig;
        const comboFilters =
          autoSelectForField?.filters ?? resolveCombinationFilters(c, conf);
        const hasCombination = Boolean(
          conf?.combinationSourceColumn && conf?.combinationTargetColumn,
        );
        const combinationReady =
          autoSelectForField?.combinationReady ??
          isCombinationFilterReady(hasCombination, conf?.combinationTargetColumn, comboFilters);
        return (
          formVisible && (
            <AsyncSearchSelect
              title={tip}
              table={conf.table}
              searchColumn={conf.idField || conf.column}
              searchColumns={[conf.idField || conf.column, ...(conf.displayFields || [])]}
              labelFields={conf.displayFields || []}
              value={typeof formVals[c] === 'object' ? formVals[c].value : formVals[c]}
              onChange={(val) => {
                notifyAutoResetGuardOnEdit(c);
                setFormValuesWithGenerated((prev) => {
                  if (valuesEqual(prev[c], val)) return prev;
                  return { ...prev, [c]: val };
                });
                setErrors((er) => ({ ...er, [c]: undefined }));
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
              filters={comboFilters || undefined}
              shouldFetch={combinationReady}
            />
          )
        );
      })()
    ) : viewSourceMap[c] && !Array.isArray(relations[c]) ? (
      (() => {
        const view = viewSourceMap[c];
        const cfg = viewDisplays[view] || {};
        const comboFilters = resolveCombinationFilters(c, cfg);
        const hasCombination = Boolean(
          cfg?.combinationSourceColumn && cfg?.combinationTargetColumn,
        );
        const combinationReady = isCombinationFilterReady(
          hasCombination,
          cfg?.combinationTargetColumn,
          comboFilters,
        );
        return (
          formVisible && (
            <AsyncSearchSelect
              title={tip}
              table={view}
              searchColumn={cfg.idField || c}
              searchColumns={[cfg.idField || c, ...(cfg.displayFields || [])]}
              labelFields={cfg.displayFields || []}
              idField={cfg.idField || c}
              value={typeof formVals[c] === 'object' ? formVals[c].value : formVals[c]}
              onChange={(val) => {
                notifyAutoResetGuardOnEdit(c);
                setFormValuesWithGenerated((prev) => {
                  if (valuesEqual(prev[c], val)) return prev;
                  return { ...prev, [c]: val };
                });
                setErrors((er) => ({ ...er, [c]: undefined }));
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
              filters={comboFilters || undefined}
              shouldFetch={combinationReady}
            />
          )
        );
      })()
    ) : Array.isArray(relations[c]) ? (
      (() => {
        const filteredOptions = filterRelationOptions(c, relations[c]);
        return (
          <select
            title={tip}
            ref={(el) => (inputRefs.current[c] = el)}
            value={formVals[c]}
            onFocus={() => handleFocusField(c)}
            onChange={(e) => {
              notifyAutoResetGuardOnEdit(c);
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
            {filteredOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        );
      })()
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
        step={isNumericField && numericStep ? numericStep : undefined}
        placeholder={placeholders[c] || ''}
        value={normalizeInputValue(
          fieldTypeMap[c] === 'date' || fieldTypeMap[c] === 'datetime'
            ? normalizeDateInput(formVals[c], 'YYYY-MM-DD')
            : formVals[c],
        )}
        onChange={(e) => {
          notifyAutoResetGuardOnEdit(c);
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
        onBlur={(e) => {
          if (!isNumericField) return;
          const formatted = formatNumericValue(c, e.target.value);
          if (typeof formatted !== 'string' || formatted === e.target.value) return;
          setFormValuesWithGenerated((prev) => {
            if (prev[c] === formatted) return prev;
            return { ...prev, [c]: formatted };
          });
          e.target.value = formatted;
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
        numericScaleMapKey,
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
            procTriggers={procTriggers}
            user={user}
            company={company}
            branch={branch}
            department={department}
            columnCaseMap={columnCaseMap}
            numericScaleMap={numericScaleMap}
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
            disabledFieldReasons={disabledFieldReasons}
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
            readOnly={isReadOnly}
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

  const showTemporarySaveButton =
    allowTemporarySave &&
    onSaveTemporary &&
    (isAdding || isEditingTemporaryDraft) &&
    (!isReadOnly || temporarySaveLabel);
  const postButtonLabel = submitLocked ? t('posting', 'Posting...') : t('post', 'Post');
  const ebarimtButtonLabel = submitLocked
    ? t('posting', 'Posting...')
    : t('ebarimt_post', 'Ebarimt Post');
  const temporaryButtonLabel = temporaryLocked
    ? temporarySaveLabel || t('saving_temporary', 'Saving temporary...')
    : temporarySaveLabel || t('save_temporary', 'Save as Temporary');
  const processingText = temporaryLocked
    ? t('saving_temporary_progress', 'Saving temporary submission...')
    : t('posting_transaction_progress', 'Posting transaction...');
  const handleClose = () => {
    if (formProcessing) return;
    onCancel();
  };
  const markSubmitIntent = (intent) => {
    submitIntentRef.current = intent || 'post';
  };

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
        onClose={handleClose}
        width="70vw"
      >
        <div className="relative">
          {formProcessing && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-white/70 backdrop-blur-sm">
              <div className="h-10 w-10 rounded-full border-2 border-blue-200 border-t-blue-600 animate-spin" />
              <p className="mt-3 text-sm font-medium text-gray-700 text-center px-4">{processingText}</p>
            </div>
          )}
          <form
            ref={wrapRef}
            style={{ transform: `scale(${zoom})`, transformOrigin: '0 0', padding: fitted ? 0 : undefined }}
            onSubmit={(e) => {
              e.preventDefault();
              submitForm();
            }}
            className={`${fitted ? 'p-4 space-y-2' : 'p-4 space-y-4'} ${formProcessing ? 'opacity-60 pointer-events-none' : ''}`}
            aria-busy={formProcessing}
          >
          {isRejectedWorkflow && (
            <div className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
              {t(
                'rejected_transaction_warning',
                'This transaction was rejected and requires review',
              )}
              {isTemporaryWorkflow && (
                <div className="mt-1 text-xs text-amber-700">
                  {t(
                    'temporary_workflow_hint',
                    'Temporary workflow in progress – verify before posting.',
                  )}
                </div>
              )}
            </div>
          )}
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
        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            {canUsePosApi && (
              <label className="inline-flex items-center space-x-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  className="rounded"
                  checked={issueEbarimtEnabled}
                  onChange={(e) => setIssueEbarimtEnabled(e.target.checked)}
                  disabled={isReadOnly}
                />
                <span>{t('issue_ebarimt_toggle', 'Issue Ebarimt (POSAPI)')}</span>
              </label>
            )}
            {showPosApiTypeSelect && (
              <label className="flex items-center space-x-2 text-sm text-gray-700">
                <span>{t('posapi_type_label', 'POSAPI Type')}</span>
                <select
                  className="border border-gray-300 rounded px-2 py-1 text-sm"
                  value={currentPosApiType}
                  onChange={handlePosApiTypeChange}
                  disabled={isReadOnly}
                >
                  {posApiTypeOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {canUsePosApi &&
              quickInfoEndpoints.map((endpoint) => (
                <button
                  key={`info-quick-${endpoint.id}`}
                  type="button"
                  onClick={() => handleQuickInfoAction(endpoint)}
                  disabled={isReadOnly}
                  className="px-3 py-1 text-sm rounded border border-indigo-300 bg-indigo-100 text-indigo-800"
                >
                  {endpoint.quickActionLabel}
                </button>
              ))}
            {canUsePosApi && infoEndpoints.length > 0 && (
              <button
                type="button"
                onClick={openInfoModal}
                disabled={isReadOnly}
                className="px-3 py-1 text-sm rounded border border-indigo-200 bg-indigo-50 text-indigo-700"
              >
                {t('posapi_open_info_lookup', 'POSAPI Lookups')}
              </button>
            )}
            {extraFooterContent}
            {canUsePosApi && posApiEndpointMeta && (
              <span className="text-xs text-gray-500">
                {(posApiEndpointMeta.method || 'POST').toUpperCase()} {posApiEndpointMeta.path || ''}
              </span>
            )}
          </div>
          <div className="text-right space-x-2">
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
            {showTemporarySaveButton && (
              <button
                type="button"
                onClick={handleTemporarySave}
                disabled={temporaryLocked}
                className="px-3 py-1 bg-yellow-400 text-gray-900 rounded"
              >
                {temporaryButtonLabel}
              </button>
            )}
            <button
              type="button"
              onClick={onCancel}
              className="px-3 py-1 bg-gray-200 rounded"
            >
              {t('cancel', 'Cancel')}
            </button>
            {canUsePosApi && (
              <button
                type="button"
                onClick={() => {
                  if (!issueEbarimtEnabled) return;
                  markSubmitIntent('ebarimt');
                  submitForm({ issueEbarimt: true, submitIntent: 'ebarimt' });
                }}
                className="px-3 py-1 bg-green-600 text-white rounded"
                disabled={!issueEbarimtEnabled || submitLocked}
              >
                {ebarimtButtonLabel}
              </button>
            )}
            {canPost && (
              <button
                type="submit"
                className="px-3 py-1 bg-blue-600 text-white rounded"
                disabled={submitLocked}
                onMouseDown={() => markSubmitIntent('post')}
              >
                {postButtonLabel}
              </button>
            )}
          </div>
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
        </div>
      </Modal>
      {infoModalOpen && (
        <Modal
          visible={infoModalOpen}
          title={
            activeInfoEndpoint?.modalTitle ||
            (activeInfoEndpoint?.displayLabel
              ? `${t('posapi_info_modal_title', 'POSAPI lookups')} – ${activeInfoEndpoint.displayLabel}`
              : t('posapi_info_modal_title', 'POSAPI lookups'))
          }
          onClose={closeInfoModal}
          width="600px"
        >
          <div className="flex flex-col gap-4">
            <label className="flex flex-col gap-1 text-sm text-gray-700">
              <span className="font-semibold">{t('posapi_info_endpoint_label', 'Endpoint')}</span>
              <select
                className="border border-gray-300 rounded px-2 py-1 text-sm"
                value={activeInfoEndpointId}
                onChange={(e) => handleChangeActiveInfoEndpoint(e.target.value)}
              >
                {infoEndpoints.map((endpoint) => {
                  const optionLabel =
                    endpoint.displayLabel || endpoint.name || endpoint.id;
                  return (
                    <option key={endpoint.id} value={endpoint.id}>
                      {optionLabel}
                    </option>
                  );
                })}
              </select>
            </label>
            {activeInfoEndpoint && (
              <div className="flex flex-col gap-3">
                <div className="text-xs text-gray-600">
                  <span className="font-semibold text-gray-700">{activeInfoEndpoint.method}</span>{' '}
                  <span className="font-mono">{activeInfoEndpoint.path}</span>
                </div>
                {activeInfoEndpoint.description && (
                  <div className="text-xs text-gray-500">
                    {activeInfoEndpoint.description}
                  </div>
                )}
                {activeInfoEndpoint.requestFields.length > 0 ? (
                  activeInfoEndpoint.requestFields.map((field) => {
                    const fieldName = field?.field;
                    if (!fieldName) return null;
                    const required = Boolean(field?.required);
                    const description = field?.description;
                    const value = infoPayload[fieldName] || '';
                    return (
                      <label
                        key={`info-field-${fieldName}`}
                        className="flex flex-col gap-1 text-sm text-gray-700"
                      >
                        <span className={required ? 'font-semibold text-red-600' : 'font-semibold'}>
                          {fieldName}
                          {required ? ' *' : ''}
                        </span>
                        <input
                          type="text"
                          className="border border-gray-300 rounded px-2 py-1 text-sm"
                          value={normalizeInputValue(value)}
                          onChange={(e) => handleInfoPayloadChange(fieldName, e.target.value)}
                        />
                        {description && (
                          <span className="text-xs text-gray-500">{description}</span>
                        )}
                      </label>
                    );
                  })
                ) : (
                  <p className="text-sm text-gray-600">
                    {t(
                      'posapi_info_no_fields',
                      'This endpoint does not require additional parameters.',
                    )}
                  </p>
                )}
                {activeInfoEndpoint.responseMappings.length > 0 && (
                  <div className="flex flex-col gap-1 text-sm text-gray-700">
                    <span className="font-semibold">
                      {t('posapi_info_mapped_fields', 'Mapped fields')}
                    </span>
                    <ul className="space-y-1 text-xs text-gray-600">
                      {activeInfoEndpoint.responseMappings.map((mapping) => (
                        <li key={`response-map-${mapping.field}-${mapping.target}`}>
                          <span
                            className={
                              mapping.required
                                ? 'font-semibold text-indigo-700'
                                : 'font-medium text-gray-700'
                            }
                          >
                            {mapping.targetLabel}
                            {mapping.required ? ' *' : ''}
                          </span>
                          <span className="ml-2 text-gray-500">
                            ← {mapping.field}
                            {mapping.description ? ` – ${mapping.description}` : ''}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
            {infoError && <div className="text-sm text-red-600">{infoError}</div>}
            {infoResponse && (
              <div className="flex flex-col gap-2">
                <span className="text-sm font-semibold text-gray-700">
                  {t('posapi_info_response', 'Response')}
                </span>
                <pre className="bg-gray-100 border border-gray-200 rounded p-2 text-xs overflow-x-auto">
                  {JSON.stringify(infoResponse, null, 2)}
                </pre>
              </div>
            )}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                className="px-3 py-1 bg-blue-600 text-white rounded"
                onClick={handleInvokeInfoEndpoint}
                disabled={infoLoading}
              >
                {infoLoading ? t('loading', 'Loading...') : t('posapi_info_invoke', 'Invoke')}
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="px-3 py-1 bg-gray-200 rounded"
                  onClick={closeInfoModal}
                >
                  {t('close', 'Close')}
                </button>
                <button
                  type="button"
                  className="px-3 py-1 bg-green-600 text-white rounded"
                  onClick={handleApplyInfoResponse}
                  disabled={!infoResponse}
                >
                  {t('posapi_info_apply', 'Apply to form')}
                </button>
              </div>
            </div>
            {infoHistory.length > 0 && (
              <div className="text-xs text-gray-500 space-y-1">
                <div className="font-semibold text-gray-600">
                  {t('posapi_info_recent', 'Recent lookups')}
                </div>
                <ul className="space-y-1">
                  {[...infoHistory].reverse().map((entry, index) => (
                    <li key={`${entry.timestamp}-${index}`}>
                      <span className="font-medium text-gray-700">{entry.endpointId}</span>{' '}
                      – {new Date(entry.timestamp).toLocaleString()}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </Modal>
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
    </>
  );
}

export default memo(RowFormModal);
