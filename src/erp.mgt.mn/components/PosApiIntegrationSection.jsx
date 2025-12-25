import React, { useMemo, useEffect, useState } from 'react';
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
  resolveFeatureToggle,
  withPosApiEndpointMetadata,
  formatPosApiTypeLabel,
} from '../utils/posApiConfig.js';
import { parseFieldSource, buildFieldSource } from '../utils/posApiFieldSource.js';

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
  const [showAdvanced, setShowAdvanced] = useState(false);
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

  useEffect(() => {
    if (!selectedEndpoint) return;
    setConfig((current) => {
      const defaults = {
        posApiEnableReceiptTypes: selectedEndpoint.enableReceiptTypes !== false,
        posApiEnableReceiptItems:
          selectedEndpoint.supportsItems !== false && selectedEndpoint.enableReceiptItems !== false,
        posApiEnableReceiptTaxTypes: selectedEndpoint.enableReceiptTaxTypes !== false,
        posApiEnablePaymentMethods: selectedEndpoint.enablePaymentMethods !== false,
        posApiAllowMultipleReceiptTypes: selectedEndpoint.allowMultipleReceiptTypes !== false,
        posApiAllowMultipleReceiptTaxTypes: selectedEndpoint.allowMultipleReceiptTaxTypes !== false,
        posApiAllowMultiplePaymentMethods:
          selectedEndpoint.supportsMultiplePayments === false
            ? false
            : selectedEndpoint.allowMultiplePaymentMethods !== false,
      };
      let changed = false;
      const next = { ...current };
      Object.entries(defaults).forEach(([key, value]) => {
        if (current[key] === undefined && value !== undefined) {
          next[key] = value;
          changed = true;
        }
      });
      return changed ? next : current;
    });
  }, [selectedEndpoint, setConfig]);

  const endpointSupportsItems = selectedEndpoint?.supportsItems !== false;
  const endpointReceiptItemsEnabled = selectedEndpoint
    ? selectedEndpoint.enableReceiptItems !== false
    : endpointSupportsItems;
  const endpointReceiptTypesEnabled = selectedEndpoint
    ? selectedEndpoint.enableReceiptTypes !== false
    : true;
  const endpointReceiptTaxTypesEnabled = selectedEndpoint
    ? selectedEndpoint.enableReceiptTaxTypes !== false
    : true;
  const endpointPaymentMethodsEnabled = selectedEndpoint
    ? selectedEndpoint.enablePaymentMethods !== false
    : true;

  const receiptItemsToggleValue = resolveFeatureToggle(
    config.posApiEnableReceiptItems,
    endpointSupportsItems && endpointReceiptItemsEnabled,
    endpointReceiptItemsEnabled,
  );
  const receiptTypesToggleValue = resolveFeatureToggle(
    config.posApiEnableReceiptTypes,
    endpointReceiptTypesEnabled,
    endpointReceiptTypesEnabled,
  );
  const receiptTaxTypesToggleValue = resolveFeatureToggle(
    config.posApiEnableReceiptTaxTypes,
    endpointReceiptTaxTypesEnabled,
    endpointReceiptTaxTypesEnabled,
  );
  const paymentMethodsToggleValue = resolveFeatureToggle(
    config.posApiEnablePaymentMethods,
    endpointPaymentMethodsEnabled,
    endpointPaymentMethodsEnabled,
  );

  const receiptTypesFeatureEnabled = config.posApiEnabled && receiptTypesToggleValue;
  const receiptTaxTypesFeatureEnabled = config.posApiEnabled && receiptTaxTypesToggleValue;
  const paymentMethodsFeatureEnabled = config.posApiEnabled && paymentMethodsToggleValue;
  const supportsItems = config.posApiEnabled && receiptItemsToggleValue;

  const receiptTypesAllowMultiple = receiptTypesFeatureEnabled
    ? typeof config.posApiAllowMultipleReceiptTypes === 'boolean'
      ? config.posApiAllowMultipleReceiptTypes
      : selectedEndpoint?.allowMultipleReceiptTypes !== false
    : true;
  const receiptTaxTypesAllowMultiple = receiptTaxTypesFeatureEnabled
    ? typeof config.posApiAllowMultipleReceiptTaxTypes === 'boolean'
      ? config.posApiAllowMultipleReceiptTaxTypes
      : selectedEndpoint?.allowMultipleReceiptTaxTypes !== false
    : true;
  const paymentMethodsAllowMultiple = paymentMethodsFeatureEnabled
    ? selectedEndpoint?.supportsMultiplePayments === false
      ? false
      : typeof config.posApiAllowMultiplePaymentMethods === 'boolean'
        ? config.posApiAllowMultiplePaymentMethods
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

  const receiptTypeUniverse = useMemo(() => {
    if (!receiptTypesFeatureEnabled) return [];
    return endpointReceiptTypes;
  }, [endpointReceiptTypes, receiptTypesFeatureEnabled]);

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

  const nestedSourceMapping =
    config.posApiMapping &&
    typeof config.posApiMapping.nestedSources === 'object' &&
    !Array.isArray(config.posApiMapping.nestedSources)
      ? config.posApiMapping.nestedSources
      : {};

  const fieldsFromPosApiText = useMemo(() => {
    return Array.isArray(config.fieldsFromPosApi) ? config.fieldsFromPosApi.join('\n') : '';
  }, [config.fieldsFromPosApi]);

  const responseFields = useMemo(() => {
    const source = Array.isArray(selectedEndpoint?.responseFields)
      ? selectedEndpoint.responseFields
      : [];
    return source
      .map((entry) => {
        const field = typeof entry?.field === 'string' ? entry.field.trim() : '';
        if (!field) return null;
        return {
          key: field,
          path: field,
          label: entry?.label || humanizeFieldLabel(field),
          required: Boolean(entry?.required || entry?.requiredCommon),
          description: typeof entry?.description === 'string' ? entry.description : '',
        };
      })
      .filter(Boolean);
  }, [selectedEndpoint]);

  const responseFieldMappings =
    config.posApiMapping &&
    typeof config.posApiMapping.responseFieldMappings === 'object' &&
    !Array.isArray(config.posApiMapping.responseFieldMappings)
      ? config.posApiMapping.responseFieldMappings
      : {};

  const unmappedResponseFields = Array.isArray(config.posApiMapping?.unmappedResponseFields)
    ? config.posApiMapping.unmappedResponseFields.filter((value) => typeof value === 'string' && value.trim())
    : [];

  const unmappedResponseFieldsText = useMemo(
    () => unmappedResponseFields.join('\n'),
    [unmappedResponseFields],
  );

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
      const trimmed = typeof value === 'string' ? value.trim() : value;
      if (!trimmed) {
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
        if (!trimmed) {
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
      const trimmed = typeof value === 'string' ? value.trim() : value;
      if (!trimmed) {
        delete next[field];
      } else {
        next[field] = trimmed;
      }
      return { ...c, posApiMapping: next };
    });
  };

  const updatePosApiResponseMapping = (field, value) => {
    setConfig((c) => {
      const next = { ...(c.posApiResponseMapping || {}) };
      const trimmed = typeof value === 'string' ? value.trim() : value;
      if (!trimmed) {
        delete next[field];
      } else {
        next[field] = trimmed;
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

  const updateResponseFieldMapping = (fieldKey, value) => {
    setConfig((c) => {
      const base = { ...(c.posApiMapping || {}) };
      const mappings =
        base.responseFieldMappings &&
        typeof base.responseFieldMappings === 'object' &&
        !Array.isArray(base.responseFieldMappings)
          ? { ...base.responseFieldMappings }
          : {};
      const trimmed = typeof value === 'string' ? value.trim() : value;
      if (!trimmed) {
        delete mappings[fieldKey];
      } else {
        mappings[fieldKey] = trimmed;
      }
      if (Object.keys(mappings).length) {
        base.responseFieldMappings = mappings;
      } else {
        delete base.responseFieldMappings;
      }
      return { ...c, posApiMapping: base };
    });
  };

  const toggleResponseFieldIgnored = (fieldKey, ignored) => {
    setConfig((c) => {
      const base = { ...(c.posApiMapping || {}) };
      const current =
        Array.isArray(base.unmappedResponseFields) && base.unmappedResponseFields.length
          ? base.unmappedResponseFields.filter((entry) => typeof entry === 'string' && entry.trim())
          : [];
      const set = new Set(current);
      if (ignored) {
        set.add(fieldKey);
        if (base.responseFieldMappings) {
          const mappings = { ...(base.responseFieldMappings || {}) };
          delete mappings[fieldKey];
          if (Object.keys(mappings).length) {
            base.responseFieldMappings = mappings;
          } else {
            delete base.responseFieldMappings;
          }
        }
      } else {
        set.delete(fieldKey);
      }
      const updated = Array.from(set);
      if (updated.length) {
        base.unmappedResponseFields = updated;
      } else {
        delete base.unmappedResponseFields;
      }
      return { ...c, posApiMapping: base };
    });
  };

  const handleUnmappedResponseFieldsChange = (value) => {
    const entries = value
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line);
    setConfig((c) => {
      const base = { ...(c.posApiMapping || {}) };
      if (entries.length) {
        base.unmappedResponseFields = entries;
      } else {
        delete base.unmappedResponseFields;
      }
      return { ...c, posApiMapping: base };
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
          <label style={{ ...fieldColumnStyle }}>
            <span style={{ fontWeight: 600 }}>Default POSAPI type</span>
            <select
              value={config.posApiType}
              disabled={!config.posApiEnabled}
              onChange={(e) => setConfig((c) => ({ ...c, posApiType: e.target.value }))}
            >
              <option value="">Use default from environment</option>
              {receiptTypeUniverse.map((type) => (
                <option key={`fallback-type-${type}`} value={type}>
                  {formatPosApiTypeLabel(type)}
                </option>
            ))}
          </select>
          <small style={{ color: '#666' }}>
            Automatically switches between POSAPI transaction types based on the provided customer
            identifiers.
          </small>
          </label>
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
                Optional column containing the POSAPI type code.
              </small>
          </label>
        </div>
          <details
            open={showAdvanced}
            onToggle={(event) => setShowAdvanced(event.target.open)}
            style={{
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              padding: '0.75rem',
              background: '#f8fafc',
              marginBottom: '0.5rem',
            }}
          >
            <summary style={{ fontWeight: 600, cursor: 'pointer' }}>Advanced POSAPI options</summary>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '0.75rem',
                marginTop: '0.5rem',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '1rem',
                }}
              >
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input
                    type="checkbox"
                    checked={receiptTypesToggleValue}
                    onChange={(e) =>
                      setConfig((c) => ({
                        ...c,
                        posApiEnableReceiptTypes: e.target.checked,
                      }))
                    }
                    disabled={!endpointReceiptTypesEnabled}
                  />
                  <span>Enable POSAPI type detection</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input
                    type="checkbox"
                    checked={receiptItemsToggleValue}
                    onChange={(e) =>
                      setConfig((c) => ({
                        ...c,
                        posApiEnableReceiptItems: e.target.checked,
                      }))
                    }
                    disabled={!endpointSupportsItems || !endpointReceiptItemsEnabled}
                  />
                  <span>Enable receipt items</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input
                    type="checkbox"
                    checked={receiptTaxTypesToggleValue}
                    onChange={(e) =>
                      setConfig((c) => ({
                        ...c,
                        posApiEnableReceiptTaxTypes: e.target.checked,
                      }))
                    }
                    disabled={!endpointReceiptTaxTypesEnabled}
                  />
                  <span>Enable receipt tax types</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input
                    type="checkbox"
                    checked={paymentMethodsToggleValue}
                    onChange={(e) =>
                      setConfig((c) => ({
                        ...c,
                        posApiEnablePaymentMethods: e.target.checked,
                    }))
                    }
                    disabled={!endpointPaymentMethodsEnabled}
                  />
                  <span>Enable payment capture</span>
                </label>
              </div>
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '1rem',
                }}
              >
                {receiptTypesFeatureEnabled && (
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <input
                      type="checkbox"
                      checked={receiptTypesAllowMultiple}
                      onChange={(e) =>
                        setConfig((c) => ({
                          ...c,
                          posApiAllowMultipleReceiptTypes: e.target.checked,
                        }))
                      }
                      disabled={!receiptTypesFeatureEnabled}
                    />
                    <span>Allow multiple POSAPI types</span>
                  </label>
                )}
                {receiptTaxTypesFeatureEnabled && (
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <input
                      type="checkbox"
                      checked={receiptTaxTypesAllowMultiple}
                      onChange={(e) =>
                        setConfig((c) => ({
                          ...c,
                          posApiAllowMultipleReceiptTaxTypes: e.target.checked,
                        }))
                      }
                      disabled={!receiptTaxTypesFeatureEnabled}
                    />
                    <span>Allow multiple receipt tax types</span>
                  </label>
                )}
                {paymentMethodsFeatureEnabled && (
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <input
                      type="checkbox"
                      checked={paymentMethodsAllowMultiple}
                      onChange={(e) =>
                        setConfig((c) => ({
                          ...c,
                          posApiAllowMultiplePaymentMethods: e.target.checked,
                        }))
                      }
                      disabled={
                        !paymentMethodsFeatureEnabled || selectedEndpoint?.supportsMultiplePayments === false
                      }
                    />
                    <span>Allow multiple payments</span>
                  </label>
                )}
              </div>
            </div>
          </details>
        </>
      )}
      {config.posApiEnabled && (
        <>
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
      {responseFields.length > 0 && (
        <div style={{ marginBottom: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <strong>Response field mappings</strong>
          <p style={{ fontSize: '0.85rem', color: '#555' }}>
            Map POSAPI response fields to transaction columns or mark them as intentionally not
            mapped.
          </p>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
              gap: '0.75rem',
            }}
          >
            {responseFields.map((field) => {
              const listId = `posapi-response-${field.key}`;
              const mappedValue = responseFieldMappings[field.key] || '';
              const isIgnored = unmappedResponseFields.includes(field.key);
              return (
                <label
                  key={`response-${field.key}`}
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
                    {field.label}
                    <span
                      style={{
                        ...BADGE_BASE_STYLE,
                        ...(field.required ? REQUIRED_BADGE_STYLE : OPTIONAL_BADGE_STYLE),
                      }}
                    >
                      {field.required ? 'Required' : 'Optional'}
                    </span>
                  </span>
                  <input
                    type="text"
                    list={listId}
                    value={mappedValue}
                    onChange={(e) => updateResponseFieldMapping(field.key, e.target.value)}
                    placeholder="Column name"
                    disabled={!config.posApiEnabled || isIgnored}
                  />
                  <datalist id={listId}>
                    {columnOptions.map((col) => (
                      <option key={`response-${field.key}-${col}`} value={col} />
                    ))}
                  </datalist>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <input
                      type="checkbox"
                      checked={isIgnored}
                      onChange={(e) => toggleResponseFieldIgnored(field.key, e.target.checked)}
                      disabled={!config.posApiEnabled}
                    />
                    <span>Mark as not mapped</span>
                  </label>
                  {field.description && <small style={{ color: '#555' }}>{field.description}</small>}
                </label>
              );
            })}
          </div>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <span style={{ fontWeight: 600 }}>Not mapped response fields</span>
            <textarea
              rows={3}
              value={unmappedResponseFieldsText}
              onChange={(e) => handleUnmappedResponseFieldsChange(e.target.value)}
              placeholder="customField\nlegacyValue"
              disabled={!config.posApiEnabled}
              style={{ fontFamily: 'monospace', resize: 'vertical' }}
            />
            <small style={{ color: '#666' }}>
              One field per line that should be ignored when processing the response payload.
            </small>
          </label>
        </div>
      )}
      <div>
        <strong>Field mapping</strong>
        <p style={{ fontSize: '0.85rem', color: '#555' }}>
          Map POSAPI fields to columns in the master transaction table. Leave blank to skip optional
          fields.
        </p>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '0.75rem',
            marginTop: '0.5rem',
          }}
        >
          {primaryPosApiFields.map((field) => {
            const listId = `posapi-${field.key}-columns`;
            const hint = topLevelFieldHints[field.key] || {};
            const isRequired = Boolean(hint.required);
            const description = hint.description;
            return (
              <label key={field.key} style={{ display: 'flex', flexDirection: 'column' }}>
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
                </span>
                <input
                  type="text"
                  list={listId}
                  value={config.posApiMapping?.[field.key] || ''}
                  onChange={(e) => updatePosApiMapping(field.key, e.target.value)}
                  placeholder="Column name"
                  disabled={!config.posApiEnabled}
                />
                <datalist id={listId}>
                  {columnOptions.map((col) => (
                    <option key={`primary-${field.key}-${col}`} value={col} />
                  ))}
                </datalist>
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
                      {obj.fields.map((field) => {
                        const rawValue = mapping[field.key] || '';
                        const parsed = parseFieldSource(rawValue, primaryTableName);
                        const selectedTable = parsed.table;
                        const columnValue = parsed.column;
                        const listId = `posapi-object-${obj.id}-${field.key}-${selectedTable || 'master'}`;
                        const availableColumns = selectedTable
                          ? tableColumns[selectedTable] || []
                          : primaryTableColumns;
                        return (
                          <div
                            key={`obj-${obj.id}-${field.key}`}
                            style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}
                          >
                            <span style={{ fontWeight: 600, color: '#0f172a' }}>
                              {field.label || humanizeFieldLabel(field.key)}
                            </span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                              <select
                                value={selectedTable}
                                onChange={(e) => {
                                  const tbl = e.target.value;
                                  if (tbl) onEnsureColumnsLoaded(tbl);
                                  updateObjectFieldMapping(
                                    obj.id,
                                    field.key,
                                    buildFieldSource(tbl, columnValue),
                                  );
                                }}
                                disabled={!config.posApiEnabled}
                                style={{ minWidth: '160px' }}
                              >
                                <option value="">{primaryTableLabel}</option>
                                {tableChoices.map((tbl) => (
                                  <option key={`obj-${obj.id}-${field.key}-tbl-${tbl}`} value={tbl}>
                                    {tbl}
                                  </option>
                                ))}
                                {selectedTable &&
                                  !tableChoices.includes(selectedTable) &&
                                  selectedTable !== primaryTableName && (
                                    <option value={selectedTable}>{selectedTable}</option>
                                  )}
                              </select>
                              <input
                                type="text"
                                list={listId}
                                value={columnValue}
                                onChange={(e) =>
                                  updateObjectFieldMapping(
                                    obj.id,
                                    field.key,
                                    buildFieldSource(selectedTable, e.target.value),
                                  )
                                }
                                placeholder="Column or path"
                                disabled={!config.posApiEnabled}
                                style={{ flex: '1 1 160px', minWidth: '160px' }}
                              />
                            </div>
                            <datalist id={listId}>
                              {(availableColumns || []).map((col) => (
                                <option key={`obj-${obj.id}-${field.key}-${col}`} value={col} />
                              ))}
                            </datalist>
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
            {itemMappingFields.map((field) => {
              const rawValue = resolvedItemFieldMapping[field.key] || '';
                  const parsed = parseFieldSource(rawValue, primaryTableName);
                  const selectedTable = parsed.table;
                  const columnValue = parsed.column;
                  const listId = `posapi-item-${field.key}-columns-${selectedTable || 'master'}`;
                  const availableColumns = selectedTable
                    ? tableColumns[selectedTable] || []
                    : primaryTableColumns;
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
                  return (
                    <div
                      key={`item-${field.key}`}
                      style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}
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
                      </span>
                      <div
                        style={{
                          display: 'flex',
                          flexWrap: 'wrap',
                          gap: '0.5rem',
                          alignItems: 'center',
                        }}
                      >
                        <select
                          value={selectedTable}
                          onChange={(e) => {
                            const nextTable = e.target.value;
                            if (nextTable) onEnsureColumnsLoaded(nextTable);
                            const nextValue = buildFieldSource(nextTable, parsed.column);
                            updatePosApiNestedMapping('itemFields', field.key, nextValue);
                          }}
                          disabled={!config.posApiEnabled}
                          style={{ minWidth: '160px' }}
                        >
                          <option value="">{primaryTableLabel}</option>
                          {filteredChoices.map((tbl) => (
                            <option key={`item-${field.key}-table-${tbl}`} value={tbl}>
                              {tbl}
                            </option>
                          ))}
                        </select>
                        <input
                          type="text"
                          list={listId}
                          value={columnValue}
                          onChange={(e) =>
                            updatePosApiNestedMapping(
                              'itemFields',
                              field.key,
                              buildFieldSource(selectedTable, e.target.value),
                            )
                          }
                          placeholder="Column or path"
                          disabled={!config.posApiEnabled}
                          style={{ flex: '1 1 140px', minWidth: '140px' }}
                        />
                      </div>
                      <datalist id={listId}>
                        {(availableColumns || []).map((col) => (
                          <option
                            key={`item-${field.key}-${selectedTable || 'master'}-${col}`}
                            value={col}
                          />
                        ))}
                      </datalist>
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
                {paymentMappingFields.map((field) => {
                  const listId = `posapi-payment-${field.key}-columns`;
                  const hint = paymentFieldHints[field.key] || {};
                  return (
                    <label
                      key={`payment-${field.key}`}
                      style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}
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
                      </span>
                      <input
                        type="text"
                        list={listId}
                        value={resolvedPaymentFieldMapping[field.key] || ''}
                        onChange={(e) =>
                          updatePosApiNestedMapping('paymentFields', field.key, e.target.value)
                        }
                        placeholder="Column or path"
                        disabled={!config.posApiEnabled}
                      />
                      {hint.description && <small style={{ color: '#555' }}>{hint.description}</small>}
                      <datalist id={listId}>
                        {columnOptions.map((col) => (
                          <option key={`payment-${field.key}-${col}`} value={col} />
                        ))}
                      </datalist>
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
                {receiptMappingFields.map((field) => {
                  const listId = `posapi-receipt-${field.key}-columns`;
                  const hint = receiptFieldHints[field.key] || {};
                  return (
                    <label
                      key={`receipt-${field.key}`}
                      style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}
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
                      </span>
                      <input
                        type="text"
                        list={listId}
                        value={resolvedReceiptFieldMapping[field.key] || ''}
                        onChange={(e) =>
                          updatePosApiNestedMapping('receiptFields', field.key, e.target.value)
                        }
                        placeholder="Column or path"
                        disabled={!config.posApiEnabled}
                      />
                      {hint.description && <small style={{ color: '#555' }}>{hint.description}</small>}
                      <datalist id={listId}>
                        {columnOptions.map((col) => (
                          <option key={`receipt-${field.key}-${col}`} value={col} />
                        ))}
                      </datalist>
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
            <strong>{supportsItems ? 'Payment mapping overrides' : 'Service payment mappings'}</strong>
            <p style={{ fontSize: '0.85rem', color: '#555' }}>
              {supportsItems
                ? 'Map stored payment breakdowns to the POSAPI method codes returned by the endpoint.'
                : 'Map payment information captured on the transaction record to each available POSAPI method code.'}
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
      </>
    )}
    </section>
  );
}
