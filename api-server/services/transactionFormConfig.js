import fs from 'fs/promises';
import path from 'path';
import { tenantConfigPath, getConfigPath } from '../utils/configPaths.js';
import { loadEndpoints } from './posApiRegistry.js';

  async function readConfig(companyId = 0) {
    const { path: filePath, isDefault } = await getConfigPath(
      'transactionForms.json',
      companyId,
    );
    try {
      const data = await fs.readFile(filePath, 'utf8');
      return { cfg: JSON.parse(data), isDefault };
    } catch {
      return { cfg: {}, isDefault: true };
    }
  }

async function writeConfig(cfg, companyId = 0) {
  const filePath = tenantConfigPath('transactionForms.json', companyId);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(cfg, null, 2));
}

function arrify(val) {
  if (Array.isArray(val)) return val.map((v) => String(v));
  if (val === undefined || val === null) return [];
  return [String(val)];
}

function normalizeMixedAccessList(list) {
  if (!Array.isArray(list) || list.length === 0) return [];
  const normalized = [];
  list.forEach((value) => {
    if (value === undefined || value === null) return;
    const num = Number(value);
    if (Number.isFinite(num)) {
      normalized.push(num);
      return;
    }
    const str = String(value).trim();
    if (str) normalized.push(str);
  });
  return normalized;
}

function sanitizeMappingHintField(field) {
  if (!field || typeof field !== 'object') return null;
  const key = typeof field.field === 'string' ? field.field.trim() : '';
  if (!key) return null;
  return {
    field: key,
    required: Boolean(field.required),
    description:
      typeof field.description === 'string' ? field.description : undefined,
  };
}

function deriveFieldDescriptions(requestFields, responseFields) {
  const descriptions = {};
  const addDescriptions = (fields = []) => {
    fields.forEach((entry) => {
      const field = typeof entry?.field === 'string' ? entry.field.trim() : '';
      if (!field || typeof entry.description !== 'string') return;
      if (!descriptions[field]) {
        descriptions[field] = entry.description;
      }
    });
  };
  addDescriptions(requestFields);
  addDescriptions(responseFields);
  return descriptions;
}

function deriveMappingHints(endpoint) {
  if (!endpoint || typeof endpoint !== 'object') return undefined;
  const requestFields = Array.isArray(endpoint.requestFields) ? endpoint.requestFields : [];
  const nestedObjects =
    Array.isArray(endpoint.nestedObjects) && endpoint.nestedObjects.length
      ? endpoint.nestedObjects
      : [];
  const result = {};

  const topLevelFields = [];
  const receiptFields = [];
  const itemFields = [];
  const paymentFields = [];

  requestFields.forEach((entry) => {
    const field = typeof entry?.field === 'string' ? entry.field.trim() : '';
    if (!field) return;
    const base = {
      field,
      required: Boolean(entry.required),
      ...(typeof entry.description === 'string' ? { description: entry.description } : {}),
    };
    if (field.startsWith('receipts[].items[].')) {
      itemFields.push({ ...base, field: field.replace('receipts[].items[].', '') });
      return;
    }
    if (field.startsWith('receipts[].payments[].')) {
      paymentFields.push({ ...base, field: field.replace('receipts[].payments[].', '') });
      return;
    }
    if (field.startsWith('payments[].')) {
      paymentFields.push({ ...base, field: field.replace('payments[].', '') });
      return;
    }
    if (field.startsWith('receipts[].')) {
      receiptFields.push({ ...base, field: field.replace('receipts[].', '') });
      return;
    }
    topLevelFields.push(base);
  });

  if (topLevelFields.length) {
    result.topLevelFields = topLevelFields;
  }

  if (itemFields.length) {
    result.itemFields = itemFields;
  }

  if (receiptFields.length) {
    const types = Array.isArray(endpoint.receiptTypes) ? endpoint.receiptTypes : [];
    if (types.length) {
      result.receiptGroups = types.map((type) => ({ type, fields: receiptFields }));
    }
    result.receiptFields = receiptFields;
  }

  if (endpoint.paymentMethodFields && typeof endpoint.paymentMethodFields === 'object') {
    const entries = Object.entries(endpoint.paymentMethodFields)
      .map(([method, fields]) => {
        if (typeof method !== 'string') return null;
        const mappedFields = Array.isArray(fields)
          ? fields
              .map((field) => {
                if (!field || typeof field !== 'object') return null;
                const key = typeof field.field === 'string' ? field.field.trim() : '';
                if (!key) return null;
                return {
                  field: key,
                  required: Boolean(field.required),
                  ...(typeof field.description === 'string' ? { description: field.description } : {}),
                };
              })
              .filter(Boolean)
          : [];
        if (!mappedFields.length) return null;
        return { method, fields: mappedFields };
      })
      .filter(Boolean);
    if (entries.length) {
      result.paymentMethods = entries;
    }
  }

  if (paymentFields.length) {
    result.paymentFields = paymentFields;
  }

  const hasReceiptContent = requestFields.some((entry) => typeof entry?.field === 'string' && entry.field.includes('receipts'));
  const hasPaymentContent = requestFields.some(
    (entry) => typeof entry?.field === 'string' && entry.field.includes('payments'),
  );
  if (hasReceiptContent || hasPaymentContent) {
    result.nestedPaths = {
      ...(hasReceiptContent ? { receipts: 'receipts[]', items: 'items[]' } : {}),
      ...(hasPaymentContent ? { payments: 'payments[]' } : {}),
    };
  }

  if (nestedObjects.length) {
    result.nestedObjects = nestedObjects;
  }
  if (
    endpoint.nestedPaths &&
    typeof endpoint.nestedPaths === 'object' &&
    !Array.isArray(endpoint.nestedPaths)
  ) {
    result.nestedPaths = endpoint.nestedPaths;
  }

  return Object.keys(result).length ? result : undefined;
}

function normalizeInfoEndpointMappingList(source, mode) {
  if (!source) return [];
  if (Array.isArray(source)) return source;
  if (typeof source === 'object') {
    return Object.entries(source)
      .map(([field, value]) => {
        if (typeof field !== 'string') return null;
        if (mode === 'request') {
          if (typeof value === 'string') return { field, source: value };
          if (value && typeof value === 'object') return { field, ...value };
          if (value !== undefined && value !== null) return { field, source: String(value) };
        } else {
          if (typeof value === 'string') return { field, target: value };
          if (value && typeof value === 'object') return { field, ...value };
          if (value !== undefined && value !== null) return { field, target: String(value) };
        }
        return { field };
      })
      .filter(Boolean);
  }
  return [];
}

function sanitizeInfoEndpointMappingEntry(entry, mode = 'response') {
  if (!entry || typeof entry !== 'object') return null;
  const field = typeof entry.field === 'string' ? entry.field.trim() : '';
  if (!field) return null;
  const result = { field };
  if (mode === 'request') {
    const source = typeof entry.source === 'string' ? entry.source.trim() : '';
    if (source) result.source = source;
    if (entry.value !== undefined && entry.value !== null && entry.value !== '') {
      result.value =
        typeof entry.value === 'string' ? entry.value : String(entry.value);
    }
    if (entry.fallback !== undefined && entry.fallback !== null && entry.fallback !== '') {
      result.fallback =
        typeof entry.fallback === 'string' ? entry.fallback : String(entry.fallback);
    }
  } else {
    const target =
      typeof entry.target === 'string' && entry.target.trim()
        ? entry.target.trim()
        : field;
    result.target = target;
    if (typeof entry.joinWith === 'string' && entry.joinWith) {
      result.joinWith = entry.joinWith;
    }
    if (typeof entry.pick === 'string' && entry.pick) {
      const pick = entry.pick.trim().toLowerCase();
      if (pick === 'first' || pick === 'join') {
        result.pick = pick;
      }
    }
    if (entry.fallback !== undefined && entry.fallback !== null && entry.fallback !== '') {
      result.fallback =
        typeof entry.fallback === 'string' ? entry.fallback : String(entry.fallback);
    }
    if (typeof entry.targetLabel === 'string' && entry.targetLabel.trim()) {
      result.targetLabel = entry.targetLabel.trim();
    }
  }
  if (typeof entry.description === 'string' && entry.description.trim()) {
    result.description = entry.description.trim();
  }
  if (entry.required !== undefined) {
    result.required = Boolean(entry.required);
  }
  return result;
}

function collectMappingEntries(entry, mode = 'response') {
  if (!entry || typeof entry !== 'object') return [];
  const keys =
    mode === 'request'
      ? ['requestMappings', 'requestMapping', 'requestFieldMap', 'requestMap']
      : ['responseMappings', 'responseMapping', 'responseFieldMap', 'responseMap'];
  for (const key of keys) {
    if (entry[key] !== undefined) {
      return normalizeInfoEndpointMappingList(entry[key], mode);
    }
  }
  return [];
}

function sanitizeInfoEndpointOverride(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const id = typeof entry.id === 'string' ? entry.id.trim() : '';
  if (!id) return null;
  const config = {};
  if (typeof entry.label === 'string' && entry.label.trim()) {
    config.label = entry.label.trim();
  }
  if (typeof entry.quickActionLabel === 'string' && entry.quickActionLabel.trim()) {
    config.quickActionLabel = entry.quickActionLabel.trim();
  }
  if (typeof entry.description === 'string' && entry.description.trim()) {
    config.description = entry.description.trim();
  }
  if (typeof entry.modalTitle === 'string' && entry.modalTitle.trim()) {
    config.modalTitle = entry.modalTitle.trim();
  }
  if (entry.autoInvoke !== undefined) {
    config.autoInvoke = Boolean(entry.autoInvoke);
  }
  if (entry.payloadDefaults && typeof entry.payloadDefaults === 'object' && !Array.isArray(entry.payloadDefaults)) {
    const defaults = {};
    Object.entries(entry.payloadDefaults).forEach(([key, val]) => {
      if (typeof key !== 'string') return;
      if (val === undefined || val === null) return;
      if (typeof val === 'string') {
        const trimmed = val.trim();
        if (trimmed) defaults[key] = trimmed;
      } else if (typeof val === 'number' || typeof val === 'bigint' || typeof val === 'boolean') {
        defaults[key] = String(val);
      }
    });
    if (Object.keys(defaults).length) config.payloadDefaults = defaults;
  }
  const requestMappingsRaw = collectMappingEntries(entry, 'request');
  const requestMappings = requestMappingsRaw
    .map((mapping) => sanitizeInfoEndpointMappingEntry(mapping, 'request'))
    .filter(Boolean);
  if (requestMappings.length) config.requestMappings = requestMappings;
  const responseMappingsRaw = collectMappingEntries(entry, 'response');
  const responseMappings = responseMappingsRaw
    .map((mapping) => sanitizeInfoEndpointMappingEntry(mapping, 'response'))
    .filter(Boolean);
  if (responseMappings.length) config.responseMappings = responseMappings;
  if (Object.keys(config).length === 0) return { id, config: {} };
  return { id, config };
}

function parseInfoEndpointList(source) {
  const ids = [];
  const config = {};
  if (!Array.isArray(source)) return { ids, config };
  source.forEach((entry) => {
    if (typeof entry === 'string') {
      const id = entry.trim();
      if (id && !ids.includes(id)) ids.push(id);
      return;
    }
    const sanitized = sanitizeInfoEndpointOverride(entry);
    if (!sanitized || !sanitized.id) return;
    if (!ids.includes(sanitized.id)) ids.push(sanitized.id);
    if (sanitized.config && Object.keys(sanitized.config).length > 0) {
      config[sanitized.id] = sanitized.config;
    }
  });
  return { ids, config };
}

function sanitizeInfoEndpointConfigMap(source) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) return {};
  const result = {};
  Object.entries(source).forEach(([id, value]) => {
    if (typeof id !== 'string') return;
    if (!value || typeof value !== 'object') return;
    const sanitized = sanitizeInfoEndpointOverride({ id, ...value });
    if (!sanitized) return;
    result[id] = sanitized.config || {};
  });
  return result;
}

function sanitizeEndpointForClient(endpoint) {
  if (!endpoint || typeof endpoint !== 'object') return null;
  const receiptTypes = Array.isArray(endpoint.receiptTypes)
    ? endpoint.receiptTypes
        .map((value) => (typeof value === 'string' ? value.trim() : ''))
        .filter((value) => value)
    : [];
  const paymentMethods = Array.isArray(endpoint.paymentMethods)
    ? endpoint.paymentMethods
        .map((value) => (typeof value === 'string' ? value.trim() : ''))
        .filter((value) => value)
    : [];
  const sanitizeFieldList = (list, { allowPath = false } = {}) =>
    Array.isArray(list)
      ? list
          .map((entry) => {
            if (!entry || typeof entry !== 'object') return null;
            const rawField =
              typeof entry.field === 'string'
                ? entry.field
                : allowPath && typeof entry.path === 'string'
                  ? entry.path
                  : '';
            const field = rawField.trim();
            if (!field) return null;
            const base = {
              field,
              ...(allowPath ? { path: field } : {}),
              required: Boolean(entry.required),
              description:
                typeof entry.description === 'string' ? entry.description : undefined,
            };
            if (allowPath && typeof entry.destField === 'string' && entry.destField.trim()) {
              base.destField = entry.destField.trim();
            }
            if (allowPath && typeof entry.label === 'string' && entry.label.trim()) {
              base.label = entry.label.trim();
            }
            if (allowPath && typeof entry.type === 'string' && entry.type.trim()) {
              base.type = entry.type.trim();
            }
            return base;
          })
          .filter(Boolean)
      : [];

  const sanitizeParameters = (list) =>
    Array.isArray(list)
      ? list
          .map((entry) => {
            if (!entry || typeof entry !== 'object') return null;
            const name = typeof entry.name === 'string' ? entry.name.trim() : '';
            if (!name) return null;
            const location = typeof entry.in === 'string' ? entry.in.trim() : '';
            return {
              name,
              in: location || undefined,
              required: Boolean(entry.required),
              description:
                typeof entry.description === 'string' ? entry.description : undefined,
              example:
                entry.example !== undefined && entry.example !== null
                  ? entry.example
                  : undefined,
              default:
                entry.default !== undefined && entry.default !== null
                  ? entry.default
                  : undefined,
              enum: Array.isArray(entry.enum) ? entry.enum.filter(Boolean) : undefined,
            };
          })
          .filter(Boolean)
      : [];

  const sanitized = {
    id: typeof endpoint.id === 'string' ? endpoint.id : '',
    name: typeof endpoint.name === 'string' ? endpoint.name : '',
    method: typeof endpoint.method === 'string' ? endpoint.method : 'GET',
    path: typeof endpoint.path === 'string' ? endpoint.path : '/',
    usage: typeof endpoint.usage === 'string' ? endpoint.usage : undefined,
    posApiType: typeof endpoint.posApiType === 'string' ? endpoint.posApiType : undefined,
    supportsItems: endpoint.supportsItems !== false,
    supportsMultipleReceipts: Boolean(endpoint.supportsMultipleReceipts),
    supportsMultiplePayments: Boolean(endpoint.supportsMultiplePayments),
    receiptTypes,
    paymentMethods,
    mappingHints: undefined,
  };

  if (
    endpoint.nestedPaths &&
    typeof endpoint.nestedPaths === 'object' &&
    !Array.isArray(endpoint.nestedPaths)
  ) {
    sanitized.nestedPaths = endpoint.nestedPaths;
  }

  if (typeof endpoint.defaultVariation === 'string') {
    sanitized.defaultVariation = endpoint.defaultVariation;
  }

  if (
    endpoint.variationDefaults &&
    typeof endpoint.variationDefaults === 'object' &&
    !Array.isArray(endpoint.variationDefaults)
  ) {
    sanitized.variationDefaults = endpoint.variationDefaults;
  }

  if (Array.isArray(endpoint.variations)) {
    sanitized.variations = endpoint.variations
      .map((variation) => {
        if (!variation || typeof variation !== 'object') return null;
        const key = typeof variation.key === 'string' ? variation.key.trim() : '';
        if (!key) return null;
        const entry = {
          key,
          name: typeof variation.name === 'string' ? variation.name : undefined,
          enabled: variation.enabled !== false,
        };
        if (variation.requestExample !== undefined) entry.requestExample = variation.requestExample;
        if (variation.request !== undefined) entry.request = variation.request;
        if (variation.responseExample !== undefined) entry.responseExample = variation.responseExample;
        return entry;
      })
      .filter(Boolean);
  }

  const requestFields = sanitizeFieldList(endpoint.requestFields);
  if (requestFields.length) sanitized.requestFields = requestFields;
  const responseFields = sanitizeFieldList(endpoint.responseFields, { allowPath: true });
  if (responseFields.length) sanitized.responseFields = responseFields;
  if (Array.isArray(endpoint.aggregations)) {
    sanitized.aggregations = endpoint.aggregations
      .map((agg) => {
        if (!agg || typeof agg !== 'object') return null;
        const target = typeof agg.target === 'string' ? agg.target.trim() : '';
        const source = typeof agg.source === 'string' ? agg.source.trim() : '';
        const operation = typeof agg.operation === 'string' ? agg.operation.trim() : '';
        if (!target || !source || !operation) return null;
        const sanitizedAgg = { target, source, operation };
        if (typeof agg.label === 'string' && agg.label.trim()) sanitizedAgg.label = agg.label.trim();
        return sanitizedAgg;
      })
      .filter(Boolean);
  }
  const derivedDescriptions = deriveFieldDescriptions(requestFields, responseFields);
  if (Object.keys(derivedDescriptions).length) {
    sanitized.fieldDescriptions = derivedDescriptions;
  }
  const derivedHints = deriveMappingHints({ ...sanitized, receiptTypes: endpoint.receiptTypes });
  if (derivedHints) {
    sanitized.mappingHints = derivedHints;
  }
  const nestedObjects =
    Array.isArray(endpoint.nestedObjects) && endpoint.nestedObjects.length
      ? endpoint.nestedObjects
      : derivedHints?.nestedObjects;
  if (Array.isArray(nestedObjects) && nestedObjects.length) {
    sanitized.nestedObjects = nestedObjects;
  }
  if (endpoint.requestSample && typeof endpoint.requestSample === 'object') {
    sanitized.requestSample = endpoint.requestSample;
  }
  if (endpoint.fieldDefaults && typeof endpoint.fieldDefaults === 'object') {
    sanitized.fieldDefaults = endpoint.fieldDefaults;
  }

  const parameters = sanitizeParameters(endpoint.parameters);
  if (parameters.length) sanitized.parameters = parameters;

  if (endpoint.receiptTypeDescriptions) {
    sanitized.receiptTypeDescriptions = endpoint.receiptTypeDescriptions;
  }
  if (endpoint.paymentMethodDescriptions) {
    sanitized.paymentMethodDescriptions = endpoint.paymentMethodDescriptions;
  }
  if (endpoint.taxTypeDescriptions) {
    sanitized.taxTypeDescriptions = endpoint.taxTypeDescriptions;
  }
  if (endpoint.paymentMethodFields) {
    sanitized.paymentMethodFields = endpoint.paymentMethodFields;
  }

  return sanitized;
}

function normalizePosApiMappingValue(value) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') {
    return value.trim();
  }
  if (typeof value === 'number' || typeof value === 'bigint') {
    return String(value);
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  if (Array.isArray(value)) {
    const normalizedArray = value
      .map((entry) => normalizePosApiMappingValue(entry))
      .filter((entry) => {
        if (entry === '' || entry === undefined || entry === null) return false;
        if (typeof entry === 'object' && Object.keys(entry).length === 0) return false;
        if (Array.isArray(entry) && entry.length === 0) return false;
        return true;
      });
    return normalizedArray.length ? normalizedArray : '';
  }
  if (typeof value === 'object') {
    const normalizedObject = {};
    Object.entries(value).forEach(([key, val]) => {
      if (typeof key !== 'string') return;
      const normalized = normalizePosApiMappingValue(val);
      if (
        normalized === '' ||
        normalized === undefined ||
        normalized === null ||
        (typeof normalized === 'object' && !Array.isArray(normalized) && Object.keys(normalized).length === 0) ||
        (Array.isArray(normalized) && normalized.length === 0)
      ) {
        return;
      }
      normalizedObject[key] = normalized;
    });
    return Object.keys(normalizedObject).length ? normalizedObject : '';
  }
  return String(value);
}

function sanitizePosApiMapping(source) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) return {};
  const normalized = {};
  Object.entries(source).forEach(([key, value]) => {
    if (typeof key !== 'string') return;
    const normalizedValue = normalizePosApiMappingValue(value);
    if (
      normalizedValue === '' ||
      normalizedValue === undefined ||
      normalizedValue === null ||
      (typeof normalizedValue === 'object' && !Array.isArray(normalizedValue) && Object.keys(normalizedValue).length === 0) ||
      (Array.isArray(normalizedValue) && normalizedValue.length === 0)
    ) {
      return;
    }
    normalized[key] = normalizedValue;
  });
  return normalized;
}

function parseEntry(raw = {}) {
  const temporaryFlag = Boolean(
    raw.supportsTemporarySubmission ??
      raw.allowTemporarySubmission ??
      raw.supportsTemporary ??
      false,
  );
  const mapping = sanitizePosApiMapping(raw.posApiMapping);
  const responseMapping = sanitizePosApiMapping(raw.posApiResponseMapping);
  const parsedInfo = parseInfoEndpointList(raw.infoEndpoints);
  const legacyInfoEndpoints = Array.isArray(raw.posApiInfoEndpointIds)
    ? raw.posApiInfoEndpointIds
        .map((value) => (typeof value === 'string' ? value.trim() : ''))
        .filter((value) => value)
    : [];
  const infoEndpoints = Array.from(new Set([...parsedInfo.ids, ...legacyInfoEndpoints]));
  const infoEndpointConfig = sanitizeInfoEndpointConfigMap({
    ...parsedInfo.config,
    ...(raw.infoEndpointConfig && typeof raw.infoEndpointConfig === 'object'
      ? raw.infoEndpointConfig
      : {}),
  });
  const receiptTypes = Array.isArray(raw.posApiReceiptTypes)
    ? raw.posApiReceiptTypes
        .map((value) => (typeof value === 'string' ? value.trim() : ''))
        .filter((value) => value)
    : [];
  const paymentMethods = Array.isArray(raw.posApiPaymentMethods)
    ? raw.posApiPaymentMethods
        .map((value) => (typeof value === 'string' ? value.trim() : ''))
        .filter((value) => value)
    : [];
  const aggregations = sanitizePosApiMapping(raw.posApiAggregations);
  const posApiRequestVariation =
    typeof raw.posApiRequestVariation === 'string' && raw.posApiRequestVariation.trim()
      ? raw.posApiRequestVariation.trim()
      : '';
  return {
    visibleFields: Array.isArray(raw.visibleFields)
      ? raw.visibleFields.map(String)
      : [],
    requiredFields: Array.isArray(raw.requiredFields)
      ? raw.requiredFields.map(String)
      : [],
    defaultValues: raw.defaultValues || {},
    editableDefaultFields: Array.isArray(raw.editableDefaultFields)
      ? raw.editableDefaultFields.map(String)
      : [],
    editableFields:
      raw.editableFields === undefined
        ? undefined
        : Array.isArray(raw.editableFields)
          ? raw.editableFields.map(String)
          : [],
    userIdFields: arrify(
      raw.userIdFields || (raw.userIdField ? [raw.userIdField] : []),
    ),
    branchIdFields: arrify(
      raw.branchIdFields || (raw.branchIdField ? [raw.branchIdField] : []),
    ),
    companyIdFields: arrify(
      raw.companyIdFields || (raw.companyIdField ? [raw.companyIdField] : []),
    ),
    dateField: arrify(raw.dateField),
    emailField: arrify(raw.emailField),
    imagenameField: arrify(raw.imagenameField),
    imageIdField: typeof raw.imageIdField === 'string' ? raw.imageIdField : '',
    imageFolder: typeof raw.imageFolder === 'string' ? raw.imageFolder : '',
    printEmpField: arrify(raw.printEmpField),
    printCustField: arrify(raw.printCustField),
    totalCurrencyFields: arrify(raw.totalCurrencyFields),
    totalAmountFields: arrify(raw.totalAmountFields),
    signatureFields: arrify(raw.signatureFields),
    headerFields: arrify(raw.headerFields),
    mainFields: arrify(raw.mainFields),
    footerFields: arrify(raw.footerFields),
    viewSource:
      raw && typeof raw.viewSource === 'object' && raw.viewSource !== null
        ? raw.viewSource
        : {},
    transactionTypeField:
      typeof raw.transactionTypeField === 'string'
        ? raw.transactionTypeField
        : '',
    transactionTypeValue:
      typeof raw.transactionTypeValue === 'string'
        ? raw.transactionTypeValue
        : '',
    detectFields: arrify(raw.detectFields || raw.detectField),
    moduleKey: typeof raw.moduleKey === 'string' ? raw.moduleKey : '',
    allowedBranches: Array.isArray(raw.allowedBranches)
      ? raw.allowedBranches.map((v) => Number(v)).filter((v) => !Number.isNaN(v))
      : [],
    allowedDepartments: Array.isArray(raw.allowedDepartments)
      ? raw.allowedDepartments.map((v) => Number(v)).filter((v) => !Number.isNaN(v))
      : [],
    allowedPositions: normalizeMixedAccessList(raw.allowedPositions),
    allowedUserRights: normalizeMixedAccessList(raw.allowedUserRights),
    allowedWorkplaces: normalizeMixedAccessList(raw.allowedWorkplaces),
    temporaryAllowedBranches: Array.isArray(raw.temporaryAllowedBranches)
      ? raw.temporaryAllowedBranches
          .map((v) => Number(v))
          .filter((v) => !Number.isNaN(v))
      : [],
    temporaryAllowedDepartments: Array.isArray(raw.temporaryAllowedDepartments)
      ? raw.temporaryAllowedDepartments
          .map((v) => Number(v))
          .filter((v) => !Number.isNaN(v))
      : [],
    temporaryAllowedPositions: normalizeMixedAccessList(
      raw.temporaryAllowedPositions,
    ),
    temporaryAllowedUserRights: normalizeMixedAccessList(
      raw.temporaryAllowedUserRights,
    ),
    temporaryAllowedWorkplaces: normalizeMixedAccessList(
      raw.temporaryAllowedWorkplaces,
    ),
    moduleLabel: typeof raw.moduleLabel === 'string' ? raw.moduleLabel : '',
    procedures: arrify(raw.procedures || raw.procedure),
    temporaryProcedures: arrify(raw.temporaryProcedures),
    supportsTemporarySubmission: temporaryFlag,
    allowTemporarySubmission: temporaryFlag,
    posApiEnabled: Boolean(raw.posApiEnabled),
    posApiType:
      typeof raw.posApiType === 'string' && raw.posApiType.trim()
        ? raw.posApiType.trim()
        : '',
    posApiTypeField:
      typeof raw.posApiTypeField === 'string' ? raw.posApiTypeField : '',
    posApiEndpointId:
      typeof raw.posApiEndpointId === 'string' && raw.posApiEndpointId.trim()
        ? raw.posApiEndpointId.trim()
        : '',
    posApiInfoEndpointIds: infoEndpoints,
    posApiReceiptTypes: receiptTypes,
    posApiPaymentMethods: paymentMethods,
    fieldsFromPosApi: Array.isArray(raw.fieldsFromPosApi)
      ? raw.fieldsFromPosApi
          .map((value) => (typeof value === 'string' ? value.trim() : ''))
          .filter((value) => value)
      : [],
    posApiMapping: mapping,
    posApiResponseMapping: responseMapping,
    posApiAggregations: aggregations,
    posApiRequestVariation,
    infoEndpoints,
    infoEndpointConfig,
  };
}

export async function getFormConfig(table, name, companyId = 0) {
  const { cfg, isDefault } = await readConfig(companyId);
  const byTable = cfg[table] || {};
  const raw = byTable[name];
  const parsed = parseEntry(raw);
  const endpoints = await loadEndpoints();
  const endpointMeta = endpoints.find((entry) => entry?.id === parsed.posApiEndpointId);
  const infoEndpointMeta = parsed.infoEndpoints
    .map((id) => endpoints.find((entry) => entry?.id === id))
    .filter(Boolean)
    .map((entry) => sanitizeEndpointForClient(entry));
  const config = {
    ...parsed,
    posApiEndpointMeta: sanitizeEndpointForClient(endpointMeta),
    posApiInfoEndpointMeta: infoEndpointMeta,
  };
  return { config, isDefault };
}

export async function getConfigsByTable(table, companyId = 0) {
  const { cfg, isDefault } = await readConfig(companyId);
  const endpoints = await loadEndpoints();
  const byTable = cfg[table] || {};
  const result = {};
  for (const [name, info] of Object.entries(byTable)) {
    const parsed = parseEntry(info);
    const endpointMeta = endpoints.find((entry) => entry?.id === parsed.posApiEndpointId);
    const infoEndpointMeta = parsed.infoEndpoints
      .map((id) => endpoints.find((entry) => entry?.id === id))
      .filter(Boolean)
      .map((entry) => sanitizeEndpointForClient(entry));
    result[name] = {
      ...parsed,
      posApiEndpointMeta: sanitizeEndpointForClient(endpointMeta),
      posApiInfoEndpointMeta: infoEndpointMeta,
    };
  }
  return { config: result, isDefault };
}

export async function getConfigsByTransTypeValue(val, companyId = 0) {
  const { cfg, isDefault } = await readConfig(companyId);
  const result = [];
  const endpoints = await loadEndpoints();
  for (const [tbl, names] of Object.entries(cfg)) {
    for (const [name, info] of Object.entries(names)) {
      const parsed = parseEntry(info);
      if (
        parsed.transactionTypeValue &&
        String(parsed.transactionTypeValue) === String(val)
      ) {
        const endpointMeta = endpoints.find((entry) => entry?.id === parsed.posApiEndpointId);
        const infoEndpointMeta = parsed.infoEndpoints
          .map((id) => endpoints.find((entry) => entry?.id === id))
          .filter(Boolean)
          .map((entry) => sanitizeEndpointForClient(entry));
        result.push({
          table: tbl,
          name,
          config: {
            ...parsed,
            posApiEndpointMeta: sanitizeEndpointForClient(endpointMeta),
            posApiInfoEndpointMeta: infoEndpointMeta,
          },
        });
      }
    }
  }
  return { configs: result, isDefault };
}

export async function findTableByProcedure(proc, companyId = 0) {
  if (!proc) return { table: null, isDefault: false };
  const { cfg, isDefault } = await readConfig(companyId);
  for (const [tbl, names] of Object.entries(cfg)) {
    for (const info of Object.values(names)) {
      const parsed = parseEntry(info);
      if (parsed.procedures.includes(proc)) return { table: tbl, isDefault };
    }
  }
  return { table: null, isDefault };
}

export async function listTransactionNames(
  {
    moduleKey,
    branchId,
    departmentId,
    userRightId,
    workplaceId,
    positionId,
    workplacePositionId,
    workplacePositionMap,
    workplacePositions,
    workplacePositionById,
    workplacePositionsMap,
    workplacesWithPositions,
  } = {},
  companyId = 0,
) {
  const normalizeAccessValue = (value) => {
    if (value === undefined || value === null) return null;
    const str = String(value).trim();
    if (!str) return null;
    const num = Number(str);
    return Number.isFinite(num) ? num : str;
  };

  const matchesScope = (list, value) => {
    if (!Array.isArray(list) || list.length === 0) return true;
    if (Array.isArray(value)) {
      const normalizedValues = value
        .map((item) => normalizeAccessValue(item))
        .filter((val) => val !== null);
      if (normalizedValues.length === 0) return false;
      return normalizedValues.some((val) => list.includes(val));
    }
    const normalizedValue = normalizeAccessValue(value);
    if (normalizedValue === null) return true;
    return list.includes(normalizedValue);
  };

  const resolveWorkplacePosition = (workplaceValue) => {
    const workplaces = Array.isArray(workplaceValue) ? workplaceValue : [workplaceValue];
    for (const wp of workplaces) {
      const normalizedWorkplace = normalizeAccessValue(wp);
      if (normalizedWorkplace === null) continue;

      const mapCandidates = [
        workplacePositionMap,
        workplacePositionById,
        workplacePositionsMap,
      ];
      for (const map of mapCandidates) {
        if (map && typeof map === 'object' && !Array.isArray(map)) {
          const mapped = normalizeAccessValue(map[normalizedWorkplace]);
          if (mapped !== null) return mapped;
        }
      }

      const listCandidates = [workplacePositions, workplacesWithPositions];
      for (const list of listCandidates) {
        if (!Array.isArray(list)) continue;
        for (const entry of list) {
          const entryWorkplace = normalizeAccessValue(
            entry?.workplaceId ?? entry?.workplace_id ?? entry?.workplace ?? entry?.id,
          );
          if (entryWorkplace !== normalizedWorkplace) continue;
          const position = normalizeAccessValue(
            entry?.positionId ??
              entry?.position_id ??
              entry?.position ??
              entry?.workplacePositionId ??
              entry?.workplace_position_id,
          );
          if (position !== null) return position;
        }
      }

      const direct = normalizeAccessValue(
        workplacePositionId ??
          workplacePositionMap?.[normalizedWorkplace] ??
          workplacePositionById?.[normalizedWorkplace],
      );
      if (direct !== null) return direct;
    }
    return null;
  };

  const isPositionAllowed = (allowedPositions, value, workplaceValue) => {
    if (!Array.isArray(allowedPositions) || allowedPositions.length === 0) return true;

    if (workplaceValue !== null && workplaceValue !== undefined) {
      const resolved = resolveWorkplacePosition(workplaceValue);
      if (resolved !== null) {
        return matchesScope(allowedPositions, resolved);
      }
    }

    return matchesScope(allowedPositions, value);
  };

  const { cfg, isDefault } = await readConfig(companyId);
  const result = {};
  const bId = branchId ? Number(branchId) : null;
  const dId = departmentId ? Number(departmentId) : null;
  const userRightValue =
    userRightId === undefined || userRightId === null
      ? null
      : Number.isFinite(Number(userRightId))
        ? Number(userRightId)
        : String(userRightId).trim() || null;
  const workplaceValue =
    workplaceId === undefined || workplaceId === null
      ? null
      : Number.isFinite(Number(workplaceId))
        ? Number(workplaceId)
        : String(workplaceId).trim() || null;
  const positionValue =
    positionId === undefined || positionId === null
      ? null
      : Number.isFinite(Number(positionId))
        ? Number(positionId)
        : String(positionId).trim() || null;
  for (const [tbl, names] of Object.entries(cfg)) {
    for (const [name, info] of Object.entries(names)) {
      const parsed = parseEntry(info);
      const modKey = parsed.moduleKey;
      if (moduleKey && moduleKey !== modKey) continue;

      const allowedBranches = Array.isArray(parsed.allowedBranches)
        ? parsed.allowedBranches
        : [];
      const allowedDepartments = Array.isArray(parsed.allowedDepartments)
        ? parsed.allowedDepartments
        : [];
      const allowedPositions = Array.isArray(parsed.allowedPositions)
        ? parsed.allowedPositions
        : [];
      const allowedUserRights = Array.isArray(parsed.allowedUserRights)
        ? parsed.allowedUserRights
        : [];
      const allowedWorkplaces = Array.isArray(parsed.allowedWorkplaces)
        ? parsed.allowedWorkplaces
        : [];
      const tempBranches = Array.isArray(parsed.temporaryAllowedBranches)
        ? parsed.temporaryAllowedBranches
        : [];
      const tempDepartments = Array.isArray(parsed.temporaryAllowedDepartments)
        ? parsed.temporaryAllowedDepartments
        : [];
      const tempPositions = Array.isArray(parsed.temporaryAllowedPositions)
        ? parsed.temporaryAllowedPositions
        : [];
      const tempUserRights = Array.isArray(parsed.temporaryAllowedUserRights)
        ? parsed.temporaryAllowedUserRights
        : [];
      const tempWorkplaces = Array.isArray(parsed.temporaryAllowedWorkplaces)
        ? parsed.temporaryAllowedWorkplaces
        : [];

      const branchAllowed =
        allowedBranches.length === 0 ||
        bId == null ||
        allowedBranches.includes(bId);
      const departmentAllowed =
        allowedDepartments.length === 0 ||
        dId == null ||
        allowedDepartments.includes(dId);
      const positionAllowed = isPositionAllowed(allowedPositions, positionValue, workplaceValue);
      const userRightAllowed =
        allowedUserRights.length === 0 ||
        userRightValue === null ||
        allowedUserRights.includes(userRightValue);
      const workplaceAllowed =
        allowedWorkplaces.length === 0 ||
        workplaceValue === null ||
        allowedWorkplaces.includes(workplaceValue);

      let permitted =
        branchAllowed &&
        departmentAllowed &&
        positionAllowed &&
        userRightAllowed &&
        workplaceAllowed;

      if (!permitted) {
        const tempEnabled = Boolean(
          parsed.supportsTemporarySubmission ||
            parsed.allowTemporarySubmission ||
            parsed.supportsTemporary,
        );
        if (tempEnabled) {
          const tempBranchAllowed =
            tempBranches.length === 0 ||
            bId == null ||
            tempBranches.includes(bId);
          const tempDepartmentAllowed =
            tempDepartments.length === 0 ||
            dId == null ||
            tempDepartments.includes(dId);
          const tempPositionAllowed = isPositionAllowed(
            tempPositions,
            positionValue,
            workplaceValue,
          );
          const tempUserRightAllowed =
            tempUserRights.length === 0 ||
            userRightValue === null ||
            tempUserRights.includes(userRightValue);
          const tempWorkplaceAllowed =
            tempWorkplaces.length === 0 ||
            workplaceValue === null ||
            tempWorkplaces.includes(workplaceValue);
          permitted =
            tempBranchAllowed &&
            tempDepartmentAllowed &&
            tempPositionAllowed &&
            tempUserRightAllowed &&
            tempWorkplaceAllowed;
        }
      }

      if (!permitted) continue;

      result[name] = { table: tbl, ...parsed };
    }
  }
  return { names: result, isDefault };
}

export async function setFormConfig(
  table,
  name,
  config,
  options = {},
  companyId = 0,
) {
  const {
    visibleFields = [],
    requiredFields = [],
    defaultValues = {},
    editableDefaultFields = [],
    editableFields,
    userIdFields = [],
    branchIdFields = [],
    companyIdFields = [],
    allowedBranches = [],
    allowedDepartments = [],
    allowedPositions = [],
    allowedUserRights = [],
    allowedWorkplaces = [],
    temporaryAllowedBranches = [],
    temporaryAllowedDepartments = [],
    temporaryAllowedPositions = [],
    temporaryAllowedUserRights = [],
    temporaryAllowedWorkplaces = [],
    moduleKey: parentModuleKey = '',
    moduleLabel,
    userIdField,
    branchIdField,
    companyIdField,
    dateField = [],
    emailField = [],
    imagenameField = [],
    imageIdField = '',
    imageFolder = '',
    printEmpField = [],
    printCustField = [],
    totalCurrencyFields = [],
    totalAmountFields = [],
    signatureFields = [],
    headerFields = [],
    mainFields = [],
    footerFields = [],
    viewSource = {},
    transactionTypeField = '',
    transactionTypeValue = '',
    detectFields = [],
    detectField = '',
    procedures = [],
    temporaryProcedures = [],
    supportsTemporarySubmission,
    allowTemporarySubmission,
    posApiEnabled = false,
    posApiType = '',
    posApiTypeField = '',
    posApiEndpointId = '',
    posApiInfoEndpointIds = [],
    posApiReceiptTypes = [],
    posApiPaymentMethods = [],
    fieldsFromPosApi = [],
    infoEndpoints = [],
    posApiMapping = {},
    posApiResponseMapping = {},
    infoEndpointConfig = {},
  } = config || {};
  const uid = arrify(userIdFields.length ? userIdFields : userIdField ? [userIdField] : []);
  const bid = arrify(
    branchIdFields.length ? branchIdFields : branchIdField ? [branchIdField] : [],
  );
  const cid = arrify(
    companyIdFields.length ? companyIdFields : companyIdField ? [companyIdField] : [],
  );
  const ab = Array.isArray(allowedBranches)
    ? allowedBranches.map((v) => Number(v)).filter((v) => !Number.isNaN(v))
    : [];
  const ad = Array.isArray(allowedDepartments)
    ? allowedDepartments.map((v) => Number(v)).filter((v) => !Number.isNaN(v))
    : [];
  const ap = normalizeMixedAccessList(allowedPositions);
  const aur = normalizeMixedAccessList(allowedUserRights);
  const aw = normalizeMixedAccessList(allowedWorkplaces);
  const tab = Array.isArray(temporaryAllowedBranches)
    ? temporaryAllowedBranches.map((v) => Number(v)).filter((v) => !Number.isNaN(v))
    : [];
  const tad = Array.isArray(temporaryAllowedDepartments)
    ? temporaryAllowedDepartments.map((v) => Number(v)).filter((v) => !Number.isNaN(v))
    : [];
  const tap = normalizeMixedAccessList(temporaryAllowedPositions);
  const taur = normalizeMixedAccessList(temporaryAllowedUserRights);
  const taw = normalizeMixedAccessList(temporaryAllowedWorkplaces);
  const tempProcedures = Array.isArray(temporaryProcedures)
    ? temporaryProcedures
        .map((proc) => (typeof proc === 'string' ? proc.trim() : ''))
        .filter((proc) => proc)
    : [];
  const { cfg } = await readConfig(companyId);
  if (!cfg[table]) cfg[table] = {};
  cfg[table][name] = {
    visibleFields: arrify(visibleFields),
    requiredFields: arrify(requiredFields),
    defaultValues,
    editableDefaultFields: arrify(editableDefaultFields),
    editableFields: arrify(editableFields),
    userIdFields: uid,
    branchIdFields: bid,
    companyIdFields: cid,
    dateField: arrify(dateField),
    emailField: arrify(emailField),
    imagenameField: arrify(imagenameField),
    imageIdField: imageIdField || '',
    imageFolder: imageFolder || '',
    printEmpField: arrify(printEmpField),
    printCustField: arrify(printCustField),
    totalCurrencyFields: arrify(totalCurrencyFields),
    totalAmountFields: arrify(totalAmountFields),
    signatureFields: arrify(signatureFields),
    headerFields: arrify(headerFields),
    mainFields: arrify(mainFields),
    footerFields: arrify(footerFields),
    viewSource: viewSource && typeof viewSource === 'object' ? viewSource : {},
    transactionTypeField: transactionTypeField || '',
    transactionTypeValue: transactionTypeValue || '',
    detectFields: arrify(
      detectFields.length ? detectFields : detectField ? [detectField] : [],
    ),
    moduleKey: parentModuleKey,
    moduleLabel: moduleLabel || undefined,
    allowedBranches: ab,
    allowedDepartments: ad,
    allowedPositions: ap,
    allowedUserRights: aur,
    allowedWorkplaces: aw,
    temporaryAllowedBranches: tab,
    temporaryAllowedDepartments: tad,
    temporaryAllowedPositions: tap,
    temporaryAllowedUserRights: taur,
    temporaryAllowedWorkplaces: taw,
    procedures: arrify(procedures),
    temporaryProcedures: tempProcedures,
    allowTemporarySubmission: Boolean(
      supportsTemporarySubmission ?? allowTemporarySubmission ?? false,
    ),
    supportsTemporarySubmission: Boolean(
      supportsTemporarySubmission ?? allowTemporarySubmission ?? false,
    ),
    posApiEnabled: Boolean(posApiEnabled),
    posApiType:
      typeof posApiType === 'string' && posApiType.trim()
        ? posApiType.trim()
        : '',
    posApiTypeField:
      typeof posApiTypeField === 'string' ? posApiTypeField.trim() : '',
    posApiEndpointId:
      typeof posApiEndpointId === 'string' && posApiEndpointId.trim()
        ? posApiEndpointId.trim()
        : '',
    posApiInfoEndpointIds: Array.isArray(posApiInfoEndpointIds)
      ? Array.from(
          new Set(
            posApiInfoEndpointIds
              .map((value) => (typeof value === 'string' ? value.trim() : ''))
              .filter((value) => value),
          ),
        )
      : [],
    infoEndpoints: Array.isArray(infoEndpoints)
      ? Array.from(
          new Set(
            infoEndpoints
              .map((value) => (typeof value === 'string' ? value.trim() : ''))
              .filter((value) => value),
          ),
        )
      : [],
    posApiReceiptTypes: Array.isArray(posApiReceiptTypes)
      ? Array.from(
          new Set(
            posApiReceiptTypes
              .map((value) => (typeof value === 'string' ? value.trim() : ''))
              .filter((value) => value),
          ),
        )
      : [],
    posApiPaymentMethods: Array.isArray(posApiPaymentMethods)
      ? Array.from(
          new Set(
            posApiPaymentMethods
              .map((value) => (typeof value === 'string' ? value.trim() : ''))
              .filter((value) => value),
          ),
        )
      : [],
    fieldsFromPosApi: Array.isArray(fieldsFromPosApi)
      ? Array.from(
          new Set(
            fieldsFromPosApi
              .map((value) => (typeof value === 'string' ? value.trim() : ''))
              .filter((value) => value),
          ),
        )
      : [],
    posApiMapping: sanitizePosApiMapping(posApiMapping),
    posApiResponseMapping: sanitizePosApiMapping(posApiResponseMapping),
    infoEndpointConfig: sanitizeInfoEndpointConfigMap(infoEndpointConfig),
  };
  if (editableFields !== undefined) {
    cfg[table][name].editableFields = arrify(editableFields);
  }
  await writeConfig(cfg, companyId);
  return cfg[table][name];
}

export async function deleteFormConfig(table, name, companyId = 0) {
  const { cfg } = await readConfig(companyId);
  if (!cfg[table] || !cfg[table][name]) return;
  delete cfg[table][name];
  if (Object.keys(cfg[table]).length === 0) delete cfg[table];
  await writeConfig(cfg, companyId);
}
