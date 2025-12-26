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

function sanitizeSelectionList(list, allowMultiple) {
  const values = Array.isArray(list)
    ? list.map((value) => (typeof value === 'string' ? value.trim() : '')).filter(Boolean)
    : [];
  if (allowMultiple) return values;
  return values.slice(0, 1);
}

function normalizeMappingMap(source) {
  if (!source) return {};
  if (Array.isArray(source)) {
    const map = {};
    source.forEach((entry) => {
      if (!entry || typeof entry !== 'object') return;
      const path = typeof entry.path === 'string' ? entry.path.trim() : '';
      const field = typeof entry.field === 'string' ? entry.field.trim() : '';
      const key = path || field;
      if (!key) return;
      const mapping = entry.mapping || entry.value || entry;
      map[key] = mapping;
    });
    return map;
  }
  if (typeof source === 'object') {
    return Object.entries(source).reduce((acc, [key, value]) => {
      if (typeof key !== 'string') return acc;
      const trimmedKey = key.trim();
      if (!trimmedKey) return acc;
      acc[trimmedKey] = value;
      return acc;
    }, {});
  }
  return {};
}

function classifyRequestPath(path = '') {
  const normalized = path.trim();
  const response = { section: null, key: normalized.replace(/\[\]/g, '') };
  if (!normalized) return response;
  if (normalized.startsWith('receipts[].items[].')) {
    return { section: 'itemFields', key: normalized.replace('receipts[].items[].', '') };
  }
  if (normalized.startsWith('items[].')) {
    return { section: 'itemFields', key: normalized.replace('items[].', '') };
  }
  if (normalized.startsWith('receipts[].payments[].')) {
    return { section: 'paymentFields', key: normalized.replace('receipts[].payments[].', '') };
  }
  if (normalized.startsWith('payments[].')) {
    return { section: 'paymentFields', key: normalized.replace('payments[].', '') };
  }
  if (normalized.startsWith('receipts[].')) {
    return { section: 'receiptFields', key: normalized.replace('receipts[].', '') };
  }
  const last = normalized.replace(/\[\]/g, '').split('.').pop();
  return { section: null, key: last || normalized };
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
    defaults.items = 'items[]';
  }
  defaults.payments = 'payments[]';
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

  let enhancedObjects = otherObjects;
  if (supportsItems) {
    const itemsObj = otherObjects.find(
      (obj) => obj.key === 'items' || obj.path === 'items[]' || obj.path.endsWith('items[]'),
    );
    const hasTopLevelItems = otherObjects.some((obj) => obj.path === 'items[]');
    if (itemsObj && !hasTopLevelItems) {
      enhancedObjects = [
        { ...itemsObj, id: 'items[]', path: 'items[]', label: 'Items' },
        ...otherObjects,
      ];
    }
  }

  if (rootFields.length || enhancedObjects.length) {
    return { rootFields, objects: enhancedObjects };
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

function MappingFieldSelector({
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

  const requestVariations = useMemo(() => {
    if (!selectedEndpoint || !Array.isArray(selectedEndpoint.variations)) return [];
    return selectedEndpoint.variations.filter((variation) => variation && variation.enabled !== false);
  }, [selectedEndpoint]);

  const selectedVariationKey = config.posApiRequestVariation || selectedEndpoint?.defaultVariation || '';
  const selectedVariation =
    requestVariations.find((variation) => variation.key === selectedVariationKey) || null;
  const configVariationDefaults = useMemo(() => {
    if (!config.posApiVariationDefaults || typeof config.posApiVariationDefaults !== 'object') return {};
    const cleaned = {};
    Object.entries(config.posApiVariationDefaults).forEach(([field, valueMap]) => {
      if (typeof field !== 'string') return;
      if (!valueMap || typeof valueMap !== 'object') return;
      const variations = {};
      Object.entries(valueMap).forEach(([variation, val]) => {
        if (typeof variation !== 'string') return;
        if (val === undefined || val === null) return;
        variations[variation] = val;
      });
      if (Object.keys(variations).length) {
        cleaned[field] = variations;
      }
    });
    return cleaned;
  }, [config.posApiVariationDefaults]);

  const combinedVariationDefaults = useMemo(() => {
    const base = {};
    const defaults =
      selectedEndpoint?.variationDefaults && typeof selectedEndpoint.variationDefaults === 'object'
        ? selectedEndpoint.variationDefaults
        : {};
    Object.entries(defaults).forEach(([field, values]) => {
      if (!field || typeof values !== 'object') return;
      base[field] = { ...(base[field] || {}), ...values };
    });
    if (Array.isArray(selectedEndpoint?.variations)) {
      selectedEndpoint.variations.forEach((variation) => {
        if (!variation || typeof variation !== 'object') return;
        const key = typeof variation.key === 'string' ? variation.key : '';
        if (!key || !variation.variationDefaults || typeof variation.variationDefaults !== 'object') return;
        Object.entries(variation.variationDefaults).forEach(([field, value]) => {
          if (!field) return;
          if (!base[field]) base[field] = {};
          base[field][key] = value;
        });
      });
    }
    Object.entries(configVariationDefaults || {}).forEach(([field, values]) => {
      if (!field || !values || typeof values !== 'object') return;
      base[field] = { ...(base[field] || {}), ...values };
    });
    return base;
  }, [selectedEndpoint, configVariationDefaults]);

  const variationDefaultValues = useMemo(() => {
    if (!selectedVariationKey) return {};
    if (!combinedVariationDefaults || typeof combinedVariationDefaults !== 'object') return {};
    const result = {};
    Object.entries(combinedVariationDefaults).forEach(([field, byVariation]) => {
      if (!byVariation || typeof byVariation !== 'object') return;
      if (Object.prototype.hasOwnProperty.call(byVariation, selectedVariationKey)) {
        result[field] = byVariation[selectedVariationKey];
      }
    });
    return result;
  }, [combinedVariationDefaults, selectedVariationKey]);

  const variationSpecificFields = useMemo(() => {
    const set = new Set();
    (selectedEndpoint?.requestFields || []).forEach((field) => {
      const path = typeof field?.field === 'string' ? field.field : typeof field?.path === 'string' ? field.path : '';
      if (field?.variationSpecific && path) set.add(path);
    });
    Object.keys(combinedVariationDefaults || {}).forEach((field) => {
      if (field) set.add(field);
    });
    return Array.from(set).filter(Boolean);
  }, [selectedEndpoint, combinedVariationDefaults]);

  const hierarchicalRequestSample = useMemo(
    () =>
      buildHierarchicalSample(
        requestStructure,
        mergeSamples(baseRequestSample || {}, variationDefaultValues || {}),
      ),
    [requestStructure, baseRequestSample, variationDefaultValues],
  );

  const requestSampleText = useMemo(() => {
    try {
      return JSON.stringify(hierarchicalRequestSample || {}, null, 2);
    } catch {
      return '{}';
    }
  }, [hierarchicalRequestSample]);
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
    const merged = buildHierarchicalSample(
      requestStructure,
      mergeSamples(payload || {}, variationDefaultValues || {}),
    );
    try {
      return JSON.stringify(merged || {}, null, 2);
    } catch {
      return selectedVariation?.requestExampleText || '';
    }
  }, [selectedVariation, requestStructure, variationDefaultValues]);

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

  useEffect(() => {
    if (!config.posApiEnabled || !selectedEndpoint) return;
    setConfig((c) => {
      let changed = false;
      const next = { ...c };
      if (!next.posApiRequestVariation && selectedEndpoint.defaultVariation) {
        next.posApiRequestVariation = selectedEndpoint.defaultVariation;
        changed = true;
      }
      const mapping = { ...(next.posApiMapping || {}) };
      const recordedRequestMappings =
        next.posApiRequestMappings && typeof next.posApiRequestMappings === 'object'
          ? { ...next.posApiRequestMappings }
          : {};
      const hasExistingRequestMappings =
        Object.keys(mapping).length > 0 || Object.keys(recordedRequestMappings).length > 0;
      if (!hasExistingRequestMappings) {
        Object.entries(requestMappingDefaults || {}).forEach(([path, value]) => {
          const { section, key } = classifyRequestPath(path);
          if (!key) return;
          if (section) {
            const sectionMap =
              mapping[section] && typeof mapping[section] === 'object' && !Array.isArray(mapping[section])
                ? { ...mapping[section] }
                : {};
            sectionMap[key] = value;
            mapping[section] = sectionMap;
            changed = true;
          } else {
            mapping[key] = value;
            changed = true;
          }
          recordedRequestMappings[path] = value;
          changed = true;
        });
      }
      if (Object.keys(mapping).length) {
        next.posApiMapping = mapping;
      }
      if (Object.keys(recordedRequestMappings).length) {
        next.posApiRequestMappings = recordedRequestMappings;
      }

      const responseMapping =
        next.posApiResponseMapping && typeof next.posApiResponseMapping === 'object'
          ? { ...next.posApiResponseMapping }
          : {};
      const responseFieldMappings =
        next.posApiResponseFieldMappings && typeof next.posApiResponseFieldMappings === 'object'
          ? { ...next.posApiResponseFieldMappings }
          : {};
      const hasExistingResponseMappings =
        Object.keys(responseMapping).length > 0 || Object.keys(responseFieldMappings).length > 0;
      if (!hasExistingResponseMappings) {
        Object.entries(responseMappingDefaults || {}).forEach(([path, value]) => {
          responseMapping[path] = value;
          responseFieldMappings[path] = value;
          changed = true;
        });
      }
      if (Object.keys(responseMapping).length) {
        next.posApiResponseMapping = responseMapping;
      }
      if (Object.keys(responseFieldMappings).length) {
        next.posApiResponseFieldMappings = responseFieldMappings;
      }

      const hasVariationDefaults =
        next.posApiVariationDefaults &&
        typeof next.posApiVariationDefaults === 'object' &&
        Object.keys(next.posApiVariationDefaults).length > 0;
      if (!hasVariationDefaults && selectedEndpoint.variationDefaults && typeof selectedEndpoint.variationDefaults === 'object') {
        next.posApiVariationDefaults = { ...selectedEndpoint.variationDefaults };
        changed = true;
      }

      return changed ? next : c;
    });
  }, [
    config.posApiEnabled,
    selectedEndpoint,
    requestMappingDefaults,
    responseMappingDefaults,
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
      };
    });
    return map;
  }, [selectedEndpoint]);

  const customResponseFields = useMemo(() => {
    const list = Array.isArray(config.posApiCustomResponseFields)
      ? config.posApiCustomResponseFields
      : [];
    return list
      .map((entry) => {
        if (!entry || typeof entry !== 'object') return null;
        const path = typeof entry.path === 'string' ? entry.path.trim() : '';
        if (!path) return null;
        return {
          path,
          label:
            typeof entry.label === 'string' && entry.label.trim()
              ? entry.label.trim()
              : humanizeFieldLabel(path),
          destField: typeof entry.destField === 'string' ? entry.destField.trim() : '',
          required: Boolean(entry.required),
          type: typeof entry.type === 'string' ? entry.type.trim() : '',
          description: typeof entry.description === 'string' ? entry.description : '',
        };
      })
      .filter(Boolean);
  }, [config.posApiCustomResponseFields]);

  const responseFields = useMemo(() => {
    const source = Array.isArray(selectedEndpoint?.responseFields)
      ? selectedEndpoint.responseFields
      : [];
    const deduped = new Map();
    const pushField = (entry) => {
      if (!entry || typeof entry !== 'object') return;
      const path =
        typeof entry.path === 'string' && entry.path.trim()
          ? entry.path.trim()
          : typeof entry.field === 'string'
            ? entry.field.trim()
            : '';
      if (!path) return;
      const normalized = {
        path,
        label:
          typeof entry.label === 'string' && entry.label.trim()
            ? entry.label.trim()
            : humanizeFieldLabel(path),
        destField: typeof entry.destField === 'string' ? entry.destField.trim() : '',
        required: Boolean(entry.required),
        type: typeof entry.type === 'string' ? entry.type.trim() : '',
        description: typeof entry.description === 'string' ? entry.description : '',
      };
      deduped.set(path, normalized);
    };
    source.forEach(pushField);
    customResponseFields.forEach(pushField);
    Object.keys(responseMappingDefaults || {}).forEach((path) => {
      if (!path || deduped.has(path)) return;
      deduped.set(path, {
        path,
        label: humanizeFieldLabel(path),
        required: false,
        type: '',
        description: '',
      });
    });
    return Array.from(deduped.values());
  }, [selectedEndpoint, customResponseFields, responseMappingDefaults]);

  const aggregationFields = useMemo(() => {
    const list = [
      ...(Array.isArray(selectedEndpoint?.aggregations) ? selectedEndpoint.aggregations : []),
      ...(Array.isArray(config.posApiAggregationDefinitions)
        ? config.posApiAggregationDefinitions
        : []),
    ];
    const map = new Map();
    list.forEach((entry) => {
      if (!entry || typeof entry !== 'object') return;
      const target = typeof entry.target === 'string' ? entry.target.trim() : '';
      const source = typeof entry.source === 'string' ? entry.source.trim() : '';
      const operation = typeof entry.operation === 'string' ? entry.operation.trim() : '';
      if (!target || !source || !operation) return;
      const normalized = {
        target,
        source,
        operation,
        label:
          typeof entry.label === 'string' && entry.label.trim()
            ? entry.label.trim()
            : humanizeFieldLabel(target),
      };
      map.set(target, normalized);
    });
    return Array.from(map.values());
  }, [selectedEndpoint, config.posApiAggregationDefinitions]);

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

  const endpointRequestMappings = useMemo(
    () => normalizeMappingMap(selectedEndpoint?.requestMappings),
    [selectedEndpoint],
  );

  const endpointResponseMappings = useMemo(
    () => normalizeMappingMap(selectedEndpoint?.responseFieldMappings),
    [selectedEndpoint],
  );

  const formRequestMappings = useMemo(
    () => normalizeMappingMap(config.posApiRequestMappings),
    [config.posApiRequestMappings],
  );

  const formResponseMappings = useMemo(
    () => normalizeMappingMap(config.posApiResponseFieldMappings),
    [config.posApiResponseFieldMappings],
  );

  const requestMappingDefaults = useMemo(
    () => ({ ...endpointRequestMappings, ...formRequestMappings }),
    [endpointRequestMappings, formRequestMappings],
  );

  const responseMappingDefaults = useMemo(
    () => ({ ...endpointResponseMappings, ...formResponseMappings }),
    [endpointResponseMappings, formResponseMappings],
  );

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

  const updatePosApiMapping = (field, value, path) => {
    setConfig((c) => {
      const next = { ...(c.posApiMapping || {}) };
      const nextRequestMappings =
        c.posApiRequestMappings && typeof c.posApiRequestMappings === 'object'
          ? { ...c.posApiRequestMappings }
          : {};
      const trimmed =
        typeof value === 'string'
          ? value.trim()
          : value && typeof value === 'object'
            ? value
            : value;
      const mappingPath = path || field;
      if (
        trimmed === undefined ||
        trimmed === null ||
        (typeof trimmed === 'string' && trimmed.trim() === '') ||
        (typeof trimmed === 'object' && !Object.keys(trimmed).length)
      ) {
        delete next[field];
        if (mappingPath) delete nextRequestMappings[mappingPath];
      } else {
        next[field] = trimmed;
        if (mappingPath) nextRequestMappings[mappingPath] = trimmed;
      }
      const payload = { ...c, posApiMapping: next };
      if (Object.keys(nextRequestMappings).length) {
        payload.posApiRequestMappings = nextRequestMappings;
      } else {
        delete payload.posApiRequestMappings;
      }
      return payload;
    });
  };

  const updatePosApiResponseMapping = (fieldPath, value) => {
    setConfig((c) => {
      const next = { ...(c.posApiResponseMapping || {}) };
      const nextResponseMappings =
        c.posApiResponseFieldMappings && typeof c.posApiResponseFieldMappings === 'object'
          ? { ...c.posApiResponseFieldMappings }
          : {};
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
        delete next[fieldPath];
        delete nextResponseMappings[fieldPath];
      } else {
        next[fieldPath] = trimmed;
        nextResponseMappings[fieldPath] = trimmed;
      }
      const payload = { ...c, posApiResponseMapping: next };
      if (Object.keys(nextResponseMappings).length) {
        payload.posApiResponseFieldMappings = nextResponseMappings;
      } else {
        delete payload.posApiResponseFieldMappings;
      }
      return payload;
    });
  };

  const updatePosApiAggregationMapping = (target, value) => {
    setConfig((c) => {
      const next = { ...(c.posApiAggregations || {}) };
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
        delete next[target];
      } else {
        next[target] = trimmed;
      }
      return { ...c, posApiAggregations: next };
    });
  };

  const updatePosApiNestedMapping = (section, field, value, pathOverride) => {
    const targetObjectId =
      section === 'itemFields'
        ? itemsObject?.id || 'items'
        : section === 'paymentFields'
          ? paymentsObject?.id || 'payments'
          : section === 'receiptFields'
            ? receiptsObject?.id || 'receipts'
            : section;
    updateObjectFieldMapping(targetObjectId, field, value, section);
    const mappingPath = typeof pathOverride === 'string' ? pathOverride.trim() : '';
    if (mappingPath) {
      setConfig((c) => {
        const next =
          c.posApiRequestMappings && typeof c.posApiRequestMappings === 'object'
            ? { ...c.posApiRequestMappings }
            : {};
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
          delete next[mappingPath];
        } else {
          next[mappingPath] = trimmed;
        }
        const payload = { ...c };
        if (Object.keys(next).length) {
          payload.posApiRequestMappings = next;
        } else {
          delete payload.posApiRequestMappings;
        }
        return payload;
      });
    }
  };

  const addCustomAggregationDefinition = () => {
    setConfig((c) => {
      const list = Array.isArray(c.posApiAggregationDefinitions)
        ? [...c.posApiAggregationDefinitions]
        : [];
      list.push({ target: '', source: '', operation: 'sum', label: '' });
      return { ...c, posApiAggregationDefinitions: list };
    });
  };

  const updateCustomAggregationDefinition = (index, key, value) => {
    setConfig((c) => {
      const list = Array.isArray(c.posApiAggregationDefinitions)
        ? [...c.posApiAggregationDefinitions]
        : [];
      if (!list[index]) return c;
      const updated = { ...list[index], [key]: value };
      list[index] = updated;
      const payload = { ...c, posApiAggregationDefinitions: list };
      return payload;
    });
  };

  const removeCustomAggregationDefinition = (index) => {
    setConfig((c) => {
      const list = Array.isArray(c.posApiAggregationDefinitions)
        ? [...c.posApiAggregationDefinitions]
        : [];
      if (!list[index]) return c;
      list.splice(index, 1);
      const payload = { ...c };
      if (list.length) {
        payload.posApiAggregationDefinitions = list;
      } else {
        delete payload.posApiAggregationDefinitions;
      }
      return payload;
    });
  };

  const addCustomResponseField = () => {
    setConfig((c) => {
      const list = Array.isArray(c.posApiCustomResponseFields)
        ? [...c.posApiCustomResponseFields]
        : [];
      list.push({ path: '', label: '', required: false });
      return { ...c, posApiCustomResponseFields: list };
    });
  };

  const updateCustomResponseField = (index, key, value) => {
    setConfig((c) => {
      const list = Array.isArray(c.posApiCustomResponseFields)
        ? [...c.posApiCustomResponseFields]
        : [];
      if (!list[index]) return c;
      const updated = { ...list[index], [key]: value };
      list[index] = updated;
      const payload = { ...c, posApiCustomResponseFields: list };
      return payload;
    });
  };

  const removeCustomResponseField = (index) => {
    setConfig((c) => {
      const list = Array.isArray(c.posApiCustomResponseFields)
        ? [...c.posApiCustomResponseFields]
        : [];
      if (!list[index]) return c;
      list.splice(index, 1);
      const payload = { ...c };
      if (list.length) {
        payload.posApiCustomResponseFields = list;
      } else {
        delete payload.posApiCustomResponseFields;
      }
      return payload;
    });
  };

  const updateVariationDefaultValue = (field, variationKey, value) => {
    if (!field || !variationKey) return;
    setConfig((c) => {
      const map =
        c.posApiVariationDefaults && typeof c.posApiVariationDefaults === 'object' && !Array.isArray(c.posApiVariationDefaults)
          ? { ...c.posApiVariationDefaults }
          : {};
      const existing = map[field] && typeof map[field] === 'object' && !Array.isArray(map[field])
        ? { ...map[field] }
        : {};
      const next = { ...existing };
      const trimmed =
        typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
          ? value
          : value === null || value === undefined
            ? ''
            : value;
      if (trimmed === '' || trimmed === null || trimmed === undefined) {
        delete next[variationKey];
      } else {
        next[variationKey] = trimmed;
      }
      const payload = { ...c };
      if (Object.keys(next).length) {
        map[field] = next;
      } else {
        delete map[field];
      }
      if (Object.keys(map).length) {
        payload.posApiVariationDefaults = map;
      } else {
        delete payload.posApiVariationDefaults;
      }
      return payload;
    });
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

  const resolvedResponseFieldMapping =
    config.posApiResponseMapping &&
    typeof config.posApiResponseMapping === 'object' &&
    !Array.isArray(config.posApiResponseMapping)
      ? { ...responseMappingDefaults, ...config.posApiResponseMapping }
      : { ...responseMappingDefaults, ...responseFieldMapping };

  const resolvedAggregationMapping =
    config.posApiAggregations &&
    typeof config.posApiAggregations === 'object' &&
    !Array.isArray(config.posApiAggregations)
      ? config.posApiAggregations
      : {};

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
              {Object.keys(variationDefaultValues || {}).length > 0 && (
                <small style={{ color: '#475569' }}>
                  Variation-specific defaults are applied only for the selected variation.
                </small>
              )}
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
              {variationSpecificFields.length > 0 && (
                <div style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  <strong>Variation-specific defaults</strong>
                  <small style={{ color: '#475569' }}>
                    Defaults set here apply only to the selected variation to avoid mixing test values across variants.
                  </small>
                  {variationSpecificFields.map((fieldKey) => {
                    const value =
                      (combinedVariationDefaults[fieldKey] && combinedVariationDefaults[fieldKey][selectedVariationKey]) ||
                      '';
                    return (
                      <label
                        key={`variation-default-${fieldKey}`}
                        style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}
                      >
                        <span style={{ fontWeight: 600 }}>
                          {humanizeFieldLabel(fieldKey)} <small style={{ color: '#64748b' }}>(variation-specific)</small>
                        </span>
                        <input
                          type="text"
                          value={value}
                          onChange={(e) => updateVariationDefaultValue(fieldKey, selectedVariationKey || '', e.target.value)}
                          placeholder="Default value for this variation"
                          disabled={!config.posApiEnabled || !selectedVariationKey}
                        />
                      </label>
                    );
                  })}
                </div>
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
      {(responseFields.length > 0 || config.posApiEnabled) && (
        <div style={{ marginBottom: '1rem' }}>
          <strong>Response field mapping</strong>
          <p style={{ fontSize: '0.85rem', color: '#555' }}>
            Map common POSAPI response values to transaction columns, literals or variables. Required
            fields show a warning when not mapped.
          </p>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
            <small style={{ color: '#475569' }}>
              Add additional response fields to capture values not described in the endpoint metadata.
            </small>
            <button
              type="button"
              onClick={addCustomResponseField}
              disabled={!config.posApiEnabled}
              style={{ padding: '0.25rem 0.5rem' }}
            >
              + Custom response field
            </button>
          </div>
          {customResponseFields.length > 0 && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: '0.5rem',
                marginBottom: '0.75rem',
              }}
            >
              {customResponseFields.map((field, idx) => (
                <div
                  key={`custom-response-${idx}`}
                  style={{
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    padding: '0.5rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.35rem',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong style={{ fontSize: '0.95rem' }}>Custom field {idx + 1}</strong>
                    <button
                      type="button"
                      onClick={() => removeCustomResponseField(idx)}
                      style={{ color: '#b91c1c', border: 'none', background: 'transparent', cursor: 'pointer' }}
                      disabled={!config.posApiEnabled}
                    >
                      Remove
                    </button>
                  </div>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <span style={{ fontWeight: 600 }}>Path</span>
                    <input
                      type="text"
                      value={field.path || ''}
                      onChange={(e) => updateCustomResponseField(idx, 'path', e.target.value)}
                      placeholder="e.g., receipts[].items[].promoCode"
                      disabled={!config.posApiEnabled}
                    />
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <span style={{ fontWeight: 600 }}>Label</span>
                    <input
                      type="text"
                      value={field.label || ''}
                      onChange={(e) => updateCustomResponseField(idx, 'label', e.target.value)}
                      placeholder="Friendly label"
                      disabled={!config.posApiEnabled}
                    />
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <span style={{ fontWeight: 600 }}>Suggested destination</span>
                    <input
                      type="text"
                      value={field.destField || ''}
                      onChange={(e) => updateCustomResponseField(idx, 'destField', e.target.value)}
                      placeholder="Column name"
                      disabled={!config.posApiEnabled}
                    />
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <input
                      type="checkbox"
                      checked={Boolean(field.required)}
                      onChange={(e) => updateCustomResponseField(idx, 'required', e.target.checked)}
                      disabled={!config.posApiEnabled}
                    />
                    <span>Required</span>
                  </label>
                  <textarea
                    rows={2}
                    value={field.description || ''}
                    onChange={(e) => updateCustomResponseField(idx, 'description', e.target.value)}
                    placeholder="Description"
                    disabled={!config.posApiEnabled}
                    style={{ fontFamily: 'inherit', resize: 'vertical' }}
                  />
                </div>
              ))}
            </div>
          )}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: '0.75rem',
            }}
          >
            {responseFields.map((field) => {
              const mappedValue = resolvedResponseFieldMapping[field.path];
              const isRequired = Boolean(field.required);
              const missingRequired = isRequired && !isMappingProvided(mappedValue);
              return (
                <div
                  key={`response-${field.path}`}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.35rem',
                    border: missingRequired ? '1px solid #ef4444' : '1px solid transparent',
                    borderRadius: '8px',
                    padding: missingRequired ? '0.5rem' : 0,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontWeight: 700 }}>{field.label}</span>
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
                  </div>
                  <small style={{ color: '#475569' }}>
                    Path: <code>{field.path}</code>
                  </small>
                  <MappingFieldSelector
                    value={mappedValue}
                    onChange={(val) => updatePosApiResponseMapping(field.path, val)}
                    primaryTableName={primaryTableName}
                    masterColumns={columnOptions}
                    columnsByTable={tableColumns}
                    tableOptions={itemTableOptions}
                    datalistIdBase={`posapi-response-${field.path}`}
                    disabled={!config.posApiEnabled}
                    sessionVariables={DEFAULT_SESSION_VARIABLES}
                  />
                  {field.destField && (
                    <small style={{ color: '#4b5563' }}>
                      Suggested destination: <code>{field.destField}</code>
                    </small>
                  )}
                  {field.description && <small style={{ color: '#555' }}>{field.description}</small>}
                </div>
              );
            })}
          </div>
        </div>
      )}
      {(aggregationFields.length > 0 || config.posApiEnabled) && (
        <div style={{ marginBottom: '1rem' }}>
          <strong>Aggregated fields</strong>
          <p style={{ fontSize: '0.85rem', color: '#555' }}>
            Aggregations are computed from the request payload (for example summing item totals).
            Choose where to store each derived value.
          </p>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
            <small style={{ color: '#475569' }}>
              Define extra aggregated fields when the endpoint requires derived totals.
            </small>
            <button
              type="button"
              onClick={addCustomAggregationDefinition}
              disabled={!config.posApiEnabled}
              style={{ padding: '0.25rem 0.5rem' }}
            >
              + Add aggregation
            </button>
          </div>
          {Array.isArray(config.posApiAggregationDefinitions) && config.posApiAggregationDefinitions.length > 0 && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                gap: '0.75rem',
                marginBottom: '0.75rem',
              }}
            >
              {config.posApiAggregationDefinitions.map((agg, idx) => (
                <div
                  key={`custom-agg-${idx}`}
                  style={{
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    padding: '0.5rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.35rem',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong style={{ fontSize: '0.95rem' }}>Custom aggregation {idx + 1}</strong>
                    <button
                      type="button"
                      onClick={() => removeCustomAggregationDefinition(idx)}
                      style={{ color: '#b91c1c', border: 'none', background: 'transparent', cursor: 'pointer' }}
                      disabled={!config.posApiEnabled}
                    >
                      Remove
                    </button>
                  </div>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <span style={{ fontWeight: 600 }}>Target field</span>
                    <input
                      type="text"
                      value={agg.target || ''}
                      onChange={(e) => updateCustomAggregationDefinition(idx, 'target', e.target.value)}
                      placeholder="e.g., totalAmount"
                      disabled={!config.posApiEnabled}
                    />
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <span style={{ fontWeight: 600 }}>Operation</span>
                    <select
                      value={agg.operation || 'sum'}
                      onChange={(e) => updateCustomAggregationDefinition(idx, 'operation', e.target.value)}
                      disabled={!config.posApiEnabled}
                    >
                      <option value="sum">Sum</option>
                      <option value="count">Count</option>
                      <option value="avg">Avg</option>
                      <option value="min">Min</option>
                      <option value="max">Max</option>
                    </select>
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <span style={{ fontWeight: 600 }}>Source path</span>
                    <input
                      type="text"
                      value={agg.source || ''}
                      onChange={(e) => updateCustomAggregationDefinition(idx, 'source', e.target.value)}
                      placeholder="items[].totalAmount"
                      disabled={!config.posApiEnabled}
                    />
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <span style={{ fontWeight: 600 }}>Label (optional)</span>
                    <input
                      type="text"
                      value={agg.label || ''}
                      onChange={(e) => updateCustomAggregationDefinition(idx, 'label', e.target.value)}
                      placeholder="Display label"
                      disabled={!config.posApiEnabled}
                    />
                  </label>
                </div>
              ))}
            </div>
          )}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: '0.75rem',
            }}
          >
            {aggregationFields.map((agg) => {
              const mappedValue = resolvedAggregationMapping[agg.target];
              const missingRequired = !isMappingProvided(mappedValue);
              return (
                <div
                  key={`aggregation-${agg.target}`}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.35rem',
                    border: missingRequired ? '1px solid #e2e8f0' : '1px solid transparent',
                    borderRadius: '8px',
                    padding: '0.25rem',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontWeight: 700 }}>{agg.label || agg.target}</span>
                    <span style={{ ...BADGE_BASE_STYLE, background: '#ecfeff', color: '#0e7490' }}>
                      {agg.operation.toUpperCase()} {agg.source}
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
                  </div>
                  <small style={{ color: '#475569' }}>
                    Target key: <code>{agg.target}</code>
                  </small>
                  <MappingFieldSelector
                    value={mappedValue}
                    onChange={(val) => updatePosApiAggregationMapping(agg.target, val)}
                    primaryTableName={primaryTableName}
                    masterColumns={columnOptions}
                    columnsByTable={tableColumns}
                    tableOptions={itemTableOptions}
                    datalistIdBase={`posapi-aggregation-${agg.target}`}
                    disabled={!config.posApiEnabled}
                    sessionVariables={DEFAULT_SESSION_VARIABLES}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}
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
            const pathKey = field.path || field.key;
            const mappedValue =
              config.posApiMapping?.[field.key] ?? requestMappingDefaults[pathKey] ?? requestMappingDefaults[field.key];
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
                  onChange={(val) => updatePosApiMapping(field.key, val, pathKey)}
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
                        const fieldPath = field.path || (obj.path ? `${obj.path}.${field.key}` : field.key);
                        const mappedValue = mapping[field.key] ?? requestMappingDefaults[fieldPath];
                        return (
                          <div
                            key={`obj-${obj.id}-${field.key}`}
                            style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}
                          >
                            <span style={{ fontWeight: 600, color: '#0f172a' }}>
                              {field.label || humanizeFieldLabel(field.key)}
                            </span>
                            <MappingFieldSelector
                              value={mappedValue}
                              onChange={(val) => {
                                const parsed = normalizeMappingSelection(val, primaryTableName);
                                if (parsed.table) onEnsureColumnsLoaded(parsed.table);
                                updateObjectFieldMapping(obj.id, field.key, val, 'objectFields');
                                if (fieldPath) {
                                  setConfig((c) => {
                                    const next =
                                      c.posApiRequestMappings && typeof c.posApiRequestMappings === 'object'
                                        ? { ...c.posApiRequestMappings }
                                        : {};
                                    if (isMappingProvided(val)) {
                                      next[fieldPath] = val;
                                    } else {
                                      delete next[fieldPath];
                                    }
                                    const payload = { ...c };
                                    if (Object.keys(next).length) {
                                      payload.posApiRequestMappings = next;
                                    } else {
                                      delete payload.posApiRequestMappings;
                                    }
                                    return payload;
                                  });
                                }
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
                  const itemPath =
                    field.path ||
                    (itemsObject?.path ? `${itemsObject.path}.${field.key}` : `items[].${field.key}`);
                  const mappedValue =
                    resolvedItemFieldMapping[field.key] ?? requestMappingDefaults[itemPath];
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
                          updatePosApiNestedMapping('itemFields', field.key, val, itemPath);
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
                  const paymentPath =
                    field.path ||
                    (paymentsObject?.path ? `${paymentsObject.path}.${field.key}` : `payments[].${field.key}`);
                  const mappedValue =
                    resolvedPaymentFieldMapping[field.key] ?? requestMappingDefaults[paymentPath];
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
                        onChange={(val) => updatePosApiNestedMapping('paymentFields', field.key, val, paymentPath)}
                        primaryTableName={primaryTableName}
                        masterColumns={columnOptions}
                        columnsByTable={tableColumns}
                        tableOptions={itemTableOptions}
                        datalistIdBase={listId}
                        disabled={!config.posApiEnabled}
                        sessionVariables={DEFAULT_SESSION_VARIABLES}
                      />
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
                  const receiptPath =
                    field.path ||
                    (receiptsObject?.path ? `${receiptsObject.path}.${field.key}` : `receipts[].${field.key}`);
                  const mappedValue =
                    resolvedReceiptFieldMapping[field.key] ?? requestMappingDefaults[receiptPath];
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
                        onChange={(val) => updatePosApiNestedMapping('receiptFields', field.key, val, receiptPath)}
                        primaryTableName={primaryTableName}
                        masterColumns={columnOptions}
                        columnsByTable={tableColumns}
                        tableOptions={itemTableOptions}
                        datalistIdBase={listId}
                        disabled={!config.posApiEnabled}
                        sessionVariables={DEFAULT_SESSION_VARIABLES}
                      />
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
