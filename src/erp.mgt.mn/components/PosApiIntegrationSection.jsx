import React, { useMemo, useEffect, useState, useCallback } from 'react';
import {
  POS_API_FIELDS,
  POS_API_ITEM_FIELDS,
  POS_API_PAYMENT_FIELDS,
  POS_API_RECEIPT_FIELDS,
  SERVICE_RECEIPT_FIELDS,
  SERVICE_PAYMENT_FIELDS,
  PAYMENT_METHOD_LABELS,
  BADGE_BASE_STYLE,
  REQUIRED_BADGE_STYLE,
  OPTIONAL_BADGE_STYLE,
  withPosApiEndpointMetadata,
  formatPosApiTypeLabel,
  formatPosApiTypeLabelText,
} from '../utils/posApiConfig.js';
import {
  buildMappingValue,
  normalizeMappingSelection,
} from '../utils/posApiFieldSource.js';

const DEFAULT_SESSION_VARIABLES = [
  'currentUserId',
  'userId',
  'username',
  'branchId',
  'departmentId',
  'companyId',
  'sessionId',
  'userRole',
];

const AGGREGATION_OPTIONS = [
  { value: '', label: 'No aggregation' },
  { value: 'sum', label: 'Sum' },
  { value: 'count', label: 'Count' },
  { value: 'min', label: 'Minimum' },
  { value: 'max', label: 'Maximum' },
  { value: 'avg', label: 'Average' },
];

function humanizeFieldLabel(key) {
  if (!key) return '';
  return String(key)
    .replace(/\[\]/g, '')
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^./, (c) => c.toUpperCase());
}

function parseBooleanFlag(value, fallback = false) {
  if (value === true || value === false) return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
  }
  return fallback;
}

function normalizeVariationDefaultMap(map = {}) {
  if (!map || typeof map !== 'object' || Array.isArray(map)) return {};
  const normalized = {};
  Object.entries(map).forEach(([path, value]) => {
    const key = typeof path === 'string' ? path.trim() : '';
    if (!key) return;
    if (value === undefined) return;
    normalized[key] = value;
  });
  return normalized;
}

function collectVariationDefaultsFromEndpoint(endpoint, variationKey) {
  if (!variationKey || !endpoint || typeof endpoint !== 'object') return {};
  const defaults = {};
  const mergeMap = (map) => {
    if (!map || typeof map !== 'object' || Array.isArray(map)) return;
    Object.entries(map).forEach(([path, value]) => {
      const key = typeof path === 'string' ? path.trim() : '';
      if (!key) return;
      if (value === undefined) return;
      defaults[key] = value;
    });
  };

  const variationEntry = Array.isArray(endpoint.variations)
    ? endpoint.variations.find(
        (entry) => entry && (entry.key === variationKey || entry.name === variationKey),
      )
    : null;
  if (variationEntry) {
    mergeMap(variationEntry.defaultValues);
    if (Array.isArray(variationEntry.requestFields)) {
      variationEntry.requestFields.forEach((field) => {
        const path = typeof field?.field === 'string' ? field.field.trim() : '';
        if (!path) return;
        const variationDefaults = field?.defaultByVariation || field?.defaultVariations || {};
        if (Object.prototype.hasOwnProperty.call(variationDefaults, variationKey)) {
          defaults[path] = variationDefaults[variationKey];
        }
      });
    }
  }

  if (Array.isArray(endpoint.requestFieldVariations)) {
    const variationMeta = endpoint.requestFieldVariations.find((entry) => entry?.key === variationKey);
    if (variationMeta) {
      mergeMap(variationMeta.defaultValues);
    }
  }

  if (Array.isArray(endpoint.requestFields)) {
    endpoint.requestFields.forEach((field) => {
      const path = typeof field?.field === 'string' ? field.field.trim() : '';
      if (!path) return;
      const variationDefaults = field?.defaultByVariation || field?.defaultVariations || {};
      if (Object.prototype.hasOwnProperty.call(variationDefaults, variationKey)) {
        defaults[path] = variationDefaults[variationKey];
      }
    });
  }

  return defaults;
}

function areVariationDefaultsEqual(a = {}, b = {}) {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((key) => Object.prototype.hasOwnProperty.call(b, key) && b[key] === a[key]);
}

function sanitizeResponseFieldMappings(mappings = {}) {
  if (!mappings || typeof mappings !== 'object') return {};
  const normalized = {};
  Object.entries(mappings).forEach(([field, target]) => {
    const key = typeof field === 'string' ? field.trim() : '';
    if (!key) return;
    if (target && typeof target === 'object' && !Array.isArray(target)) {
      const table = typeof target.table === 'string' ? target.table.trim() : '';
      const column = typeof target.column === 'string' ? target.column.trim() : '';
      const value = Object.prototype.hasOwnProperty.call(target, 'value') ? target.value : undefined;
      if (!column) return;
      normalized[key] = {
        ...(table ? { table } : {}),
        column,
        ...(value !== undefined && value !== '' ? { value } : {}),
      };
      return;
    }
    const column = typeof target === 'string' ? target.trim() : '';
    if (column) {
      normalized[key] = column;
    }
  });
  return normalized;
}

function normalizeResponseMappingValue(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const table = typeof value.table === 'string' ? value.table : '';
    const column = typeof value.column === 'string' ? value.column : '';
    const overrideValue = Object.prototype.hasOwnProperty.call(value, 'value') ? value.value : '';
    return { table, column, value: overrideValue };
  }
  const column = typeof value === 'string' ? value : '';
  return { table: '', column, value: '' };
}

function sanitizeResponseMappingSelection(selection) {
  const column = typeof selection.column === 'string' ? selection.column.trim() : '';
  const table = typeof selection.table === 'string' ? selection.table.trim() : '';
  const overrideValueRaw =
    selection && Object.prototype.hasOwnProperty.call(selection, 'value') ? selection.value : undefined;
  const overrideValue =
    overrideValueRaw !== undefined && overrideValueRaw !== null && `${overrideValueRaw}`.trim() !== ''
      ? overrideValueRaw
      : undefined;
  if (!column) return null;
  return {
    ...(table ? { table } : {}),
    column,
    ...(overrideValue !== undefined ? { value: overrideValue } : {}),
  };
}

function sanitizeSelectionList(list, allowMultiple) {
  const values = Array.isArray(list)
    ? list.map((value) => (typeof value === 'string' ? value.trim() : '')).filter(Boolean)
    : [];
  if (allowMultiple) return values;
  return values.slice(0, 1);
}

function normalizeRequestField(entry) {
  const fieldPath = typeof entry?.field === 'string' ? entry.field.trim() : '';
  if (!fieldPath) return null;
  return {
    path: fieldPath,
    key: fieldPath,
    label:
      typeof entry?.label === 'string' && entry.label.trim()
        ? entry.label.trim()
        : humanizeFieldLabel(fieldPath),
    required: Boolean(entry?.required || entry?.requiredCommon),
    description: typeof entry?.description === 'string' ? entry.description : '',
    aggregation: typeof entry?.aggregation === 'string' ? entry.aggregation : '',
  };
}

function splitFieldPath(path) {
  const parts = path.split('.');
  const fieldKey = parts.pop() || path;
  const objectPath = parts.join('.');
  return { objectPath, fieldKey };
}

function normalizeNestedPathsMap(nestedPaths = {}, supportsItems = false) {
  const defaults = {};
  if (supportsItems) {
    defaults.items = 'receipts[].items[]';
  }
  defaults.payments = supportsItems ? 'receipts[].payments[]' : 'payments[]';
  defaults.receipts = 'receipts[]';
  const map = { ...defaults };
  if (nestedPaths && typeof nestedPaths === 'object' && !Array.isArray(nestedPaths)) {
    Object.entries(nestedPaths).forEach(([key, value]) => {
      if (typeof value !== 'string') return;
      const normalized = value.trim();
      if (!normalized) return;
      map[key] = normalized;
    });
  }
  return map;
}

function buildRequestFieldStructure(requestFields = [], supportsItems = false, nestedPaths = {}) {
  const nestedPathMap = normalizeNestedPathsMap(nestedPaths, supportsItems);
  const normalizedFields = (Array.isArray(requestFields) ? requestFields : [])
    .map((entry) => normalizeRequestField(entry))
    .filter(Boolean);
  const objectMap = new Map();
  const registerField = (objectPath, field) => {
    const key = objectPath || '';
    const existing = objectMap.get(key) || {
      id: objectPath || key || 'root',
      key: objectPath ? objectPath.split('.').pop()?.replace(/\[\]/g, '') || key : 'root',
      path: objectPath,
      label: objectPath ? humanizeFieldLabel(objectPath.replace(/\[\]/g, '')) : 'Request',
      repeatable: objectPath.includes('[]'),
      fields: [],
    };
    existing.fields.push(field);
    objectMap.set(key, existing);
  };

  normalizedFields.forEach((field) => {
    const { objectPath, fieldKey } = splitFieldPath(field.path);
    registerField(objectPath, { ...field, key: fieldKey, label: field.label || humanizeFieldLabel(fieldKey) });
  });

  const rootFields = objectMap.get('')?.fields || [];
  const otherObjects = Array.from(objectMap.entries())
    .filter(([path]) => path !== '')
    .map(([, value]) => value);

  if (rootFields.length || otherObjects.length) {
    return { rootFields, objects: otherObjects };
  }

  const fallbackObjects = [];
  if (supportsItems) {
    const itemPath = nestedPathMap.items || 'receipts[].items[]';
    fallbackObjects.push({
      id: itemPath,
      key: 'items',
      path: itemPath,
      label: humanizeFieldLabel(itemPath.replace(/\[\]/g, '')),
      repeatable: itemPath.includes('[]'),
      fields: POS_API_ITEM_FIELDS.map((field) => ({
        ...field,
        path: `${itemPath}.${field.key}`,
        label: field.label || humanizeFieldLabel(field.key),
      })),
    });
  }

  const paymentsPath = nestedPathMap.payments || 'payments[]';
  fallbackObjects.push({
    id: paymentsPath,
    key: 'payments',
    path: paymentsPath,
    label: humanizeFieldLabel(paymentsPath.replace(/\[\]/g, '')),
    repeatable: paymentsPath.includes('[]'),
    fields: POS_API_PAYMENT_FIELDS.map((field) => ({
      ...field,
      path: `${paymentsPath}.${field.key}`,
      label: field.label || humanizeFieldLabel(field.key),
    })),
  });

  const receiptsPath = nestedPathMap.receipts || 'receipts[]';
  fallbackObjects.push({
    id: receiptsPath,
    key: 'receipts',
    path: receiptsPath,
    label: humanizeFieldLabel(receiptsPath.replace(/\[\]/g, '')),
    repeatable: receiptsPath.includes('[]'),
    fields: POS_API_RECEIPT_FIELDS.map((field) => ({
      ...field,
      path: `${receiptsPath}.${field.key}`,
      label: field.label || humanizeFieldLabel(field.key),
    })),
  });

  return {
    rootFields: POS_API_FIELDS.map((field) => ({
      ...field,
      path: field.key,
      label: field.label || humanizeFieldLabel(field.key),
    })),
    objects: fallbackObjects,
  };
}

function isMappingProvided(value) {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') return value.trim() !== '';
  if (typeof value !== 'object') return false;
  const keys = Object.keys(value);
  if (keys.length === 0) return false;
  if (value.value || value.envVar || value.sessionVar || value.expression) return true;
  if (value.column) return true;
  if (value.table) return true;
  if (typeof value.type === 'string') return true;
  return false;
}

function fieldMatchesFilter(field, filterText) {
  if (!filterText) return true;
  const haystack = `${field.label || ''} ${field.key || ''} ${field.path || ''}`
    .toLowerCase();
  return haystack.includes(filterText);
}

function applyFieldDefaults(target, fields = []) {
  if (!target || typeof target !== 'object') return;
  fields.forEach((field) => {
    const key = field?.key || field?.path || '';
    if (!key) return;
    if (!Object.prototype.hasOwnProperty.call(target, key)) {
      const fallback =
        field?.defaultValue !== undefined && field?.defaultValue !== null
          ? field.defaultValue
          : null;
      target[key] = fallback;
    }
  });
}

function ensurePathWithFields(target, path, fields = []) {
  if (!path) {
    applyFieldDefaults(target, fields);
    return target;
  }
  const segments = path.split('.').filter(Boolean);
  let cursor = target;
  segments.forEach((segment, idx) => {
    const isArray = segment.endsWith('[]');
    const key = isArray ? segment.slice(0, -2) : segment;
    if (!key) return;
    if (isArray) {
      if (!Array.isArray(cursor[key])) {
        cursor[key] = [{}];
      }
      if (cursor[key].length === 0) cursor[key].push({});
      cursor = cursor[key][0];
    } else {
      if (!cursor[key] || typeof cursor[key] !== 'object' || Array.isArray(cursor[key])) {
        cursor[key] = {};
      }
      cursor = cursor[key];
    }
    if (idx === segments.length - 1) {
      applyFieldDefaults(cursor, fields);
    }
  });
  return target;
}

function mergeSamples(skeleton, sample) {
  if (Array.isArray(sample) || Array.isArray(skeleton)) {
    const sourceArray = Array.isArray(sample) ? sample : Array.isArray(skeleton) ? skeleton : [];
    if (sourceArray.length === 0 && Array.isArray(skeleton)) return skeleton;
    return sourceArray.map((entry, idx) => mergeSamples(skeleton?.[idx] || {}, entry));
  }
  if (sample && typeof sample === 'object') {
    const base = skeleton && typeof skeleton === 'object' ? { ...skeleton } : {};
    Object.entries(sample).forEach(([key, val]) => {
      base[key] = mergeSamples(base[key], val);
    });
    return base;
  }
  if (sample === undefined) return skeleton;
  return sample;
}

function buildHierarchicalSample(structure, baseSample) {
  const skeleton = {};
  applyFieldDefaults(skeleton, structure?.rootFields || []);
  (structure?.objects || []).forEach((obj) => {
    ensurePathWithFields(skeleton, obj.path || obj.id || obj.key, obj.fields || []);
  });
  return mergeSamples(skeleton, baseSample);
}

export function MappingFieldSelector({
  value,
  onChange,
  primaryTableName,
  tableOptions = [],
  masterColumns = [],
  columnsByTable = {},
  datalistIdBase,
  defaultTableLabel = 'Master table',
  disabled = false,
  allowExpression = true,
  onTableSelect = () => {},
  sessionVariables = [],
}) {
  const selection = normalizeMappingSelection(value, primaryTableName);
  const currentType = selection.type || 'column';
  const selectedTable = currentType === 'column' ? selection.table || '' : '';
  const columns = currentType === 'column'
    ? selectedTable
      ? columnsByTable[selectedTable] || []
      : masterColumns
    : [];
  const listId = `${datalistIdBase}-${selectedTable || 'master'}`;
  const sessionListId = `${datalistIdBase}-session`;

  const handleTypeChange = (nextType) => {
    const base = { ...selection, type: nextType };
    if (nextType !== 'column') {
      base.table = '';
      base.column = '';
    }
    onChange(buildMappingValue(base, { preserveType: true }));
  };

  const handleTableChange = (tbl) => {
    if (tbl) onTableSelect(tbl);
    onChange(
      buildMappingValue({
        type: 'column',
        table: tbl,
        column: selection.column,
      }, { preserveType: true }),
    );
  };

  const handleColumnChange = (col) => {
    onChange(
      buildMappingValue({
        type: 'column',
        table: selectedTable,
        column: col,
      }, { preserveType: true }),
    );
  };

  const handleScalarChange = (key, val) => {
    const base = { ...selection, type: currentType, [key]: val };
    onChange(buildMappingValue(base, { preserveType: true }));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <select
          value={currentType}
          onChange={(e) => handleTypeChange(e.target.value)}
          disabled={disabled}
          style={{ minWidth: '140px' }}
        >
          <option value="column">Transaction field</option>
          <option value="literal">Literal value</option>
          <option value="env">Environment variable</option>
          <option value="session">Session variable</option>
          {allowExpression && <option value="expression">Expression</option>}
        </select>
        {currentType === 'column' ? (
          <>
            <select
              value={selectedTable}
              onChange={(e) => handleTableChange(e.target.value)}
              disabled={disabled}
              style={{ minWidth: '140px' }}
            >
              <option value="">{defaultTableLabel}</option>
              {tableOptions.map((tbl) => (
                <option key={`${datalistIdBase}-tbl-${tbl}`} value={tbl}>
                  {tbl}
                </option>
              ))}
              {selectedTable &&
                !tableOptions.includes(selectedTable) &&
                selectedTable !== '' && (
                  <option value={selectedTable}>{selectedTable}</option>
                )}
            </select>
            <input
              type="text"
              list={listId}
              value={selection.column || ''}
              onChange={(e) => handleColumnChange(e.target.value)}
              placeholder="Column"
              disabled={disabled}
              style={{ flex: '1 1 140px', minWidth: '140px' }}
            />
            <datalist id={listId}>
              {(columns || []).map((col) => (
                <option key={`${datalistIdBase}-${selectedTable || 'master'}-${col}`} value={col} />
              ))}
            </datalist>
          </>
        ) : currentType === 'literal' ? (
          <input
            type="text"
            value={selection.value || ''}
            onChange={(e) => handleScalarChange('value', e.target.value)}
            placeholder="e.g., cash"
            disabled={disabled}
            style={{ flex: '1 1 200px', minWidth: '200px' }}
          />
        ) : currentType === 'env' ? (
          <input
            type="text"
            value={selection.envVar || ''}
            onChange={(e) => handleScalarChange('envVar', e.target.value)}
            placeholder="ENV_VAR_NAME"
            disabled={disabled}
            style={{ flex: '1 1 200px', minWidth: '200px' }}
          />
        ) : currentType === 'session' ? (
          <>
            <input
              type="text"
              list={sessionListId}
              value={selection.sessionVar || ''}
              onChange={(e) => handleScalarChange('sessionVar', e.target.value)}
              placeholder="currentUserId"
              disabled={disabled}
              style={{ flex: '1 1 200px', minWidth: '200px' }}
            />
            <datalist id={sessionListId}>
              {sessionVariables.map((variable) => (
                <option key={`${sessionListId}-${variable}`} value={variable} />
              ))}
            </datalist>
          </>
        ) : (
          <input
            type="text"
            value={selection.expression || ''}
            onChange={(e) => handleScalarChange('expression', e.target.value)}
            placeholder="Expression or formula"
            disabled={disabled}
            style={{ flex: '1 1 200px', minWidth: '200px' }}
          />
        )}
      </div>
    </div>
  );
}

export default function PosApiIntegrationSection({
  config,
  setConfig,
  sectionStyle,
  sectionTitleStyle,
  fieldColumnStyle,
  primaryTableName,
  primaryTableColumns = [],
  columnOptions = [],
  tableColumns = {},
  itemTableOptions = [],
  posApiEndpoints = [],
  itemFieldMapping = {},
  paymentFieldMapping = {},
  receiptFieldMapping = {},
  receiptGroupMapping = {},
  paymentMethodMapping = {},
  responseFieldMapping = {},
  onEnsureColumnsLoaded = () => {},
  onPosApiOptionsChange = () => {},
}) {
  const objectFieldMappings =
    config.posApiMapping &&
    typeof config.posApiMapping.objectFields === 'object' &&
    !Array.isArray(config.posApiMapping.objectFields)
      ? config.posApiMapping.objectFields
      : {};
  const endpointCandidates = useMemo(() => {
    const list = [];
    const addEndpoint = (endpoint, usageFallback = 'other') => {
      if (!endpoint) return;
      const enriched = withPosApiEndpointMetadata(endpoint);
      const id = typeof enriched?.id === 'string' ? enriched.id.trim() : '';
      if (!id) return;
      if (list.some((entry) => entry?.id === id)) return;
      list.push({ ...enriched, usage: enriched?.usage || usageFallback });
    };

    if (Array.isArray(posApiEndpoints)) {
      posApiEndpoints.forEach((endpoint) => addEndpoint(endpoint, endpoint?.usage || 'other'));
    }

    addEndpoint(config.posApiEndpointMeta, 'transaction');
    if (config.posApiEndpointId) {
      addEndpoint({ id: config.posApiEndpointId, usage: 'transaction' }, 'transaction');
    }

    const infoEndpointMeta = Array.isArray(config.posApiInfoEndpointMeta)
      ? config.posApiInfoEndpointMeta
      : [];
    infoEndpointMeta.forEach((meta) => addEndpoint(meta, 'info'));

    const infoEndpointIds = Array.isArray(config.posApiInfoEndpointIds)
      ? config.posApiInfoEndpointIds
      : [];
    infoEndpointIds.forEach((id) => addEndpoint({ id, usage: 'info' }, 'info'));

    return list;
  }, [
    posApiEndpoints,
    config.posApiEndpointMeta,
    config.posApiEndpointId,
    config.posApiInfoEndpointMeta,
    config.posApiInfoEndpointIds,
  ]);

  const endpointOptionGroups = useMemo(() => {
    const base = {
      transaction: [],
      info: [],
      admin: [],
      other: [],
    };
    endpointCandidates.forEach((endpoint) => {
      if (!endpoint) return;
      const id = typeof endpoint.id === 'string' ? endpoint.id.trim() : '';
      if (!id) return;
      const name = typeof endpoint.name === 'string' ? endpoint.name : '';
      const label = name ? `${id} – ${name}` : id;
      const usage = typeof endpoint.usage === 'string' ? endpoint.usage : 'other';
      const option = {
        value: id,
        label,
        defaultForForm: Boolean(endpoint.defaultForForm),
      };
      if (usage === 'transaction') {
        base.transaction.push(option);
      } else if (usage === 'info') {
        base.info.push(option);
      } else if (usage === 'admin') {
        base.admin.push(option);
      } else {
        base.other.push(option);
      }
    });
    base.transaction.sort((a, b) => a.label.localeCompare(b.label));
    base.info.sort((a, b) => a.label.localeCompare(b.label));
    base.admin.sort((a, b) => a.label.localeCompare(b.label));
    return base;
  }, [endpointCandidates]);

  const transactionEndpointOptions = endpointOptionGroups.transaction;
  const infoEndpointOptions = endpointOptionGroups.info;

  const selectedEndpoint = useMemo(() => {
    let endpoint = null;
    if (config.posApiEndpointId) {
      const match = endpointCandidates.find(
        (candidate) => candidate?.id === config.posApiEndpointId,
      );
      if (match) endpoint = match;
    }
    if (!endpoint && config.posApiEndpointMeta) {
      endpoint = withPosApiEndpointMetadata(config.posApiEndpointMeta);
    }
    if (!endpoint) return null;
    const next = { ...endpoint };
    const hasItemMapping =
      config.posApiMapping &&
      typeof config.posApiMapping === 'object' &&
      (config.posApiMapping.itemFields || config.posApiMapping.itemsField);
    if (hasItemMapping) {
      next.supportsItems = true;
    }
    return next;
  }, [endpointCandidates, config.posApiEndpointId, config.posApiEndpointMeta, config.posApiMapping]);

  const responseMappingFromConfig = useMemo(
    () => sanitizeResponseFieldMappings(config.posApiResponseMapping || responseFieldMapping),
    [config.posApiResponseMapping, responseFieldMapping],
  );

  const endpointResponseMappings = useMemo(
    () => sanitizeResponseFieldMappings(selectedEndpoint?.responseFieldMappings),
    [selectedEndpoint],
  );

  useEffect(() => {
    if (!config.posApiEnabled) return;
    const defaults = endpointResponseMappings;
    if (!defaults || !Object.keys(defaults).length) return;
    setConfig((prev) => {
      const current = sanitizeResponseFieldMappings(prev.posApiResponseMapping);
      if (Object.keys(current).length) return prev;
      return { ...prev, posApiResponseMapping: defaults };
    });
  }, [endpointResponseMappings, config.posApiEnabled, setConfig]);

  const responseFieldHints = useMemo(() => {
    const hints = new Map();
    const fields = Array.isArray(selectedEndpoint?.responseFields) ? selectedEndpoint.responseFields : [];
    fields.forEach((entry) => {
      const field = typeof entry?.field === 'string' ? entry.field.trim() : typeof entry === 'string' ? entry.trim() : '';
      if (!field) return;
      const description = typeof entry?.description === 'string' ? entry.description : '';
      const required = Boolean(entry?.required || entry?.requiredCommon);
      hints.set(field, {
        field,
        label: entry?.label || humanizeFieldLabel(field),
        description,
        required,
      });
    });
    Object.entries(endpointResponseMappings).forEach(([field, mapping]) => {
      if (hints.has(field)) return;
      hints.set(field, {
        field,
        label: humanizeFieldLabel(field),
        description: '',
        required: false,
        mapping,
      });
    });
    Object.entries(responseMappingFromConfig).forEach(([field, mapping]) => {
      if (hints.has(field)) return;
      hints.set(field, {
        field,
        label: humanizeFieldLabel(field),
        description: '',
        required: false,
        mapping,
      });
    });
    return Array.from(hints.values());
  }, [endpointResponseMappings, responseMappingFromConfig, selectedEndpoint]);

  const responseTableOptions = useMemo(() => {
    const options = new Set();
    if (primaryTableName) options.add(primaryTableName);
    (config.tables || []).forEach((entry) => {
      const tbl = typeof entry?.table === 'string' ? entry.table.trim() : '';
      if (tbl) options.add(tbl);
    });
    return Array.from(options);
  }, [config.tables, primaryTableName]);

  const nestedObjects = useMemo(
    () => (Array.isArray(selectedEndpoint?.nestedObjects) ? selectedEndpoint.nestedObjects : []),
    [selectedEndpoint],
  );
  const requestStructure = useMemo(
    () =>
      buildRequestFieldStructure(
        selectedEndpoint?.requestFields || [],
        selectedEndpoint?.supportsItems !== false,
        selectedEndpoint?.mappingHints?.nestedPaths || {},
      ),
    [selectedEndpoint],
  );
  const [fieldFilter, setFieldFilter] = useState('');
  const normalizedFieldFilter = fieldFilter.trim().toLowerCase();
  const filterFieldList = useCallback(
    (fields = []) => {
      if (!normalizedFieldFilter) return fields;
      return (fields || []).filter((field) => fieldMatchesFilter(field, normalizedFieldFilter));
    },
    [normalizedFieldFilter],
  );
  const requestObjects = requestStructure.objects || [];
  const itemsObject =
    selectedEndpoint?.supportsItems === false
      ? null
      : requestObjects.find(
          (obj) => obj.key === 'items' || obj.path.endsWith('items[]') || obj.id.endsWith('items[]'),
        );
  const paymentsObject = requestObjects.find(
    (obj) => obj.key === 'payments' || obj.path.endsWith('payments[]') || obj.id.endsWith('payments[]'),
  );
  const receiptsObject = requestObjects.find(
    (obj) => obj.key === 'receipts' || obj.path.endsWith('receipts[]') || obj.id.endsWith('receipts[]'),
  );
  const additionalObjects = requestObjects.filter(
    (obj) => !['items', 'payments', 'receipts'].includes(obj.key),
  );
  const filteredRequestObjects = useMemo(() => {
    if (!normalizedFieldFilter) return requestObjects;
    return requestObjects.filter((obj) => {
      const matchesObject = fieldMatchesFilter(obj, normalizedFieldFilter);
      const matchesChild = (obj.fields || []).some((field) =>
        fieldMatchesFilter(field, normalizedFieldFilter),
      );
      return matchesObject || matchesChild;
    });
  }, [requestObjects, normalizedFieldFilter]);

  const endpointSupportsItems = selectedEndpoint?.supportsItems !== false;
  const endpointReceiptItemsEnabled =
    selectedEndpoint && selectedEndpoint.supportsItems !== false
      ? selectedEndpoint.enableReceiptItems !== false
      : endpointSupportsItems;
  const receiptTypesFeatureEnabled =
    config.posApiEnabled &&
    endpointSupportsItems &&
    selectedEndpoint?.enableReceiptTypes !== false &&
    Array.isArray(selectedEndpoint?.receiptTypes);
  const receiptTaxTypesFeatureEnabled =
    config.posApiEnabled && endpointSupportsItems && selectedEndpoint?.enableReceiptTaxTypes !== false;
  const paymentMethodsFeatureEnabled =
    config.posApiEnabled &&
    selectedEndpoint?.supportsMultiplePayments !== false &&
    selectedEndpoint?.enablePaymentMethods !== false;
  const supportsItems = config.posApiEnabled && endpointSupportsItems && endpointReceiptItemsEnabled;

  const baseRequestSample = useMemo(() => {
    if (selectedEndpoint && selectedEndpoint.requestSample && typeof selectedEndpoint.requestSample === 'object') {
      return selectedEndpoint.requestSample;
    }
    return {};
  }, [selectedEndpoint]);

  const hierarchicalRequestSample = useMemo(
    () => buildHierarchicalSample(requestStructure, baseRequestSample || {}),
    [requestStructure, baseRequestSample],
  );

  const requestSampleText = useMemo(() => {
    try {
      return JSON.stringify(hierarchicalRequestSample || {}, null, 2);
    } catch {
      return '{}';
    }
  }, [hierarchicalRequestSample]);

  const requestVariations = useMemo(() => {
    if (!selectedEndpoint || !Array.isArray(selectedEndpoint.variations)) return [];
    return selectedEndpoint.variations.filter((variation) => variation && variation.enabled !== false);
  }, [selectedEndpoint]);

  const selectedVariationKey = config.posApiRequestVariation || '';
  const selectedVariation =
    requestVariations.find((variation) => variation.key === selectedVariationKey) || null;
  const derivedVariationDefaults = useMemo(() => {
    if (!selectedVariationKey) return {};
    const endpointDefaults = collectVariationDefaultsFromEndpoint(
      selectedEndpoint || {},
      selectedVariationKey,
    );
    const normalizedEndpointDefaults = normalizeVariationDefaultMap(endpointDefaults);
    if (Object.keys(normalizedEndpointDefaults).length) return normalizedEndpointDefaults;
    return normalizeVariationDefaultMap(config.posApiVariationDefaults);
  }, [config.posApiVariationDefaults, selectedVariationKey, selectedEndpoint]);

  useEffect(() => {
    const normalizedDefaults = normalizeVariationDefaultMap(derivedVariationDefaults);
    setConfig((prev) => {
      const nextVariation = selectedVariationKey;
      const prevVariation = prev.posApiRequestVariation || '';
      const prevDefaults = normalizeVariationDefaultMap(prev.posApiVariationDefaults);
      const defaultsChanged = !areVariationDefaultsEqual(prevDefaults, normalizedDefaults);
      if (prevVariation === nextVariation && !defaultsChanged) return prev;
      return {
        ...prev,
        posApiRequestVariation: nextVariation,
        posApiVariationDefaults: normalizedDefaults,
      };
    });
  }, [derivedVariationDefaults, selectedVariationKey, setConfig]);
  const variationSampleText = useMemo(() => {
    let payload = selectedVariation?.requestExample || selectedVariation?.request;
    if (!payload) {
      const raw = selectedVariation?.requestExampleText || selectedVariation?.request;
      if (typeof raw === 'string') {
        try {
          payload = JSON.parse(raw);
        } catch {
          return raw;
        }
      }
    }
    const merged = buildHierarchicalSample(requestStructure, payload || {});
    try {
      return JSON.stringify(merged || {}, null, 2);
    } catch {
      return selectedVariation?.requestExampleText || '';
    }
  }, [selectedVariation, requestStructure]);

  const receiptTypesAllowMultiple = receiptTypesFeatureEnabled
    ? selectedEndpoint?.allowMultipleReceiptTypes !== false
    : true;
  const receiptTaxTypesAllowMultiple = receiptTaxTypesFeatureEnabled
    ? selectedEndpoint?.allowMultipleReceiptTaxTypes !== false
    : true;
  const paymentMethodsAllowMultiple = paymentMethodsFeatureEnabled
    ? selectedEndpoint?.supportsMultiplePayments === false
      ? false
      : selectedEndpoint?.allowMultiplePaymentMethods !== false
    : true;

  const endpointReceiptTypes = useMemo(() => {
    if (!receiptTypesFeatureEnabled) return [];
    if (
      selectedEndpoint &&
      Array.isArray(selectedEndpoint.receiptTypes) &&
      selectedEndpoint.receiptTypes.length
    ) {
      return selectedEndpoint.receiptTypes.map((value) => String(value));
    }
    return [];
  }, [selectedEndpoint, receiptTypesFeatureEnabled]);

  const configuredReceiptTypes = useMemo(() => {
    if (!receiptTypesFeatureEnabled) return [];
    return sanitizeSelectionList(config.posApiReceiptTypes, receiptTypesAllowMultiple);
  }, [config.posApiReceiptTypes, receiptTypesFeatureEnabled, receiptTypesAllowMultiple]);

  const endpointReceiptTaxTypes = useMemo(() => {
    if (!receiptTaxTypesFeatureEnabled) return [];
    if (
      selectedEndpoint &&
      Array.isArray(selectedEndpoint.receiptTaxTypes) &&
      selectedEndpoint.receiptTaxTypes.length
    ) {
      return selectedEndpoint.receiptTaxTypes.map((value) => String(value));
    }
    return [];
  }, [selectedEndpoint, receiptTaxTypesFeatureEnabled]);

  const configuredReceiptTaxTypes = useMemo(() => {
    if (!receiptTaxTypesFeatureEnabled) return [];
    return sanitizeSelectionList(
      config.posApiReceiptTaxTypes,
      receiptTaxTypesAllowMultiple,
    );
  }, [
    config.posApiReceiptTaxTypes,
    receiptTaxTypesFeatureEnabled,
    receiptTaxTypesAllowMultiple,
  ]);

  const effectiveReceiptTypes = useMemo(() => {
    if (!receiptTypesFeatureEnabled) return [];
    return configuredReceiptTypes.length ? configuredReceiptTypes : endpointReceiptTypes;
  }, [configuredReceiptTypes, endpointReceiptTypes, receiptTypesFeatureEnabled]);

  const receiptTypeUniverse = useMemo(() => {
    if (!receiptTypesFeatureEnabled) return [];
    const allowed = new Set((endpointReceiptTypes || []).filter(Boolean));
    const combined = Array.from(
      new Set([...endpointReceiptTypes, ...configuredReceiptTypes].filter((value) => value)),
    );
    const filtered = combined.filter(
      (value) => allowed.has(value) || configuredReceiptTypes.includes(value),
    );
    if (filtered.length) return filtered;
    return endpointReceiptTypes;
  }, [endpointReceiptTypes, configuredReceiptTypes, receiptTypesFeatureEnabled]);

  const effectiveReceiptTaxTypes = useMemo(() => {
    if (!receiptTaxTypesFeatureEnabled) return [];
    return configuredReceiptTaxTypes.length
      ? configuredReceiptTaxTypes
      : endpointReceiptTaxTypes;
  }, [
    configuredReceiptTaxTypes,
    endpointReceiptTaxTypes,
    receiptTaxTypesFeatureEnabled,
  ]);

  const receiptTaxTypeUniverse = useMemo(() => {
    if (!receiptTaxTypesFeatureEnabled) return [];
    const allowed = new Set((endpointReceiptTaxTypes || []).filter(Boolean));
    const combined = Array.from(
      new Set([...endpointReceiptTaxTypes, ...configuredReceiptTaxTypes].filter((value) => value)),
    );
    const filtered = combined.filter(
      (value) => allowed.has(value) || configuredReceiptTaxTypes.includes(value),
    );
    if (filtered.length) return filtered;
    return endpointReceiptTaxTypes;
  }, [endpointReceiptTaxTypes, configuredReceiptTaxTypes, receiptTaxTypesFeatureEnabled]);

  const endpointPaymentMethods = useMemo(() => {
    if (!paymentMethodsFeatureEnabled) return [];
    if (
      selectedEndpoint &&
      Array.isArray(selectedEndpoint.paymentMethods) &&
      selectedEndpoint.paymentMethods.length
    ) {
      return selectedEndpoint.paymentMethods.map((value) => String(value));
    }
    return [];
  }, [selectedEndpoint, paymentMethodsFeatureEnabled]);

  const configuredPaymentMethods = useMemo(() => {
    if (!paymentMethodsFeatureEnabled) return [];
    return sanitizeSelectionList(config.posApiPaymentMethods, paymentMethodsAllowMultiple);
  }, [config.posApiPaymentMethods, paymentMethodsFeatureEnabled, paymentMethodsAllowMultiple]);

  const effectivePaymentMethods = useMemo(() => {
    if (!paymentMethodsFeatureEnabled) return [];
    return configuredPaymentMethods.length ? configuredPaymentMethods : endpointPaymentMethods;
  }, [configuredPaymentMethods, endpointPaymentMethods, paymentMethodsFeatureEnabled]);

  const paymentMethodUniverse = useMemo(() => {
    if (!paymentMethodsFeatureEnabled) return [];
    const allowed = new Set((endpointPaymentMethods || []).filter(Boolean));
    const combined = Array.from(
      new Set([...endpointPaymentMethods, ...configuredPaymentMethods].filter((value) => value)),
    );
    const filtered = combined.filter(
      (value) => allowed.has(value) || configuredPaymentMethods.includes(value),
    );
    if (filtered.length) return filtered;
    return endpointPaymentMethods;
  }, [endpointPaymentMethods, configuredPaymentMethods, paymentMethodsFeatureEnabled]);

  useEffect(() => {
    if (typeof onPosApiOptionsChange !== 'function') return;
    onPosApiOptionsChange({
      transactionEndpointOptions,
      endpointReceiptTypes,
      endpointPaymentMethods,
      receiptTypesAllowMultiple,
      paymentMethodsAllowMultiple,
    });
  }, [
    onPosApiOptionsChange,
      transactionEndpointOptions,
      endpointReceiptTypes,
      endpointPaymentMethods,
      receiptTypesAllowMultiple,
      paymentMethodsAllowMultiple,
    ]);

  const topLevelFieldHints = useMemo(() => {
    const hints = selectedEndpoint?.mappingHints?.topLevelFields;
    if (!Array.isArray(hints)) return {};
    const map = {};
    hints.forEach((entry) => {
      if (!entry || typeof entry.field !== 'string') return;
      map[entry.field] = {
        required: Boolean(entry.required),
        description: typeof entry.description === 'string' ? entry.description : '',
        aggregation: typeof entry.aggregation === 'string' ? entry.aggregation : '',
      };
    });
    return map;
  }, [selectedEndpoint]);

  const itemFieldHints = useMemo(() => {
    const source = selectedEndpoint?.mappingHints?.itemFields;
    if (!Array.isArray(source)) return {};
    const map = {};
    source.forEach((entry) => {
      if (!entry || typeof entry.field !== 'string') return;
      map[entry.field] = {
        required: Boolean(entry.required),
        description: typeof entry.description === 'string' ? entry.description : '',
        aggregation: typeof entry.aggregation === 'string' ? entry.aggregation : '',
      };
    });
    return map;
  }, [selectedEndpoint]);

  const receiptFieldHints = useMemo(() => {
    const source = selectedEndpoint?.mappingHints?.receiptFields;
    if (!Array.isArray(source)) return {};
    const map = {};
    source.forEach((entry) => {
      if (!entry || typeof entry.field !== 'string') return;
      map[entry.field] = {
        required: Boolean(entry.required),
        description: typeof entry.description === 'string' ? entry.description : '',
        aggregation: typeof entry.aggregation === 'string' ? entry.aggregation : '',
      };
    });
    return map;
  }, [selectedEndpoint]);

  const paymentFieldHints = useMemo(() => {
    const source = selectedEndpoint?.mappingHints?.paymentFields;
    if (!Array.isArray(source)) return {};
    const map = {};
    source.forEach((entry) => {
      if (!entry || typeof entry.field !== 'string') return;
      map[entry.field] = {
        required: Boolean(entry.required),
        description: typeof entry.description === 'string' ? entry.description : '',
        aggregation: typeof entry.aggregation === 'string' ? entry.aggregation : '',
      };
    });
    return map;
  }, [selectedEndpoint]);

  const receiptGroupHints = useMemo(() => {
    const source = selectedEndpoint?.mappingHints?.receiptGroups;
    if (!Array.isArray(source)) return {};
    const map = {};
    source.forEach((group) => {
      const type = typeof group?.type === 'string' ? group.type : '';
      if (!type) return;
      const fieldMap = {};
      (group.fields || []).forEach((field) => {
        if (!field || typeof field.field !== 'string') return;
        fieldMap[field.field] = {
          required: Boolean(field.required),
          description: typeof field.description === 'string' ? field.description : '',
        };
      });
      map[type] = fieldMap;
    });
    return map;
  }, [selectedEndpoint]);

  const paymentMethodHints = useMemo(() => {
    const source = selectedEndpoint?.mappingHints?.paymentMethods;
    if (!Array.isArray(source)) return {};
    const map = {};
    source.forEach((method) => {
      const code = typeof method?.method === 'string' ? method.method : '';
      if (!code) return;
      const fieldMap = {};
      (method.fields || []).forEach((field) => {
        if (!field || typeof field.field !== 'string') return;
        fieldMap[field.field] = {
          required: Boolean(field.required),
          description: typeof field.description === 'string' ? field.description : '',
        };
      });
      map[code] = fieldMap;
    });
    return map;
  }, [selectedEndpoint]);

  const serviceReceiptGroupTypes = useMemo(() => {
    if (!receiptTaxTypesFeatureEnabled) return [];
    const base = effectiveReceiptTaxTypes.length
      ? effectiveReceiptTaxTypes
      : endpointReceiptTaxTypes;
    const hintKeys = Object.keys(receiptGroupHints || {});
    const configuredKeys = Object.keys(receiptGroupMapping || {});
    const combined = Array.from(new Set([...base, ...hintKeys, ...configuredKeys])).filter(
      Boolean,
    );
    if (combined.length) return combined;
    return ['VAT_ABLE'];
  }, [
    receiptGroupHints,
    receiptGroupMapping,
    endpointReceiptTaxTypes,
    effectiveReceiptTaxTypes,
    receiptTaxTypesFeatureEnabled,
  ]);

  const servicePaymentMethodCodes = useMemo(() => {
    if (!paymentMethodsFeatureEnabled) return [];
    const selected = effectivePaymentMethods || [];
    const selectedSet = new Set(selected);
    const hintKeys = Object.keys(paymentMethodHints || {});
    const configuredKeys = Object.keys(paymentMethodMapping || {});
    const endpointKeys = endpointPaymentMethods || [];
    const base = selected.length > 0 ? selected : endpointKeys;
    const combined = new Set([
      ...base,
      ...configuredKeys,
      ...hintKeys.filter((code) => selectedSet.size === 0 || selectedSet.has(code)),
    ]);
    return Array.from(combined).filter((value) => {
      if (!value) return false;
      if (selectedSet.size === 0) return true;
      return selectedSet.has(value) || configuredKeys.includes(value);
    });
  }, [
    effectivePaymentMethods,
    paymentMethodHints,
      paymentMethodMapping,
      endpointPaymentMethods,
      paymentMethodsFeatureEnabled,
    ]);

  const primaryPosApiFields = useMemo(() => {
    const candidates = requestStructure.rootFields.length
      ? requestStructure.rootFields
      : POS_API_FIELDS.map((field) => ({
        ...field,
        path: field.key,
        label: field.label || humanizeFieldLabel(field.key),
      }));
    const filtered = supportsItems
      ? candidates
      : candidates.filter((field) =>
          ['itemsField', 'paymentsField', 'receiptsField'].includes(field.key) ? false : true,
        );
    return filtered.map((field) => ({
      ...field,
      label: field.label || humanizeFieldLabel(field.key),
    }));
  }, [requestStructure.rootFields, supportsItems]);

  const itemMappingFields = useMemo(() => {
    if (itemsObject?.fields?.length) return itemsObject.fields;
    return [];
  }, [itemsObject]);

  const paymentMappingFields = useMemo(() => {
    if (paymentsObject?.fields?.length) return paymentsObject.fields;
    return POS_API_PAYMENT_FIELDS.map((field) => ({
      ...field,
      path: field.key,
      label: field.label || humanizeFieldLabel(field.key),
    }));
  }, [paymentsObject]);

  const receiptMappingFields = useMemo(() => {
    if (receiptsObject?.fields?.length) return receiptsObject.fields;
    return POS_API_RECEIPT_FIELDS.map((field) => ({
      ...field,
      path: field.key,
      label: field.label || humanizeFieldLabel(field.key),
    }));
  }, [receiptsObject]);

  const filteredRootFields = useMemo(
    () => filterFieldList(requestStructure.rootFields || []),
    [requestStructure.rootFields, filterFieldList],
  );
  const filteredPrimaryFields = useMemo(
    () => filterFieldList(primaryPosApiFields),
    [primaryPosApiFields, filterFieldList],
  );
  const filteredItemFields = useMemo(
    () => filterFieldList(itemMappingFields),
    [itemMappingFields, filterFieldList],
  );
  const filteredPaymentFields = useMemo(
    () => filterFieldList(paymentMappingFields),
    [paymentMappingFields, filterFieldList],
  );
  const filteredReceiptFields = useMemo(
    () => filterFieldList(receiptMappingFields),
    [receiptMappingFields, filterFieldList],
  );

  const nestedSourceMapping =
    config.posApiMapping &&
    typeof config.posApiMapping.nestedSources === 'object' &&
    !Array.isArray(config.posApiMapping.nestedSources)
      ? config.posApiMapping.nestedSources
      : {};
  const nestedObjectSelection =
    config.posApiMapping &&
    typeof config.posApiMapping.nestedSelection === 'object' &&
    !Array.isArray(config.posApiMapping.nestedSelection)
      ? config.posApiMapping.nestedSelection
      : {};

  const fieldsFromPosApiText = useMemo(() => {
    return Array.isArray(config.fieldsFromPosApi) ? config.fieldsFromPosApi.join('\n') : '';
  }, [config.fieldsFromPosApi]);

  const getObjectFieldMapping = (object, legacyFallback = {}) => {
    if (!object) return legacyFallback || {};
    const candidates = [
      objectFieldMappings[object.id],
      objectFieldMappings[object.path],
      objectFieldMappings[object.key],
    ].filter((candidate) => candidate && typeof candidate === 'object' && !Array.isArray(candidate));
    if (candidates.length) return candidates[0];
    if (legacyFallback && typeof legacyFallback === 'object' && !Array.isArray(legacyFallback)) {
      return legacyFallback;
    }
    return {};
  };

  const updateObjectFieldMapping = (objectId, fieldKey, value, legacySection) => {
    const targetId = objectId || legacySection || 'object';
    setConfig((c) => {
      const base = { ...(c.posApiMapping || {}) };
      const objectFields =
        base.objectFields && typeof base.objectFields === 'object' && !Array.isArray(base.objectFields)
          ? { ...base.objectFields }
          : {};
      const existing =
        objectFields[targetId] &&
        typeof objectFields[targetId] === 'object' &&
        !Array.isArray(objectFields[targetId])
          ? { ...objectFields[targetId] }
          : {};
      const trimmed =
        typeof value === 'string'
          ? value.trim()
          : value && typeof value === 'object'
            ? value
            : value;
      const isEmptyObject = typeof trimmed === 'object' && trimmed !== null && !Array.isArray(trimmed)
        ? Object.keys(trimmed).length === 0
        : false;
      if (
        trimmed === undefined ||
        trimmed === null ||
        (typeof trimmed === 'string' && trimmed.trim() === '') ||
        isEmptyObject
      ) {
        delete existing[fieldKey];
      } else {
        existing[fieldKey] = trimmed;
      }
      if (Object.keys(existing).length) {
        objectFields[targetId] = existing;
      } else {
        delete objectFields[targetId];
      }
      if (Object.keys(objectFields).length) {
        base.objectFields = objectFields;
      } else {
        delete base.objectFields;
      }
      if (legacySection) {
        const legacy =
          base[legacySection] &&
          typeof base[legacySection] === 'object' &&
          !Array.isArray(base[legacySection])
            ? { ...base[legacySection] }
            : {};
        if (
          trimmed === undefined ||
          trimmed === null ||
          (typeof trimmed === 'string' && trimmed.trim() === '') ||
          isEmptyObject
        ) {
          delete legacy[fieldKey];
        } else {
          legacy[fieldKey] = trimmed;
        }
        if (Object.keys(legacy).length) {
          base[legacySection] = legacy;
        } else {
          delete base[legacySection];
        }
      }
      return { ...c, posApiMapping: base };
    });
  };

  const handleInfoEndpointChange = (event) => {
    const selected = Array.from(event.target.selectedOptions || [])
      .map((opt) => opt.value)
      .filter((value) => value);
    setConfig((c) => ({
      ...c,
      posApiInfoEndpointIds: selected,
      infoEndpoints: selected,
    }));
  };

  const handleFieldsFromPosApiChange = (value) => {
    const entries = value
      .split(/\r?\n/)
      .map((item) => item.trim())
      .filter((item) => item);
    setConfig((c) => ({ ...c, fieldsFromPosApi: entries }));
  };

  const updatePosApiMapping = (field, value) => {
    setConfig((c) => {
      const next = { ...(c.posApiMapping || {}) };
      const trimmed =
        typeof value === 'string'
          ? value.trim()
          : value && typeof value === 'object'
            ? value
            : value;
      if (
        trimmed === undefined ||
        trimmed === null ||
        (typeof trimmed === 'string' && trimmed.trim() === '') ||
        (typeof trimmed === 'object' && !Object.keys(trimmed).length)
      ) {
        delete next[field];
      } else {
        next[field] = trimmed;
      }
      return { ...c, posApiMapping: next };
    });
  };

  const applyAggregationToMapping = useCallback(
    (value, aggregation) => {
      const normalized = normalizeMappingSelection(value, primaryTableName);
      const next = { ...normalized, aggregation: aggregation || '' };
      return buildMappingValue(next, { preserveType: true });
    },
    [primaryTableName],
  );

  const updateResponseFieldMapping = (field, selection) => {
    setConfig((c) => {
      const current = sanitizeResponseFieldMappings(c.posApiResponseMapping);
      const sanitized = sanitizeResponseMappingSelection(selection);
      const next = { ...current };
      if (!sanitized) {
        delete next[field];
      } else {
        next[field] = sanitized;
      }
      return { ...c, posApiResponseMapping: next };
    });
  };

  const updatePosApiNestedMapping = (section, field, value) => {
    const targetObjectId =
      section === 'itemFields'
        ? itemsObject?.id || 'items'
        : section === 'paymentFields'
          ? paymentsObject?.id || 'payments'
          : section === 'receiptFields'
            ? receiptsObject?.id || 'receipts'
            : section;
    updateObjectFieldMapping(targetObjectId, field, value, section);
  };

  const updateNestedObjectSource = (path, sourceValue, repeatValue) => {
    setConfig((c) => {
      const base = { ...(c.posApiMapping || {}) };
      const allSources =
        base.nestedSources && typeof base.nestedSources === 'object' && !Array.isArray(base.nestedSources)
          ? { ...base.nestedSources }
          : {};
      const existing =
        allSources[path] && typeof allSources[path] === 'object' && !Array.isArray(allSources[path])
          ? { ...allSources[path] }
          : {};
      const next = { ...existing };
      if (sourceValue !== undefined) {
        const normalizedSource = typeof sourceValue === 'string' ? sourceValue.trim() : sourceValue;
        if (normalizedSource) {
          next.source = normalizedSource;
        } else {
          delete next.source;
        }
      }
      if (repeatValue !== undefined) {
        next.repeat = repeatValue;
      }
      if (Object.keys(next).length) {
        allSources[path] = next;
      } else {
        delete allSources[path];
      }
      if (Object.keys(allSources).length) {
        base.nestedSources = allSources;
      } else {
        delete base.nestedSources;
      }
      return { ...c, posApiMapping: base };
    });
  };

  const updateNestedObjectSelection = (path, include) => {
    setConfig((c) => {
      const base = { ...(c.posApiMapping || {}) };
      const selection =
        base.nestedSelection && typeof base.nestedSelection === 'object' && !Array.isArray(base.nestedSelection)
          ? { ...base.nestedSelection }
          : {};
      if (include) {
        selection[path] = true;
      } else {
        delete selection[path];
      }
      if (Object.keys(selection).length) {
        base.nestedSelection = selection;
      } else {
        delete base.nestedSelection;
      }
      return { ...c, posApiMapping: base };
    });
  };

  const updateReceiptGroupMapping = (type, field, value) => {
    setConfig((c) => {
      const base = { ...(c.posApiMapping || {}) };
      const allGroups =
        base.receiptGroups && typeof base.receiptGroups === 'object' && !Array.isArray(base.receiptGroups)
          ? { ...base.receiptGroups }
          : {};
      const group =
        allGroups[type] && typeof allGroups[type] === 'object' && !Array.isArray(allGroups[type])
          ? { ...allGroups[type] }
          : {};
      const trimmed = typeof value === 'string' ? value.trim() : value;
      if (!trimmed) {
        delete group[field];
      } else {
        group[field] = trimmed;
      }
      if (Object.keys(group).length) {
        allGroups[type] = group;
      } else {
        delete allGroups[type];
      }
      if (Object.keys(allGroups).length) {
        base.receiptGroups = allGroups;
      } else {
        delete base.receiptGroups;
      }
      return { ...c, posApiMapping: base };
    });
  };

  const updatePaymentMethodMapping = (method, field, value) => {
    setConfig((c) => {
      const base = { ...(c.posApiMapping || {}) };
      const allMethods =
        base.paymentMethods && typeof base.paymentMethods === 'object' && !Array.isArray(base.paymentMethods)
          ? { ...base.paymentMethods }
          : {};
      const methodConfig =
        allMethods[method] && typeof allMethods[method] === 'object' && !Array.isArray(allMethods[method])
          ? { ...allMethods[method] }
          : {};
      const trimmed = typeof value === 'string' ? value.trim() : value;
      if (!trimmed) {
        delete methodConfig[field];
      } else {
        methodConfig[field] = trimmed;
      }
      if (Object.keys(methodConfig).length) {
        allMethods[method] = methodConfig;
      } else {
        delete allMethods[method];
      }
      if (Object.keys(allMethods).length) {
        base.paymentMethods = allMethods;
      } else {
        delete base.paymentMethods;
      }
      return { ...c, posApiMapping: base };
    });
  };

  const toggleReceiptTypeSelection = (value) => {
    if (!receiptTypesFeatureEnabled) return;
    const normalized = typeof value === 'string' ? value.trim() : '';
    if (!normalized) return;
    setConfig((c) => {
      const current = Array.isArray(c.posApiReceiptTypes)
        ? c.posApiReceiptTypes.filter((entry) => typeof entry === 'string' && entry.trim())
        : [];
      const selectedSet = new Set(current);
      if (selectedSet.has(normalized)) {
        selectedSet.delete(normalized);
      } else {
        if (receiptTypesAllowMultiple) {
          selectedSet.add(normalized);
        } else {
          selectedSet.clear();
          selectedSet.add(normalized);
        }
      }
      const ordered = endpointReceiptTypes.filter((entry) => selectedSet.has(entry));
      const leftovers = Array.from(selectedSet).filter(
        (entry) => !endpointReceiptTypes.includes(entry),
      );
      return { ...c, posApiReceiptTypes: [...ordered, ...leftovers] };
    });
  };

  const toggleReceiptTaxTypeSelection = (value) => {
    if (!receiptTaxTypesFeatureEnabled) return;
    const normalized = typeof value === 'string' ? value.trim() : '';
    if (!normalized) return;
    setConfig((c) => {
      const current = Array.isArray(c.posApiReceiptTaxTypes)
        ? c.posApiReceiptTaxTypes.filter((entry) => typeof entry === 'string' && entry.trim())
        : [];
      const selectedSet = new Set(current);
      if (selectedSet.has(normalized)) {
        selectedSet.delete(normalized);
      } else {
        if (receiptTaxTypesAllowMultiple) {
          selectedSet.add(normalized);
        } else {
          selectedSet.clear();
          selectedSet.add(normalized);
        }
      }
      const ordered = endpointReceiptTaxTypes.filter((entry) => selectedSet.has(entry));
      const leftovers = Array.from(selectedSet).filter(
        (entry) => !endpointReceiptTaxTypes.includes(entry),
      );
      return { ...c, posApiReceiptTaxTypes: [...ordered, ...leftovers] };
    });
  };

  const togglePaymentMethodSelection = (value) => {
    if (!paymentMethodsFeatureEnabled) return;
    const normalized = typeof value === 'string' ? value.trim() : '';
    if (!normalized) return;
    setConfig((c) => {
      const current = Array.isArray(c.posApiPaymentMethods)
        ? c.posApiPaymentMethods.filter((entry) => typeof entry === 'string' && entry.trim())
        : [];
      const selectedSet = new Set(current);
      if (selectedSet.has(normalized)) {
        selectedSet.delete(normalized);
      } else {
        if (paymentMethodsAllowMultiple) {
          selectedSet.add(normalized);
        } else {
          selectedSet.clear();
          selectedSet.add(normalized);
        }
      }
      const ordered = endpointPaymentMethods.filter((entry) => selectedSet.has(entry));
      const leftovers = Array.from(selectedSet).filter(
        (entry) => !endpointPaymentMethods.includes(entry),
      );
      return { ...c, posApiPaymentMethods: [...ordered, ...leftovers] };
    });
  };

  const resolvedItemFieldMapping = useMemo(
    () => getObjectFieldMapping(itemsObject, itemFieldMapping),
    [itemsObject, itemFieldMapping, objectFieldMappings],
  );
  const resolvedPaymentFieldMapping = useMemo(
    () => getObjectFieldMapping(paymentsObject, paymentFieldMapping),
    [paymentsObject, paymentFieldMapping, objectFieldMappings],
  );
  const resolvedReceiptFieldMapping = useMemo(
    () => getObjectFieldMapping(receiptsObject, receiptFieldMapping),
    [receiptsObject, receiptFieldMapping, objectFieldMappings],
  );

  const primaryTableLabel = primaryTableName ? `${primaryTableName} (master)` : 'Master table';

  return (
    <section style={sectionStyle}>
      <h3 style={sectionTitleStyle}>POS API Integration</h3>
      <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
        <input
          type="checkbox"
          checked={Boolean(config.posApiEnabled)}
          onChange={(e) => setConfig((c) => ({ ...c, posApiEnabled: e.target.checked }))}
        />
        <span>Enable POSAPI submission</span>
      </label>
      {config.posApiEnabled && (
        <>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '1rem',
              marginBottom: '0.5rem',
            }}
          >
            <label style={{ ...fieldColumnStyle, flex: '1 1 240px' }}>
              <span style={{ fontWeight: 600 }}>Primary endpoint</span>
              <select
                value={config.posApiEndpointId}
                disabled={!config.posApiEnabled}
                onChange={(e) => setConfig((c) => ({ ...c, posApiEndpointId: e.target.value }))}
              >
                <option value="">Use registry default</option>
                {transactionEndpointOptions.map((endpoint) => (
                  <option key={`endpoint-${endpoint.value}`} value={endpoint.value}>
                    {endpoint.label}
                    {endpoint.defaultForForm ? ' (form default)' : ''}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ ...fieldColumnStyle, flex: '1 1 240px' }}>
              <span style={{ fontWeight: 600 }}>Info endpoints</span>
              <select
                multiple
                value={config.posApiInfoEndpointIds || []}
                onChange={handleInfoEndpointChange}
                disabled={!config.posApiEnabled}
                style={{ minHeight: `${Math.max(3, infoEndpointOptions.length || 0)}rem` }}
              >
                {infoEndpointOptions.map((endpoint) => (
                  <option key={`info-${endpoint.value}`} value={endpoint.value}>
                    {endpoint.label}
                  </option>
                ))}
              </select>
              <small style={{ color: '#666' }}>
                Hold Ctrl (Cmd on macOS) to select multiple endpoints.
              </small>
            </label>
            <label style={{ ...fieldColumnStyle, flex: '1 1 240px' }}>
              <span style={{ fontWeight: 600 }}>Type field override</span>
              <input
                type="text"
                placeholder="Column name"
                value={config.posApiTypeField}
                onChange={(e) => setConfig((c) => ({ ...c, posApiTypeField: e.target.value }))}
                disabled={!config.posApiEnabled}
              />
              <small style={{ color: '#666' }}>
                Optional column containing the POSAPI type (e.g., B2C).
              </small>
            </label>
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: '0.75rem',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              <strong>Request sample</strong>
              <p style={{ fontSize: '0.85rem', color: '#555', margin: 0 }}>
                Base payload provided by the POSAPI endpoint. This is used when building transactions.
              </p>
              <textarea
                value={requestSampleText}
                readOnly
                rows={8}
                style={{ fontFamily: 'monospace', resize: 'vertical' }}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <strong>Request variations</strong>
                <span style={{ ...BADGE_BASE_STYLE, background: '#e0f2fe', color: '#075985' }}>
                  {requestVariations.length}
                </span>
              </div>
              <p style={{ fontSize: '0.85rem', color: '#555', margin: 0 }}>
                Choose a variation to prefill transaction requests. Unset to use the base sample.
              </p>
              <select
                value={selectedVariationKey}
                onChange={(e) =>
                  setConfig((c) => ({ ...c, posApiRequestVariation: e.target.value }))
                }
                disabled={!config.posApiEnabled}
              >
                <option value="">Use base sample</option>
                {requestVariations.map((variation) => (
                  <option key={variation.key} value={variation.key}>
                    {variation.name || variation.key}
                  </option>
                ))}
              </select>
              {selectedVariation && (
                <>
                  {selectedVariation.description && (
                    <small style={{ color: '#444' }}>{selectedVariation.description}</small>
                  )}
                  <textarea
                    value={variationSampleText}
                    readOnly
                    rows={6}
                    style={{ fontFamily: 'monospace', resize: 'vertical' }}
                  />
                </>
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              <strong>Request object tree</strong>
              <p style={{ fontSize: '0.85rem', color: '#555', margin: 0 }}>
                Review the hierarchical payload structure (including nested arrays). Toggle whether
                an object can repeat.
              </p>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                  gap: '0.75rem',
                }}
              >
                <div
                  style={{
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    padding: '0.75rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.35rem',
                  }}
                >
                  <span style={{ fontWeight: 700 }}>Root</span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                    {filteredRootFields.map((field) => (
                      <span
                        key={`root-${field.path || field.key}`}
                        style={{
                          ...BADGE_BASE_STYLE,
                          background: '#eef2ff',
                          color: '#312e81',
                        }}
                      >
                        {field.label || field.key}
                      </span>
                    ))}
                    {filteredRootFields.length === 0 && (
                      <small style={{ color: '#666' }}>No root-level fields matched.</small>
                    )}
                  </div>
                </div>
                {filteredRequestObjects.map((obj) => {
                  const repeatable = parseBooleanFlag(
                    nestedSourceMapping?.[obj.path]?.repeat,
                    obj.repeatable,
                  );
                  const filteredFields = filterFieldList(obj.fields || []);
                  return (
                    <div
                      key={`tree-${obj.path}`}
                      style={{
                        border: '1px solid #e5e7eb',
                        borderRadius: '8px',
                        padding: '0.75rem',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.4rem',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ fontWeight: 700 }}>{obj.label || obj.path}</span>
                        <span
                          style={{
                            ...BADGE_BASE_STYLE,
                            background: repeatable ? '#dcfce7' : '#e2e8f0',
                            color: repeatable ? '#15803d' : '#334155',
                          }}
                        >
                          {repeatable ? 'Allow multiple' : 'Single'}
                        </span>
                      </div>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                        <input
                          type="checkbox"
                          checked={repeatable}
                          onChange={(e) => updateNestedObjectSource(obj.path, undefined, e.target.checked)}
                          disabled={!config.posApiEnabled}
                        />
                        <span>Allow multiple instances</span>
                      </label>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                        {filteredFields.map((field) => (
                          <span
                            key={`tree-${obj.path}-${field.path || field.key}`}
                            style={{
                              ...BADGE_BASE_STYLE,
                              background: '#f0f9ff',
                              color: '#075985',
                            }}
                          >
                            {field.label || field.key}
                          </span>
                        ))}
                        {filteredFields.length === 0 && (
                          <small style={{ color: '#666' }}>No matching fields.</small>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </>
      )}
      {config.posApiEnabled && (
        <>
      {receiptTypesFeatureEnabled && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <strong>Receipt types</strong>
            <p style={{ fontSize: '0.85rem', color: '#555' }}>
              Enable the POSAPI receipt types available for this form. Leave all selected to allow
              automatic detection.
            </p>
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '0.75rem',
                alignItems: 'flex-start',
              }}
            >
              {receiptTypeUniverse.map((type) => {
                const checked = effectiveReceiptTypes.includes(type);
                const inputType = receiptTypesAllowMultiple ? 'checkbox' : 'radio';
                return (
                  <label
                    key={`pos-receipt-type-${type}`}
                    style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                  >
                    <input
                      type={inputType}
                      checked={checked}
                      onChange={() => toggleReceiptTypeSelection(type)}
                      disabled={!config.posApiEnabled}
                    />
                    <span>{formatPosApiTypeLabelText(type)}</span>
                  </label>
                );
              })}
            </div>
          </div>
          {paymentMethodsFeatureEnabled && (
            <div>
              <strong>Payment methods</strong>
              <p style={{ fontSize: '0.85rem', color: '#555' }}>
                Enable the POSAPI payment methods allowed for this form. Leave all selected to allow
                automatic detection.
              </p>
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '0.75rem',
                  alignItems: 'flex-start',
                }}
              >
                {paymentMethodUniverse.map((method) => {
                  const checked = effectivePaymentMethods.includes(method);
                  const inputType = paymentMethodsAllowMultiple ? 'checkbox' : 'radio';
                  return (
                    <label
                      key={`pos-payment-method-${method}`}
                      style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                    >
                      <input
                        type={inputType}
                        checked={checked}
                        onChange={() => togglePaymentMethodSelection(method)}
                        disabled={!config.posApiEnabled}
                      />
                      <span>{PAYMENT_METHOD_LABELS[method] || method.replace(/_/g, ' ')}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
      {receiptTaxTypesFeatureEnabled && (
        <div style={{ marginTop: '1rem' }}>
          <strong>Receipt tax types</strong>
          <p style={{ fontSize: '0.85rem', color: '#555' }}>
            Restrict the tax-type codes that can be assigned to generated receipts. Leave all
            selected to allow automatic detection.
          </p>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '0.75rem',
              alignItems: 'flex-start',
            }}
          >
            {receiptTaxTypeUniverse.map((taxType) => {
              const checked = effectiveReceiptTaxTypes.includes(taxType);
              const inputType = receiptTaxTypesAllowMultiple ? 'checkbox' : 'radio';
              return (
                <label
                  key={`pos-receipt-tax-${taxType}`}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                >
                  <input
                    type={inputType}
                    checked={checked}
                    onChange={() => toggleReceiptTaxTypeSelection(taxType)}
                    disabled={!config.posApiEnabled}
                  />
                  <span>{taxType.replace(/_/g, ' ')}</span>
                </label>
              );
            })}
          </div>
        </div>
      )}
      <label
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '0.25rem',
          marginBottom: '0.75rem',
        }}
      >
        <span style={{ fontWeight: 600 }}>Capture response fields</span>
        <textarea
          rows={3}
          value={fieldsFromPosApiText}
          onChange={(e) => handleFieldsFromPosApiChange(e.target.value)}
          placeholder={'id\nlottery\nqrData'}
          disabled={!config.posApiEnabled}
          style={{ fontFamily: 'monospace', resize: 'vertical' }}
        />
        <small style={{ color: '#666' }}>
          One field path per line (e.g., receipts[0].billId) to persist on the transaction record.
        </small>
      </label>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '0.75rem' }}>
        <strong>Response field mapping</strong>
        <p style={{ fontSize: '0.85rem', color: '#555' }}>
          Map POSAPI response fields to transaction columns. Defaults from the selected endpoint are
          applied automatically when available.
        </p>
        {responseFieldHints.length === 0 ? (
          <small style={{ color: '#666' }}>No response field hints available for this endpoint.</small>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
              gap: '0.75rem',
            }}
          >
            {responseFieldHints.map((field) => {
              const endpointMapping = endpointResponseMappings[field.field];
              const mappingSource =
                responseMappingFromConfig[field.field] ??
                endpointMapping ??
                { table: primaryTableName || '', column: '' };
              const mapping = normalizeResponseMappingValue(mappingSource);
              const selectedTable = mapping.table || primaryTableName || '';
              const availableColumns = selectedTable
                ? tableColumns[selectedTable] || []
                : primaryTableColumns;
              const datalistId = `posapi-response-${field.field}-columns-${selectedTable || 'master'}`;
              const required = Boolean(field.required);
              return (
                <div
                  key={`response-map-${field.field}`}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.35rem',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    padding: '0.75rem',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 600 }}>{field.label || field.field}</span>
                    <span
                      style={{
                        ...BADGE_BASE_STYLE,
                        ...(required ? REQUIRED_BADGE_STYLE : OPTIONAL_BADGE_STYLE),
                      }}
                    >
                      {required ? 'Required' : 'Optional'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
                    <select
                      value={selectedTable}
                      onChange={(e) => {
                        const table = e.target.value;
                        if (table) onEnsureColumnsLoaded(table);
                        updateResponseFieldMapping(field.field, { ...mapping, table });
                      }}
                      disabled={!config.posApiEnabled}
                      style={{ minWidth: '140px' }}
                    >
                      <option value="">{primaryTableName ? `Default (${primaryTableName})` : '-- select table --'}</option>
                      {responseTableOptions.map((tbl) => (
                        <option key={`resp-table-${field.field}-${tbl}`} value={tbl}>
                          {tbl}
                        </option>
                      ))}
                    </select>
                    <input
                      type="text"
                      list={datalistId}
                      value={mapping.column || ''}
                      onChange={(e) =>
                        updateResponseFieldMapping(field.field, { ...mapping, column: e.target.value })
                      }
                      placeholder="Column"
                      disabled={!config.posApiEnabled}
                      style={{ flex: '1 1 160px', minWidth: '160px' }}
                    />
                    <datalist id={datalistId}>
                      {(availableColumns || []).map((col) => (
                        <option key={`${datalistId}-${col}`} value={col} />
                      ))}
                    </datalist>
                    <input
                      type="text"
                      value={mapping.value ?? ''}
                      onChange={(e) =>
                        updateResponseFieldMapping(field.field, { ...mapping, value: e.target.value })
                      }
                      placeholder="Override value (optional)"
                      disabled={!config.posApiEnabled}
                      style={{ flex: '1 1 160px', minWidth: '160px' }}
                    />
                  </div>
                  {field.description && <small style={{ color: '#555' }}>{field.description}</small>}
                  {endpointMapping && (
                    <small style={{ color: '#666' }}>
                      Endpoint default:{' '}
                      {typeof endpointMapping === 'string'
                        ? endpointMapping
                        : [endpointMapping.table, endpointMapping.column].filter(Boolean).join('.')}
                    </small>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
      <div>
        <strong>Field mapping</strong>
        <p style={{ fontSize: '0.85rem', color: '#555' }}>
          Map POSAPI fields to columns in the master transaction table. Leave blank to skip optional
          fields.
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
          <input
            type="text"
            value={fieldFilter}
            onChange={(e) => setFieldFilter(e.target.value)}
            placeholder="Search fields or paths"
            style={{ flex: '1 1 220px', minWidth: '220px' }}
          />
          <small style={{ color: '#666' }}>Filters across top-level and nested objects.</small>
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '0.75rem',
            marginTop: '0.5rem',
          }}
        >
          {filteredPrimaryFields.map((field) => {
            const listId = `posapi-${field.key}-columns`;
            const hint = topLevelFieldHints[field.key] || {};
            const isRequired = Boolean(hint.required);
            const description = hint.description;
            const mappedValue = config.posApiMapping?.[field.key];
            const missingRequired = isRequired && !isMappingProvided(mappedValue);
            return (
              <label
                key={field.key}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.25rem',
                  border: missingRequired ? '1px solid #ef4444' : '1px solid transparent',
                  borderRadius: '8px',
                  padding: missingRequired ? '0.5rem' : 0,
                }}
              >
                <span
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    fontWeight: 600,
                    color: '#0f172a',
                  }}
                >
                  {field.label}
                  <span
                    style={{
                      ...BADGE_BASE_STYLE,
                      ...(isRequired ? REQUIRED_BADGE_STYLE : OPTIONAL_BADGE_STYLE),
                    }}
                  >
                    {isRequired ? 'Required' : 'Optional'}
                  </span>
                  {missingRequired && (
                    <span
                      style={{
                        ...BADGE_BASE_STYLE,
                        background: '#fef2f2',
                        color: '#991b1b',
                      }}
                    >
                      Not mapped
                    </span>
                  )}
                </span>
                <MappingFieldSelector
                  value={mappedValue}
                  onChange={(val) => updatePosApiMapping(field.key, val)}
                  primaryTableName={primaryTableName}
                  masterColumns={columnOptions}
                  columnsByTable={tableColumns}
                  tableOptions={itemTableOptions}
                  datalistIdBase={listId}
                  disabled={!config.posApiEnabled}
                  sessionVariables={DEFAULT_SESSION_VARIABLES}
                />
                {description && <small style={{ color: '#555' }}>{description}</small>}
              </label>
            );
          })}
        </div>
        {nestedObjects.length > 0 && (
          <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <strong>Nested objects</strong>
            <p style={{ fontSize: '0.85rem', color: '#555' }}>
              Choose the data source for each repeatable object within the POSAPI payload. Leave the
              source blank to use the master transaction row.
            </p>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                gap: '0.75rem',
              }}
            >
              {nestedObjects.map((obj) => {
                const mapping =
                  nestedSourceMapping?.[obj.path] && typeof nestedSourceMapping[obj.path] === 'object'
                    ? nestedSourceMapping[obj.path]
                    : {};
                const repeat = parseBooleanFlag(mapping.repeat, obj.repeatable);
                const include =
                  nestedObjectSelection && Object.prototype.hasOwnProperty.call(nestedObjectSelection, obj.path)
                    ? Boolean(nestedObjectSelection[obj.path])
                    : true;
                return (
                  <div
                    key={`nested-${obj.path}`}
                    style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ fontWeight: 600 }}>{obj.label || obj.path}</span>
                      <span
                        style={{
                          ...BADGE_BASE_STYLE,
                          ...(repeat ? REQUIRED_BADGE_STYLE : OPTIONAL_BADGE_STYLE),
                        }}
                      >
                        {repeat ? 'Repeat per source' : 'Single instance'}
                      </span>
                    </div>
                    <input
                      type="text"
                      value={mapping.source || ''}
                      placeholder="Array source (e.g., transactions_inventory.records)"
                      onChange={(e) => updateNestedObjectSource(obj.path, e.target.value)}
                      disabled={!config.posApiEnabled}
                    />
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <input
                        type="checkbox"
                        checked={repeat}
                        onChange={(e) => updateNestedObjectSource(obj.path, undefined, e.target.checked)}
                        disabled={!config.posApiEnabled || obj.repeatable === false}
                      />
                      <span>Repeat for each record in the source</span>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <input
                        type="checkbox"
                        checked={include}
                        onChange={(e) => updateNestedObjectSelection(obj.path, e.target.checked)}
                        disabled={!config.posApiEnabled}
                      />
                      <span>Include this object in the request</span>
                    </label>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {additionalObjects.length > 0 && (
          <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <strong>Additional object mappings</strong>
            <p style={{ fontSize: '0.85rem', color: '#555' }}>
              Map fields for additional POSAPI objects defined by the endpoint. Use table-qualified
              columns (e.g., <code>table.column</code>) or select a table below.
            </p>
            <div className="space-y-4">
              {additionalObjects.map((obj) => {
                const filteredFields = filterFieldList(obj.fields || []);
                if (
                  normalizedFieldFilter &&
                  filteredFields.length === 0 &&
                  !fieldMatchesFilter(obj, normalizedFieldFilter)
                ) {
                  return null;
                }
                const mapping = getObjectFieldMapping(obj, {});
                const tableChoices = Array.from(
                  new Set([primaryTableName, ...itemTableOptions.filter(Boolean)]),
                ).filter(Boolean);
                return (
                  <div
                    key={`request-object-${obj.id}`}
                    style={{
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      padding: '0.75rem',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.5rem',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <span style={{ fontWeight: 700 }}>{obj.label}</span>
                      {obj.path && (
                        <span style={{ fontSize: '0.9rem', color: '#4b5563' }}>
                          Path: <code>{obj.path}</code>
                        </span>
                      )}
                    </div>
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                        gap: '0.75rem',
                      }}
                    >
                      {filteredFields.map((field) => {
                        const normalizedMapping = normalizeMappingSelection(mapping[field.key], primaryTableName);
                        const aggregationValue =
                          normalizedMapping.aggregation || field.aggregation || '';
                        return (
                          <div
                            key={`obj-${obj.id}-${field.key}`}
                            style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}
                          >
                            <span style={{ fontWeight: 600, color: '#0f172a' }}>
                              {field.label || humanizeFieldLabel(field.key)}
                            </span>
                            <MappingFieldSelector
                              value={mapping[field.key]}
                              onChange={(val) => {
                                const parsed = normalizeMappingSelection(val, primaryTableName);
                                if (parsed.table) onEnsureColumnsLoaded(parsed.table);
                                const nextValue = buildMappingValue(
                                  { ...parsed, aggregation: aggregationValue },
                                  { preserveType: true },
                                );
                                updateObjectFieldMapping(obj.id, field.key, nextValue, 'objectFields');
                              }}
                              primaryTableName={primaryTableName}
                              tableOptions={tableChoices}
                              masterColumns={primaryTableColumns}
                              columnsByTable={tableColumns}
                              datalistIdBase={`posapi-object-${obj.id}-${field.key}`}
                              defaultTableLabel={primaryTableLabel}
                              disabled={!config.posApiEnabled}
                              sessionVariables={DEFAULT_SESSION_VARIABLES}
                            />
                            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                              <span style={{ color: '#475569', fontSize: '0.9rem' }}>Aggregation</span>
                              <select
                                value={aggregationValue}
                                onChange={(e) =>
                                  updateObjectFieldMapping(
                                    obj.id,
                                    field.key,
                                    applyAggregationToMapping(mapping[field.key], e.target.value),
                                    'objectFields',
                                  )
                                }
                                disabled={!config.posApiEnabled || !isMappingProvided(mapping[field.key])}
                                style={{ minWidth: '140px' }}
                              >
                                {AGGREGATION_OPTIONS.map((option) => (
                                  <option
                                    key={`object-agg-${obj.id}-${field.key}-${option.value || 'none'}`}
                                    value={option.value}
                                  >
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                            </label>
                            {field.description && (
                              <small style={{ color: '#555' }}>{field.description}</small>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {supportsItems && (
          <>
            <div style={{ marginTop: '1rem' }}>
              <strong>Item field mapping</strong>
              <p style={{ fontSize: '0.85rem', color: '#555' }}>
                Choose the source table and column for each item property. Leave the table blank to
                read from the master record or enter a custom JSON path.
              </p>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                  gap: '0.75rem',
                  marginTop: '0.5rem',
                }}
              >
                {filteredItemFields.map((field) => {
                  const filteredChoices = (itemTableOptions || [])
                    .filter((tbl) => {
                      if (!tbl) return false;
                      if (!primaryTableName) return true;
                      return tbl !== primaryTableName;
                    })
                    .slice();
                  if (
                    selectedTable &&
                    selectedTable !== '' &&
                    (!primaryTableName || selectedTable !== primaryTableName) &&
                    !filteredChoices.includes(selectedTable)
                  ) {
                    filteredChoices.unshift(selectedTable);
                  }
                  const itemHint = itemFieldHints[field.key] || {};
                  const itemRequired = Boolean(itemHint.required);
                  const itemDescription = itemHint.description;
                  const mappedValue = resolvedItemFieldMapping[field.key];
                  const aggregationValue =
                    normalizeMappingSelection(mappedValue, primaryTableName).aggregation
                    || itemHint.aggregation
                    || '';
                  const missingRequired = itemRequired && !isMappingProvided(mappedValue);
                  return (
                    <div
                      key={`item-${field.key}`}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.5rem',
                        border: missingRequired ? '1px solid #ef4444' : '1px solid transparent',
                        borderRadius: '8px',
                        padding: missingRequired ? '0.5rem' : 0,
                      }}
                    >
                      <span
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.5rem',
                          fontWeight: 600,
                          color: '#0f172a',
                        }}
                      >
                        {field.label}
                        <span
                          style={{
                            ...BADGE_BASE_STYLE,
                            ...(itemRequired ? REQUIRED_BADGE_STYLE : OPTIONAL_BADGE_STYLE),
                          }}
                        >
                          {itemRequired ? 'Required' : 'Optional'}
                        </span>
                        {missingRequired && (
                          <span
                            style={{
                              ...BADGE_BASE_STYLE,
                              background: '#fef2f2',
                              color: '#991b1b',
                            }}
                          >
                            Not mapped
                          </span>
                        )}
                      </span>
                      <MappingFieldSelector
                        value={mappedValue}
                        onChange={(val) => {
                          const parsedSelection = normalizeMappingSelection(val, primaryTableName);
                          if (parsedSelection.table) onEnsureColumnsLoaded(parsedSelection.table);
                          const nextValue = buildMappingValue(
                            { ...parsedSelection, aggregation: aggregationValue },
                            { preserveType: true },
                          );
                          updatePosApiNestedMapping('itemFields', field.key, nextValue);
                        }}
                        primaryTableName={primaryTableName}
                        tableOptions={filteredChoices}
                        masterColumns={primaryTableColumns}
                        columnsByTable={tableColumns}
                        datalistIdBase={`posapi-item-${field.key}`}
                        defaultTableLabel={primaryTableLabel}
                        disabled={!config.posApiEnabled}
                        sessionVariables={DEFAULT_SESSION_VARIABLES}
                      />
                      <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                        <span style={{ color: '#475569', fontSize: '0.9rem' }}>Aggregation</span>
                        <select
                          value={aggregationValue}
                          onChange={(e) =>
                            updatePosApiNestedMapping(
                              'itemFields',
                              field.key,
                              applyAggregationToMapping(mappedValue, e.target.value),
                            )
                          }
                          disabled={!config.posApiEnabled || !isMappingProvided(mappedValue)}
                          style={{ minWidth: '140px' }}
                        >
                          {AGGREGATION_OPTIONS.map((option) => (
                            <option key={`item-agg-${field.key}-${option.value || 'none'}`} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      {itemDescription && <small style={{ color: '#555' }}>{itemDescription}</small>}
                    </div>
                  );
                })}
              </div>
            </div>
            <div style={{ marginTop: '1rem' }}>
              <strong>Payment field mapping</strong>
              <p style={{ fontSize: '0.85rem', color: '#555' }}>
                Map payment properties when transactions include multiple payment entries.
              </p>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                  gap: '0.75rem',
                  marginTop: '0.5rem',
                }}
              >
                {filteredPaymentFields.map((field) => {
                  const listId = `posapi-payment-${field.key}-columns`;
                  const hint = paymentFieldHints[field.key] || {};
                  const mappedValue = resolvedPaymentFieldMapping[field.key];
                  const aggregationValue =
                    normalizeMappingSelection(mappedValue, primaryTableName).aggregation
                    || hint.aggregation
                    || '';
                  const missingRequired = hint.required && !isMappingProvided(mappedValue);
                  return (
                    <label
                      key={`payment-${field.key}`}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.25rem',
                        border: missingRequired ? '1px solid #ef4444' : '1px solid transparent',
                        borderRadius: '8px',
                        padding: missingRequired ? '0.5rem' : 0,
                      }}
                    >
                      <span
                        style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                      >
                        {field.label}
                        <span
                          style={{
                          ...BADGE_BASE_STYLE,
                        ...(hint.required ? REQUIRED_BADGE_STYLE : OPTIONAL_BADGE_STYLE),
                      }}
                    >
                        {hint.required ? 'Required' : 'Optional'}
                      </span>
                        {missingRequired && (
                          <span
                            style={{
                              ...BADGE_BASE_STYLE,
                              background: '#fef2f2',
                              color: '#991b1b',
                            }}
                          >
                            Not mapped
                          </span>
                        )}
                    </span>
                      <MappingFieldSelector
                        value={mappedValue}
                        onChange={(val) => {
                          const parsedSelection = normalizeMappingSelection(val, primaryTableName);
                          const nextValue = buildMappingValue(
                            { ...parsedSelection, aggregation: aggregationValue },
                            { preserveType: true },
                          );
                          updatePosApiNestedMapping('paymentFields', field.key, nextValue);
                        }}
                        primaryTableName={primaryTableName}
                        masterColumns={columnOptions}
                        columnsByTable={tableColumns}
                        tableOptions={itemTableOptions}
                        datalistIdBase={listId}
                        disabled={!config.posApiEnabled}
                        sessionVariables={DEFAULT_SESSION_VARIABLES}
                      />
                      <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                        <span style={{ color: '#475569', fontSize: '0.9rem' }}>Aggregation</span>
                        <select
                          value={aggregationValue}
                          onChange={(e) =>
                            updatePosApiNestedMapping(
                              'paymentFields',
                              field.key,
                              applyAggregationToMapping(mappedValue, e.target.value),
                            )
                          }
                          disabled={!config.posApiEnabled || !isMappingProvided(mappedValue)}
                          style={{ minWidth: '140px' }}
                        >
                          {AGGREGATION_OPTIONS.map((option) => (
                            <option key={`payment-agg-${field.key}-${option.value || 'none'}`} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      {hint.description && <small style={{ color: '#555' }}>{hint.description}</small>}
                    </label>
                  );
                })}
              </div>
            </div>
            <div style={{ marginTop: '1rem' }}>
              <strong>Receipt field mapping</strong>
              <p style={{ fontSize: '0.85rem', color: '#555' }}>
                Override fields within nested receipt objects when forms produce multiple receipts.
              </p>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                  gap: '0.75rem',
                  marginTop: '0.5rem',
                }}
              >
                {filteredReceiptFields.map((field) => {
                  const listId = `posapi-receipt-${field.key}-columns`;
                  const hint = receiptFieldHints[field.key] || {};
                  const mappedValue = resolvedReceiptFieldMapping[field.key];
                  const aggregationValue =
                    normalizeMappingSelection(mappedValue, primaryTableName).aggregation
                    || hint.aggregation
                    || '';
                  const missingRequired = hint.required && !isMappingProvided(mappedValue);
                  return (
                    <label
                      key={`receipt-${field.key}`}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.25rem',
                        border: missingRequired ? '1px solid #ef4444' : '1px solid transparent',
                        borderRadius: '8px',
                        padding: missingRequired ? '0.5rem' : 0,
                      }}
                    >
                      <span
                        style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                      >
                        {field.label}
                        <span
                          style={{
                          ...BADGE_BASE_STYLE,
                        ...(hint.required ? REQUIRED_BADGE_STYLE : OPTIONAL_BADGE_STYLE),
                      }}
                    >
                        {hint.required ? 'Required' : 'Optional'}
                      </span>
                        {missingRequired && (
                          <span
                            style={{
                              ...BADGE_BASE_STYLE,
                              background: '#fef2f2',
                              color: '#991b1b',
                            }}
                          >
                            Not mapped
                          </span>
                        )}
                    </span>
                      <MappingFieldSelector
                        value={mappedValue}
                        onChange={(val) => {
                          const parsedSelection = normalizeMappingSelection(val, primaryTableName);
                          const nextValue = buildMappingValue(
                            { ...parsedSelection, aggregation: aggregationValue },
                            { preserveType: true },
                          );
                          updatePosApiNestedMapping('receiptFields', field.key, nextValue);
                        }}
                        primaryTableName={primaryTableName}
                        masterColumns={columnOptions}
                        columnsByTable={tableColumns}
                        tableOptions={itemTableOptions}
                        datalistIdBase={listId}
                        disabled={!config.posApiEnabled}
                        sessionVariables={DEFAULT_SESSION_VARIABLES}
                      />
                      <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                        <span style={{ color: '#475569', fontSize: '0.9rem' }}>Aggregation</span>
                        <select
                          value={aggregationValue}
                          onChange={(e) =>
                            updatePosApiNestedMapping(
                              'receiptFields',
                              field.key,
                              applyAggregationToMapping(mappedValue, e.target.value),
                            )
                          }
                          disabled={!config.posApiEnabled || !isMappingProvided(mappedValue)}
                          style={{ minWidth: '140px' }}
                        >
                          {AGGREGATION_OPTIONS.map((option) => (
                            <option key={`receipt-agg-${field.key}-${option.value || 'none'}`} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      {hint.description && <small style={{ color: '#555' }}>{hint.description}</small>}
                    </label>
                  );
                })}
              </div>
            </div>
          </>
        )}
        {receiptTaxTypesFeatureEnabled && serviceReceiptGroupTypes.length > 0 && (
          <div style={{ marginTop: '1rem' }}>
            <strong>{supportsItems ? 'Receipt group overrides' : 'Service receipt groups'}</strong>
            <p style={{ fontSize: '0.85rem', color: '#555' }}>
              {supportsItems
                ? 'Override totals for POSAPI receipt groups when itemised data needs to be regrouped by tax type.'
                : 'Map aggregated service totals for each tax group. Required fields are marked in red based on the POSAPI endpoint metadata.'}
            </p>
            <div className="space-y-4" style={{ marginTop: '0.5rem' }}>
              {serviceReceiptGroupTypes.map((type) => {
                const hintMap = receiptGroupHints[type] || {};
                const baseFields = SERVICE_RECEIPT_FIELDS.map((entry) => entry.key);
                const combined = Array.from(new Set([...baseFields, ...Object.keys(hintMap)]));
                const groupValues =
                  receiptGroupMapping[type] && typeof receiptGroupMapping[type] === 'object'
                    ? receiptGroupMapping[type]
                    : {};
                return (
                  <div
                    key={`service-group-${type}`}
                    style={{
                      border: '1px solid #d1d5db',
                      borderRadius: '8px',
                      padding: '0.75rem',
                    }}
                  >
                    <h4 style={{ marginTop: 0, marginBottom: '0.5rem' }}>
                      Tax group: {type.replace(/_/g, ' ')}
                    </h4>
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                        gap: '0.75rem',
                      }}
                    >
                      {combined.map((fieldKey) => {
                        const descriptor = SERVICE_RECEIPT_FIELDS.find(
                          (entry) => entry.key === fieldKey,
                        );
                        const label = descriptor
                          ? descriptor.label
                          : fieldKey.replace(/([A-Z])/g, ' $1');
                        const hint = hintMap[fieldKey] || {};
                        const isRequired = Boolean(hint.required);
                        const description = hint.description;
                        const listId = `service-receipt-${type}-${fieldKey}`;
                        return (
                          <label
                            key={`service-receipt-${type}-${fieldKey}`}
                            style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}
                          >
                            <span
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                fontWeight: 600,
                                color: '#0f172a',
                              }}
                            >
                              {label}
                              <span
                                style={{
                                  ...BADGE_BASE_STYLE,
                                  ...(isRequired ? REQUIRED_BADGE_STYLE : OPTIONAL_BADGE_STYLE),
                                }}
                              >
                                {isRequired ? 'Required' : 'Optional'}
                              </span>
                            </span>
                            <input
                              type="text"
                              list={listId}
                              value={groupValues[fieldKey] || ''}
                              onChange={(e) => updateReceiptGroupMapping(type, fieldKey, e.target.value)}
                              placeholder="Column or path"
                              disabled={!config.posApiEnabled}
                            />
                            <datalist id={listId}>
                              {columnOptions.map((col) => (
                                <option key={`service-receipt-${fieldKey}-${col}`} value={col} />
                              ))}
                            </datalist>
                            {description && <small style={{ color: '#555' }}>{description}</small>}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {paymentMethodsFeatureEnabled && servicePaymentMethodCodes.length > 0 && (
          <div style={{ marginTop: '1rem' }}>
            <strong>{supportsItems ? 'Payment method overrides' : 'Service payment methods'}</strong>
            <p style={{ fontSize: '0.85rem', color: '#555' }}>
              {supportsItems
                ? 'Map stored payment breakdowns to the POSAPI method codes returned by the endpoint.'
                : 'Map payment information captured on the transaction record to each available POSAPI payment method.'}
            </p>
            <div className="space-y-4" style={{ marginTop: '0.5rem' }}>
              {servicePaymentMethodCodes.map((method) => {
                const hintMap = paymentMethodHints[method] || {};
                const baseFields = SERVICE_PAYMENT_FIELDS.map((entry) => entry.key);
                const combined = Array.from(new Set([...baseFields, ...Object.keys(hintMap)]));
                const methodValues =
                  paymentMethodMapping[method] && typeof paymentMethodMapping[method] === 'object'
                    ? paymentMethodMapping[method]
                    : {};
                const label = PAYMENT_METHOD_LABELS[method] || method.replace(/_/g, ' ');
                return (
                  <div
                    key={`service-payment-${method}`}
                    style={{
                      border: '1px solid #d1d5db',
                      borderRadius: '8px',
                      padding: '0.75rem',
                    }}
                  >
                    <h4 style={{ marginTop: 0, marginBottom: '0.5rem' }}>Method: {label}</h4>
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                        gap: '0.75rem',
                      }}
                    >
                      {combined.map((fieldKey) => {
                        const descriptor = SERVICE_PAYMENT_FIELDS.find(
                          (entry) => entry.key === fieldKey,
                        );
                        const fieldLabel = descriptor
                          ? descriptor.label
                          : fieldKey.replace(/([A-Z])/g, ' $1');
                        const hint = hintMap[fieldKey] || {};
                        const isRequired = Boolean(hint.required);
                        const description = hint.description;
                        const listId = `service-payment-${method}-${fieldKey}`;
                        return (
                          <label
                            key={`service-payment-${method}-${fieldKey}`}
                            style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}
                          >
                            <span
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                fontWeight: 600,
                                color: '#0f172a',
                              }}
                            >
                              {fieldLabel}
                              <span
                                style={{
                                  ...BADGE_BASE_STYLE,
                                  ...(isRequired ? REQUIRED_BADGE_STYLE : OPTIONAL_BADGE_STYLE),
                                }}
                              >
                                {isRequired ? 'Required' : 'Optional'}
                              </span>
                            </span>
                            <input
                              type="text"
                              list={listId}
                              value={methodValues[fieldKey] || ''}
                              onChange={(e) => updatePaymentMethodMapping(method, fieldKey, e.target.value)}
                              placeholder="Column or path"
                              disabled={!config.posApiEnabled}
                            />
                            <datalist id={listId}>
                              {columnOptions.map((col) => (
                                <option key={`service-payment-${fieldKey}-${col}`} value={col} />
                              ))}
                            </datalist>
                            {description && <small style={{ color: '#555' }}>{description}</small>}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          )}
        </div>
      </>
    )}
    </section>
  );
}
