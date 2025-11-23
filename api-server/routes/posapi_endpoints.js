import express from 'express';
import multer from 'multer';
import { parseYaml } from '../utils/yaml.js';
import { requireAuth } from '../middlewares/auth.js';
import { loadEndpoints, saveEndpoints } from '../services/posApiRegistry.js';
import { invokePosApiEndpoint } from '../services/posApiService.js';
import { getEmploymentSession } from '../../db/index.js';

const DEFAULT_RECEIPT_TYPES = ['B2C', 'B2B_SALE', 'B2B_PURCHASE', 'STOCK_QR'];
const DEFAULT_TAX_TYPES = ['VAT_ABLE', 'VAT_FREE', 'VAT_ZERO', 'NO_VAT'];
const DEFAULT_PAYMENT_METHODS = [
  'CASH',
  'PAYMENT_CARD',
  'BANK_TRANSFER',
  'MOBILE_WALLET',
  'EASY_BANK_CARD',
  'SERVICE_PAYMENT',
];

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 10 },
});

async function requireSystemSettings(req, res) {
  const companyId = Number(req.query.companyId ?? req.user.companyId);
  const session =
    (req.session && Number(req.session?.company_id) === companyId && req.session) ||
    (await getEmploymentSession(req.user.empid, companyId));
  if (!session?.permissions?.system_settings) {
    res.status(403).json({ message: 'Admin access required' });
    return null;
  }
  return { session, companyId };
}

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const guard = await requireSystemSettings(req, res);
    if (!guard) return;
    const endpoints = await loadEndpoints();
    res.json(endpoints);
  } catch (err) {
    next(err);
  }
});

router.put('/', requireAuth, async (req, res, next) => {
  try {
    const guard = await requireSystemSettings(req, res);
    if (!guard) return;
    const payload = req.body?.endpoints ?? req.body;
    if (!Array.isArray(payload)) {
      res.status(400).json({ message: 'endpoints array is required' });
      return;
    }
    const sanitized = JSON.parse(JSON.stringify(payload));
    const saved = await saveEndpoints(sanitized);
    res.json(saved);
  } catch (err) {
    next(err);
  }
});

router.post('/import/parse', requireAuth, upload.array('files'), async (req, res, next) => {
  try {
    const guard = await requireSystemSettings(req, res);
    if (!guard) return;
    const files = Array.isArray(req.files) ? req.files : [];
    if (files.length === 0) {
      res.status(400).json({ message: 'At least one specification file is required' });
      return;
    }

    const allOperations = [];
    const openApiSpecs = [];
    for (const file of files) {
      try {
        const text = file.buffer.toString('utf8');
        const parsed = parseApiSpecText(text);
        const sourceName = file.originalname || 'specification';
        const isBundled = /bundle|bundled|resolved|inline/i.test(sourceName);
        const openApiCandidate = parsed?.paths && typeof parsed.paths === 'object';
        if (openApiCandidate) {
          openApiSpecs.push({ spec: parsed, meta: { sourceName, isBundled } });
        }
        const postmanOps = extractOperationsFromPostman(parsed, { sourceName, isBundled });
        allOperations.push(...postmanOps);
      } catch (err) {
        res.status(400).json({ message: `Failed to parse ${file.originalname}: ${err.message}` });
        return;
      }
    }

    if (openApiSpecs.length > 0) {
      const { spec: mergedSpec, metaLookup } = mergeOpenApiSpecs(openApiSpecs);
      const openApiOps = extractOperationsFromOpenApi(mergedSpec, { sourceName: 'Merged specs' }, metaLookup);
      allOperations.push(...openApiOps);
    }

    if (!allOperations.length) {
      res.status(400).json({ message: 'No operations were found in the supplied files' });
      return;
    }

    const merged = mergeOperations(allOperations);
    res.json({ operations: merged });
  } catch (err) {
    next(err);
  }
});

function sanitizeHeaders(headers) {
  const entries = [];
  headers.forEach((value, key) => {
    entries.push([key, value]);
  });
  return Object.fromEntries(entries);
}

function coerceParamValue(param) {
  if (!param) return '';
  const candidates = [
    param.testValue,
    param.example,
    param.default,
    param.sample,
    param.value,
  ];
  const hit = candidates.find((candidate) => candidate !== undefined && candidate !== null);
  if (hit === undefined || hit === null) return '';
  if (typeof hit === 'object') {
    try {
      return JSON.stringify(hit);
    } catch {
      return '';
    }
  }
  return String(hit);
}

function buildTestUrl(definition) {
  const base = (definition.testServerUrl || '').trim();
  if (!base) {
    throw new Error('Test server URL is required');
  }
  const method = (definition.method || 'GET').toUpperCase();
  const rawPath = (definition.path || '/').trim() || '/';
  const params = Array.isArray(definition.parameters) ? definition.parameters : [];

  let resolvedPath = rawPath;
  const pathParamRegex = /{([^}]+)}/g;
  const seenPathParams = new Set();
  let match;
  while ((match = pathParamRegex.exec(rawPath))) {
    const name = match[1];
    if (seenPathParams.has(name)) continue;
    seenPathParams.add(name);
    const paramDefinition = params.find((param) => param?.name === name && param?.in === 'path');
    const value = coerceParamValue(paramDefinition);
    resolvedPath = resolvedPath.replaceAll(`{${name}}`, encodeURIComponent(value || name));
  }

  const baseWithSlash = base.endsWith('/') ? base : `${base}/`;
  const url = new URL(resolvedPath.startsWith('http') ? resolvedPath : resolvedPath, baseWithSlash);

  for (const param of params) {
    if (!param?.name) continue;
    if (param.in === 'query') {
      const value = coerceParamValue(param);
      if (value !== '') {
        url.searchParams.append(param.name, value);
      }
    }
  }

  return { method, url };
}

function parseApiSpecText(text) {
  const trimmed = text.trim();
  if (!trimmed) throw new Error('Specification file is empty');
  return parseYaml(trimmed);
}

function mergeOperationNode(existing, incoming, meta) {
  if (!incoming || typeof incoming !== 'object') return existing;
  if (!existing) {
    return {
      operation: incoming,
      isBundled: Boolean(meta?.isBundled),
      sourceNames: new Set(meta?.sourceName ? [meta.sourceName] : []),
    };
  }
  const preferBundled = meta?.isBundled && !existing.isBundled;
  const keepExistingBundled = existing.isBundled && !meta?.isBundled;
  const mergedSources = new Set(existing.sourceNames || []);
  if (meta?.sourceName) mergedSources.add(meta.sourceName);
  if (preferBundled) {
    const next = { ...incoming };
    if (!next.summary && existing.operation?.summary) next.summary = existing.operation.summary;
    if (!next.description && existing.operation?.description) next.description = existing.operation.description;
    return { operation: next, isBundled: true, sourceNames: mergedSources };
  }
  if (keepExistingBundled) {
    const existingOp = { ...existing.operation };
    if (!existingOp.summary && incoming.summary) existingOp.summary = incoming.summary;
    if (!existingOp.description && incoming.description) existingOp.description = incoming.description;
    return { ...existing, operation: existingOp, sourceNames: mergedSources };
  }
  const winner = { ...existing.operation };
  if (!winner.summary && incoming.summary) winner.summary = incoming.summary;
  if (!winner.description && incoming.description) winner.description = incoming.description;
  return { operation: winner, isBundled: existing.isBundled || Boolean(meta?.isBundled), sourceNames: mergedSources };
}

function mergeOpenApiSpecs(specEntries) {
  const mergedPaths = {};
  const metaLookup = {};
  let mergedServers = [];
  specEntries.forEach(({ spec, meta }) => {
    if (Array.isArray(spec?.servers) && mergedServers.length === 0) {
      mergedServers = spec.servers;
    }
    const paths = spec?.paths && typeof spec.paths === 'object' ? spec.paths : {};
    Object.entries(paths).forEach(([path, pathDef]) => {
      if (!mergedPaths[path]) mergedPaths[path] = {};
      const existingPathParams = Array.isArray(mergedPaths[path].parameters)
        ? mergedPaths[path].parameters
        : [];
      const incomingPathParams = Array.isArray(pathDef.parameters) ? pathDef.parameters : [];
      const combinedParams = mergePathParameters(existingPathParams, incomingPathParams);
      if (combinedParams.length) {
        mergedPaths[path].parameters = combinedParams;
      }
      Object.entries(pathDef).forEach(([methodKey, op]) => {
        const method = methodKey.toLowerCase();
        if (!['get', 'post', 'put', 'delete', 'patch'].includes(method)) return;
        const key = `${method.toUpperCase()}:${path}`;
        const merged = mergeOperationNode(metaLookup[key], op, meta);
        metaLookup[key] = merged;
        mergedPaths[path][method] = merged.operation;
      });
    });
  });
  const [base] = specEntries;
  return {
    spec: {
      ...(base?.spec || {}),
      servers: mergedServers,
      paths: mergedPaths,
    },
    metaLookup: Object.fromEntries(
      Object.entries(metaLookup).map(([key, value]) => [key, { ...value, sourceNames: Array.from(value.sourceNames || []) }]),
    ),
  };
}

function normalizeParametersFromSpec(params) {
  const list = Array.isArray(params) ? params : [];
  const deduped = [];
  const seen = new Set();
  list.forEach((param) => {
    if (!param || typeof param !== 'object') return;
    const name = typeof param.name === 'string' ? param.name.trim() : '';
    const loc = typeof param.in === 'string' ? param.in.trim() : '';
    if (!name || !loc) return;
    const key = `${name}:${loc}`;
    if (seen.has(key)) return;
    seen.add(key);
    deduped.push({
      name,
      in: loc,
      required: Boolean(param.required),
      description: param.description || '',
      example: param.example ?? param.default ?? (param.examples && Object.values(param.examples)[0]?.value),
    });
  });
  return deduped;
}

function mergePathParameters(...paramGroups) {
  const merged = [];
  const seen = new Set();
  paramGroups
    .flat()
    .filter(Boolean)
    .forEach((param) => {
      const name = typeof param?.name === 'string' ? param.name.trim() : '';
      const loc = typeof param?.in === 'string' ? param.in.trim() : '';
      if (!name || !loc) return;
      const key = `${name}:${loc}`;
      if (seen.has(key)) return;
      seen.add(key);
      merged.push(param);
    });
  return merged;
}

function extractRequestExample(requestBody) {
  if (!requestBody || typeof requestBody !== 'object') return undefined;
  const content = requestBody.content || {};
  const mediaType =
    content['application/json'] || content['*/*'] || Object.values(content)[0] || null;
  if (!mediaType) return undefined;
  if (mediaType.example !== undefined) return mediaType.example;
  if (mediaType.examples) {
    const first = Object.values(mediaType.examples).find((entry) => entry && entry.value !== undefined);
    if (first) return first.value;
  }
  if (mediaType.schema && typeof mediaType.schema === 'object') {
    if (mediaType.schema.example !== undefined) return mediaType.schema.example;
    if (mediaType.schema.default !== undefined) return mediaType.schema.default;
  }
  return undefined;
}

function classifyPosApiType(tags = [], path = '', summary = '') {
  const normalizedPath = path.toLowerCase();
  const text = `${tags.join(' ')} ${path} ${summary}`.toLowerCase();
  if (normalizedPath.includes('/protocol/openid-connect/token') || /\bauth|token\b/.test(text)) {
    return 'AUTH';
  }
  if (
    normalizedPath.includes('/rest/info') ||
    normalizedPath.includes('/rest/senddata') ||
    normalizedPath.includes('/rest/bankaccounts') ||
    normalizedPath.includes('/api/info/check') ||
    /lookup|info|reference/.test(text)
  ) {
    return 'LOOKUP';
  }
  if (
    normalizedPath.includes('/api/tpi/receipt/saveoprmerchants') ||
    normalizedPath.includes('setposreceiptdtlbyproductowner') ||
    /registration/.test(text)
  ) {
    return 'REGISTRATION';
  }
  if (
    normalizedPath.includes('/rest/receipt') ||
    /posapi|receipt|transaction|sale/.test(text)
  ) {
    return 'TRANSACTION';
  }
  if (text.includes('stock') || text.includes('qr')) return 'STOCK_QR';
  return '';
}

function extractRequestSchema(requestBody) {
  if (!requestBody || typeof requestBody !== 'object') return { schema: undefined, description: '', contentType: '' };
  const content = requestBody.content || {};
  const priorityTypes = ['application/x-www-form-urlencoded', 'application/json', '*/*'];
  const hitType = priorityTypes.find((type) => content[type]) || Object.keys(content)[0];
  if (!hitType) return { schema: undefined, description: '', contentType: '' };
  const media = content[hitType] || {};
  const schema = media.schema && typeof media.schema === 'object' ? media.schema : undefined;
  const description = requestBody.description || media.description || '';
  return { schema, description, contentType: hitType };
}

function mapCategoryToType(category, fallback = '') {
  if (category === 'AUTH' || category === 'LOOKUP') return category;
  if (category === 'TRANSACTION') return fallback || 'B2C';
  if (category === 'REGISTRATION') return fallback || 'REGISTRATION';
  return fallback;
}

function extractResponseSchema(responses) {
  if (!responses || typeof responses !== 'object') return { schema: undefined, description: '' };
  const entries = Object.entries(responses);
  const success = entries.find(([code]) => /^2/.test(code));
  const fallback = entries[0];
  const target = success || fallback;
  if (!target) return { schema: undefined, description: '' };
  const [, response] = target;
  if (!response || typeof response !== 'object') return { schema: undefined, description: '' };
  const content = response.content || {};
  const media = content['application/json'] || content['*/*'] || Object.values(content)[0] || {};
  const schema = media.schema && typeof media.schema === 'object' ? media.schema : undefined;
  const description = response.description || media.description || '';
  return { schema, description };
}

function collectFieldsFromSchema(schema, { pathPrefix = '', required = [] } = {}) {
  const fields = [];
  const requiredSet = new Set(Array.isArray(required) ? required : []);
  const pushField = (fieldPath, node, isRequired) => {
    if (!fieldPath) return;
    const entry = { field: fieldPath, required: Boolean(isRequired) };
    if (node && typeof node.description === 'string' && node.description.trim()) {
      entry.description = node.description.trim();
    }
    fields.push(entry);
  };

  const walk = (node, currentPath, inheritedRequired = new Set()) => {
    if (!node || typeof node !== 'object') return;
    const nodeType = node.type || (node.properties ? 'object' : node.items ? 'array' : undefined);
    if (nodeType === 'object') {
      const props = node.properties && typeof node.properties === 'object' ? node.properties : {};
      const requiredForNode = new Set(Array.isArray(node.required) ? node.required : []);
      Object.entries(props).forEach(([key, child]) => {
        const fieldPath = currentPath ? `${currentPath}.${key}` : key;
        const isRequired = requiredForNode.has(key) || inheritedRequired.has(key);
        const childType = child?.type || (child?.properties ? 'object' : child?.items ? 'array' : undefined);
        if (childType === 'array') {
          const arrayPath = `${fieldPath}[]`;
          pushField(arrayPath, child, isRequired);
          walk(
            child.items,
            arrayPath,
            new Set(Array.isArray(child.items?.required) ? child.items.required : []),
          );
          return;
        }
        pushField(fieldPath, child, isRequired);
        walk(child, fieldPath, requiredForNode);
      });
      return;
    }
    if (nodeType === 'array') {
      const arrayPath = currentPath ? `${currentPath}[]` : '[]';
      pushField(arrayPath, node, inheritedRequired.size > 0);
      walk(node.items, arrayPath, new Set(Array.isArray(node.items?.required) ? node.items.required : []));
      return;
    }
    if (currentPath) {
      pushField(currentPath, node, inheritedRequired.size > 0);
    }
  };

  walk(schema, pathPrefix, requiredSet);
  const seen = new Set();
  return fields.filter((entry) => {
    if (!entry?.field) return false;
    if (seen.has(entry.field)) return false;
    seen.add(entry.field);
    return true;
  });
}

function hasComplexComposition(node, depth = 0) {
  if (!node || typeof node !== 'object' || depth > 5) return false;
  if (node.anyOf || node.oneOf) return true;
  if (typeof node.$ref === 'string' && node.$ref && !node.$ref.startsWith('#/')) return true;
  return Object.values(node).some((value) => hasComplexComposition(value, depth + 1));
}

function buildRequestDetails(schema, contentType) {
  if (!schema || typeof schema !== 'object') {
    return { requestFields: [], flags: {}, enums: {}, hasComplexity: false };
  }
  const fields = [];
  const enums = { receiptTypes: [], taxTypes: [] };
  const flags = { supportsMultipleReceipts: false, supportsItems: false, supportsMultiplePayments: false };

  const walk = (node, pathPrefix, requiredSet = new Set()) => {
    if (!node || typeof node !== 'object') return;
    const nodeType = node.type || (node.properties ? 'object' : node.items ? 'array' : undefined);
    if (nodeType === 'object') {
      const props = node.properties && typeof node.properties === 'object' ? node.properties : {};
      const requiredForNode = new Set(Array.isArray(node.required) ? node.required : []);
      Object.entries(props).forEach(([key, child]) => {
        const childPath = pathPrefix ? `${pathPrefix}.${key}` : key;
        const isRequired = requiredForNode.has(key) || requiredSet.has(key);
        walk(child, childPath, requiredForNode);
        const childType = child?.type || (child?.properties ? 'object' : child?.items ? 'array' : undefined);
        if (childType !== 'object' && childType !== 'array') {
          const entry = { field: childPath, required: isRequired };
          if (child?.description) entry.description = child.description;
          fields.push(entry);
        }
        const enumsForChild = pickEnumValues(child);
        if (enumsForChild.length && /tax/.test(key)) enums.taxTypes.push(...enumsForChild);
        if (enumsForChild.length && /type/.test(key) && /receipt/i.test(childPath)) {
          enums.receiptTypes.push(...enumsForChild);
        }
      });
      return;
    }
    if (nodeType === 'array') {
      const arrayPath = pathPrefix ? `${pathPrefix}[]` : '[]';
      if (/receipts?$/i.test(pathPrefix)) {
        flags.supportsMultipleReceipts = true;
      }
      if (/payments$/i.test(pathPrefix)) {
        flags.supportsMultiplePayments = true;
      }
      if (/items$/i.test(pathPrefix)) {
        flags.supportsItems = true;
      }
      const entry = { field: arrayPath, required: requiredSet.size > 0 };
      if (node?.description) entry.description = node.description;
      fields.push(entry);
      walk(node.items, arrayPath, new Set(Array.isArray(node.items?.required) ? node.items.required : []));
      return;
    }
    if (pathPrefix) {
      const entry = { field: pathPrefix, required: requiredSet.size > 0 };
      if (node?.description) entry.description = node.description;
      fields.push(entry);
    }
  };

  const rootRequired = new Set(Array.isArray(schema.required) ? schema.required : []);
  walk(schema, '', rootRequired);

  const requestFields = dedupeFieldEntries(fields);
  enums.receiptTypes = sanitizeCodes(enums.receiptTypes, DEFAULT_RECEIPT_TYPES);
  enums.taxTypes = sanitizeCodes(enums.taxTypes, DEFAULT_TAX_TYPES);

  const hasComplexity = hasComplexComposition(schema);
  return { requestFields, flags, enums, hasComplexity };
}

function buildResponseDetails(schema) {
  if (!schema || typeof schema !== 'object') return { responseFields: [], hasComplexity: false };
  const fields = [];
  const topLevelRequired = new Set(Array.isArray(schema.required) ? schema.required : []);
  const properties = schema.properties && typeof schema.properties === 'object' ? schema.properties : {};

  Object.entries(properties).forEach(([key, node]) => {
    const isRequired = topLevelRequired.has(key);
    const nodeType = node?.type || (node?.properties ? 'object' : node?.items ? 'array' : undefined);
    if (nodeType === 'array' && node?.items?.properties) {
      const itemRequired = new Set(Array.isArray(node.items.required) ? node.items.required : []);
      Object.entries(node.items.properties).forEach(([childKey, childNode]) => {
        const path = `${key}[].${childKey}`;
        const entry = { field: path, required: isRequired || itemRequired.has(childKey) };
        if (childNode?.description) entry.description = childNode.description;
        fields.push(entry);
      });
      return;
    }
    if (nodeType === 'object' && node?.properties) {
      const nestedRequired = new Set(Array.isArray(node.required) ? node.required : []);
      Object.entries(node.properties).forEach(([childKey, childNode]) => {
        const path = `${key}.${childKey}`;
        const entry = { field: path, required: isRequired || nestedRequired.has(childKey) };
        if (childNode?.description) entry.description = childNode.description;
        fields.push(entry);
      });
      return;
    }
    const entry = { field: key, required: isRequired };
    if (node?.description) entry.description = node.description;
    fields.push(entry);
  });

  return { responseFields: dedupeFieldEntries(fields), hasComplexity: hasComplexComposition(schema) };
}

function dedupeFieldEntries(fields) {
  const seen = new Map();
  fields.forEach((entry) => {
    if (!entry?.field) return;
    const normalized = entry.field.replace(/\[\]$/, '');
    const current = seen.get(normalized);
    const candidateScore = entry.field.split('.').length + (entry.field.endsWith('[]') ? 0.5 : 0);
    const currentScore = current
      ? current.field.split('.').length + (current.field.endsWith('[]') ? 0.5 : 0)
      : -1;
    if (!current || candidateScore >= currentScore) {
      seen.set(normalized, entry);
    }
  });
  return Array.from(seen.values());
}

function pickEnumValues(node) {
  if (!node || typeof node !== 'object') return [];
  if (Array.isArray(node.enum)) return node.enum.slice();
  if (Array.isArray(node.oneOf)) {
    const values = node.oneOf
      .map((option) => (option && option.const !== undefined ? option.const : option?.enum?.[0]))
      .filter((value) => value !== undefined);
    if (values.length) return values;
  }
  return [];
}

function sanitizeCodes(values, allowed = []) {
  const allowedSet = new Set(allowed);
  const cleaned = Array.isArray(values)
    ? values
        .map((value) => (typeof value === 'string' ? value.trim() : ''))
        .filter((value) => value && (allowed.length === 0 || allowedSet.has(value)))
    : [];
  return Array.from(new Set(cleaned));
}

function pickTestServers(operation, specServers) {
  const opServers = Array.isArray(operation?.servers) ? operation.servers : [];
  const servers = [...opServers, ...(Array.isArray(specServers) ? specServers : [])].filter(
    (server) => typeof server?.url === 'string' && server.url.trim(),
  );
  const staging = servers.find((server) => /staging|dev|test/i.test(server.url));
  const productionCandidate = servers.find((server) => server !== staging);
  const fallback = servers[0];
  return {
    testServerUrl: staging?.url || fallback?.url || '',
    testServerUrlProduction: productionCandidate?.url || servers[1]?.url || '',
  };
}

function deriveReceiptTypes(requestSchema, example) {
  const typeNode = requestSchema?.properties?.type;
  const fromEnum = pickEnumValues(typeNode);
  const fromExamples = [typeNode?.example, typeNode?.default, example?.type]
    .flat()
    .filter((value) => value !== undefined && value !== null);
  const candidates = sanitizeCodes(fromEnum.length ? fromEnum : fromExamples, DEFAULT_RECEIPT_TYPES);
  return candidates;
}

function deriveTaxTypes(requestSchema, example) {
  const taxNode = requestSchema?.properties?.taxType;
  const fromEnum = pickEnumValues(taxNode);
  const fromExamples = [taxNode?.example, taxNode?.default, example?.taxType]
    .flat()
    .filter((value) => value !== undefined && value !== null);
  const candidates = sanitizeCodes(fromEnum.length ? fromEnum : fromExamples, DEFAULT_TAX_TYPES);
  return candidates;
}

function derivePaymentMethods(requestSchema, example) {
  const paymentCodeNode = requestSchema?.properties?.payments?.items?.properties?.code;
  const fromEnum = pickEnumValues(paymentCodeNode);
  const fromExampleArray = Array.isArray(example?.payments)
    ? example.payments.map((payment) => payment?.code)
    : [];
  const candidates = sanitizeCodes(fromEnum.length ? fromEnum : fromExampleArray, DEFAULT_PAYMENT_METHODS);
  return candidates;
}

function analysePosApiRequest(requestSchema, example) {
  const receiptsNode = requestSchema?.properties?.receipts;
  const paymentsNode = requestSchema?.properties?.payments;
  const receiptTypes = deriveReceiptTypes(requestSchema, example);
  const taxTypes = deriveTaxTypes(requestSchema, example);
  const paymentMethods = derivePaymentMethods(requestSchema, example);

  const receiptsFromExample = Array.isArray(example?.receipts) ? example.receipts : [];
  const paymentsFromExample = Array.isArray(example?.payments) ? example.payments : [];

  const supportsMultipleReceipts = receiptsNode
    ? receiptsFromExample.length > 1 || receiptsFromExample.length === 0
    : false;
  const supportsItems = Boolean(
    receiptsNode?.items?.properties?.items || receiptsFromExample.some((receipt) => Array.isArray(receipt?.items)),
  );
  const supportsMultiplePayments = paymentsNode ? paymentsFromExample.length > 1 : false;

  const resolvedReceiptTypes = receiptTypes.length ? receiptTypes : receiptsNode ? DEFAULT_RECEIPT_TYPES : [];
  const resolvedTaxTypes = taxTypes.length ? taxTypes : receiptsNode ? DEFAULT_TAX_TYPES : [];
  const resolvedPaymentMethods = paymentMethods.length
    ? paymentMethods
    : paymentsNode
      ? DEFAULT_PAYMENT_METHODS
      : [];

  return {
    receiptTypes: resolvedReceiptTypes,
    taxTypes: resolvedTaxTypes,
    paymentMethods: resolvedPaymentMethods,
    supportsItems,
    supportsMultipleReceipts,
    supportsMultiplePayments,
    posApiType: resolvedReceiptTypes[0] || '',
  };
}

function buildFormFields(requestSchema) {
  const properties = requestSchema?.properties && typeof requestSchema.properties === 'object'
    ? requestSchema.properties
    : {};
  const required = new Set(Array.isArray(requestSchema?.required) ? requestSchema.required : []);
  return Object.entries(properties).map(([key, value]) => {
    const entry = { field: key, required: required.has(key) };
    if (value && typeof value.description === 'string' && value.description.trim()) {
      entry.description = value.description.trim();
    }
    return entry;
  });
}

function buildFormEncodedExample(requestSchema) {
  const properties = requestSchema?.properties && typeof requestSchema.properties === 'object'
    ? requestSchema.properties
    : {};
  const required = new Set(Array.isArray(requestSchema?.required) ? requestSchema.required : []);
  const pairs = Object.entries(properties).map(([key, value]) => {
    const sample = value?.example ?? value?.default ?? (Array.isArray(value?.enum) ? value.enum[0] : '');
    if (sample !== undefined && sample !== null && sample !== '') {
      return `${key}=${sample}`;
    }
    if (required.has(key)) {
      return `${key}=`;
    }
    return null;
  }).filter(Boolean);
  return pairs.join('&');
}

function extractOperationsFromOpenApi(spec, meta = {}, metaLookup = {}) {
  if (!spec || typeof spec !== 'object') return [];
  const paths = spec.paths && typeof spec.paths === 'object' ? spec.paths : {};
  const specServers = Array.isArray(spec.servers) ? spec.servers : [];
  const entries = [];
  Object.entries(paths).forEach(([path, definition]) => {
    if (!definition || typeof definition !== 'object') return;
    const sharedParams = normalizeParametersFromSpec(definition.parameters);
    Object.entries(definition).forEach(([methodKey, operation]) => {
      const method = methodKey.toUpperCase();
      if (!['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].includes(method)) return;
      const op = operation && typeof operation === 'object' ? operation : {};
      const opParams = normalizeParametersFromSpec([...(op.parameters || []), ...sharedParams]);
      const example = extractRequestExample(op.requestBody);
      const { schema: requestSchema, description: requestDescription, contentType } =
        extractRequestSchema(op.requestBody);
      const { schema: responseSchema, description: responseDescription } =
        extractResponseSchema(op.responses);
      const isFormUrlEncoded = contentType === 'application/x-www-form-urlencoded';
      const formFields = isFormUrlEncoded ? buildFormFields(requestSchema) : undefined;
      const requestExample = isFormUrlEncoded ? buildFormEncodedExample(requestSchema) : example;
      const requestDetails = buildRequestDetails(requestSchema, contentType);
      const responseDetails = buildResponseDetails(responseSchema);
      const requestFields = isFormUrlEncoded ? formFields : requestDetails.requestFields;
      const responseFields = responseDetails.responseFields;
      const posHints = requestSchema ? analysePosApiRequest(requestSchema, requestExample) : {};
      const idSource = op.operationId || `${method}-${path}`;
      const id = idSource.replace(/[^a-zA-Z0-9-_]+/g, '-');
      const inferredCategory = classifyPosApiType(op.tags || [], path, op.summary || op.description || '');
      const inferredPosApiType = mapCategoryToType(inferredCategory, posHints.posApiType);
      const metaKey = `${method}:${path}`;
      const validationIssues = [];
      if (!inferredPosApiType) {
        validationIssues.push('POSAPI type could not be determined automatically.');
      }
      if (requestFields.length === 0 && !requestSchema) {
        validationIssues.push('Request schema missing – please review required fields.');
      }
      const serverSelection = pickTestServers(op, specServers);
      const hasPartialSchema = requestDetails.hasComplexity || responseDetails.hasComplexity;
      if (hasPartialSchema) {
        validationIssues.push('Some schemas use advanced composition (anyOf/oneOf/$ref) and were partially parsed.');
      }
      const resolvedReceiptTypes = (posHints.receiptTypes && posHints.receiptTypes.length
        ? posHints.receiptTypes
        : requestDetails.enums.receiptTypes)
        || [];
      const resolvedTaxTypes = (posHints.taxTypes && posHints.taxTypes.length
        ? posHints.taxTypes
        : requestDetails.enums.taxTypes)
        || [];
      entries.push({
        id: id || `${method}-${entries.length + 1}`,
        name: op.summary || op.operationId || `${method} ${path}`,
        method,
        path,
        summary: op.summary || op.description || '',
        parameters: opParams,
        requestExample,
        posApiType: inferredPosApiType,
        posApiCategory: inferredCategory || inferredPosApiType,
        serverUrl: serverSelection.testServerUrl || '',
        tags: Array.isArray(op.tags) ? op.tags : [],
        requestBody: requestSchema ? { schema: requestSchema, description: requestDescription } : undefined,
        responseBody: responseSchema ? { schema: responseSchema, description: responseDescription } : undefined,
        requestFields,
        responseFields,
        ...(Array.isArray(resolvedReceiptTypes) && resolvedReceiptTypes.length
          ? { receiptTypes: resolvedReceiptTypes }
          : {}),
        ...(Array.isArray(resolvedTaxTypes) && resolvedTaxTypes.length ? { taxTypes: resolvedTaxTypes } : {}),
        ...(Array.isArray(posHints.paymentMethods) && posHints.paymentMethods.length
          ? { paymentMethods: posHints.paymentMethods }
          : {}),
        ...(posHints.supportsItems !== undefined ? { supportsItems: posHints.supportsItems } : {}),
        ...(requestDetails.flags.supportsMultipleReceipts !== undefined
          ? { supportsMultipleReceipts: requestDetails.flags.supportsMultipleReceipts }
          : {}),
        ...(requestDetails.flags.supportsMultiplePayments !== undefined
          ? { supportsMultiplePayments: requestDetails.flags.supportsMultiplePayments }
          : {}),
        ...(requestDetails.flags.supportsItems !== undefined ? { supportsItems: requestDetails.flags.supportsItems } : {}),
        ...(serverSelection.testServerUrl
          ? {
            testServerUrl: serverSelection.testServerUrl,
            testServerUrlProduction: serverSelection.testServerUrlProduction,
            testable: true,
          }
          : {}),
        validation: validationIssues.length
          ? { state: hasPartialSchema ? 'partial' : 'incomplete', issues: validationIssues }
          : { state: 'ok' },
        ...(hasPartialSchema
          ? { parseWarnings: ['Some schema elements could not be expanded automatically.'], rawSchemas: {
            request: requestSchema,
            response: responseSchema,
          } }
          : {}),
        sourceName: metaLookup?.[metaKey]?.sourceNames?.join(', ') || meta.sourceName || '',
        isBundled: metaLookup?.[metaKey]?.isBundled ?? Boolean(meta.isBundled),
      });
    });
  });
  return entries;
}

function parsePostmanUrl(urlObj) {
  if (!urlObj) return { path: '/', query: [], baseUrl: '' };
  if (typeof urlObj === 'string') {
    const urlString = urlObj.startsWith('http') ? urlObj : `https://placeholder.local${urlObj}`;
    try {
      const parsed = new URL(urlString);
      const path = parsed.pathname || '/';
      const query = [];
      parsed.searchParams.forEach((value, key) => {
        query.push({ name: key, in: 'query', value });
      });
      const baseUrl = `${parsed.protocol}//${parsed.host}`;
      return { path, query, baseUrl };
    } catch {
      return { path: '/', query: [], baseUrl: '' };
    }
  }
  const pathParts = Array.isArray(urlObj.path) ? urlObj.path : [];
  const rawPath = `/${pathParts.join('/')}`;
  const normalizedPath = rawPath.replace(/\/:([\w-]+)/g, '/{$1}').replace(/{{\s*([\w-]+)\s*}}/g, '{$1}');
  const query = Array.isArray(urlObj.query)
    ? urlObj.query.map((entry) => ({ name: entry.key, in: 'query', example: entry.value }))
    : [];
  const host = Array.isArray(urlObj.host) ? urlObj.host.join('.') : '';
  const protocol = Array.isArray(urlObj.protocol) ? urlObj.protocol[0] : urlObj.protocol;
  const baseUrl = host ? `${protocol || 'https'}://${host}` : '';
  return { path: normalizedPath || '/', query, baseUrl };
}

function extractOperationsFromPostman(spec, meta = {}) {
  const items = spec?.item;
  if (!Array.isArray(items)) return [];
  const entries = [];

  function walk(list, folderTags = []) {
    list.forEach((item) => {
      if (item?.item) {
        walk(item.item, [...folderTags, item.name || '']);
        return;
      }
      if (!item?.request) return;
      const method = (item.request.method || 'GET').toUpperCase();
      const { path, query, baseUrl } = parsePostmanUrl(item.request.url || '/');
      const body = item.request.body;
      let requestExample;
      if (body?.mode === 'raw' && typeof body.raw === 'string') {
        try {
          requestExample = JSON.parse(body.raw);
        } catch {
          requestExample = body.raw;
        }
      }
      const parameters = normalizeParametersFromSpec(query);
      const idSource = `${method}-${path}`;
      const id = idSource.replace(/[^a-zA-Z0-9-_]+/g, '-');
      const posApiType = classifyPosApiType(folderTags, path, item.request.description || '');
      entries.push({
        id: id || `${method}-${entries.length + 1}`,
        name: item.name || `${method} ${path}`,
        method,
        path,
        summary: item.request.description || '',
        parameters,
        requestExample,
        posApiType,
        serverUrl: baseUrl,
        tags: folderTags,
        validation: posApiType ? { state: 'ok' } : {
          state: 'incomplete',
          issues: ['POSAPI type could not be determined automatically.'],
        },
        sourceName: meta.sourceName || '',
        isBundled: Boolean(meta.isBundled),
      });
    });
  }

  walk(items, []);
  return entries;
}

function scoreOperation(operation) {
  if (!operation) return 0;
  const example = operation.requestExample;
  let exampleScore = 0;
  if (example !== undefined && example !== null) {
    try {
      exampleScore = JSON.stringify(example).length;
    } catch {
      exampleScore = String(example).length;
    }
  }
  const summaryScore = (operation.summary || '').length;
  return exampleScore + summaryScore;
}

function mergeOperations(operations) {
  const merged = new Map();
  operations.forEach((operation) => {
    if (!operation?.method || !operation?.path) return;
    const key = `${operation.method}:${operation.path}`;
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, operation);
      return;
    }
    const preferBundled = operation.isBundled && !existing.isBundled;
    const keepExistingBundled = existing.isBundled && !operation.isBundled;
    const existingScore = scoreOperation(existing);
    const candidateScore = scoreOperation(operation);
    if (preferBundled) {
      const summaryFromOriginal = existing.summary && existing.summary !== operation.summary
        ? existing.summary
        : '';
      merged.set(key, {
        ...existing,
        ...operation,
        ...(summaryFromOriginal ? { summaryFromOriginal } : {}),
      });
      return;
    }
    if (keepExistingBundled) {
      if (operation.summary && operation.summary !== existing.summary && !existing.summaryFromOriginal) {
        merged.set(key, { ...existing, summaryFromOriginal: operation.summary });
      }
      return;
    }
    if (candidateScore > existingScore) {
      merged.set(key, { ...existing, ...operation });
    } else if (candidateScore === existingScore && !existing.requestExample && operation.requestExample) {
      merged.set(key, { ...existing, requestExample: operation.requestExample });
    }
  });
  return Array.from(merged.values());
}

router.post('/fetch-doc', requireAuth, async (req, res, next) => {
  try {
    const guard = await requireSystemSettings(req, res);
    if (!guard) return;
    const url = req.body?.url;
    if (!url || typeof url !== 'string') {
      res.status(400).json({ message: 'url is required' });
      return;
    }
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json, text/plain;q=0.9, text/html;q=0.8, */*;q=0.5',
      },
    });
    if (!response.ok) {
      res
        .status(502)
        .json({ message: `Failed to fetch documentation (${response.status})` });
      return;
    }
    const text = await response.text();

    const extractLabel = (source, index, fallback) => {
      const prefix = source.slice(0, index);
      const lines = prefix.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
      for (let i = lines.length - 1; i >= 0; i -= 1) {
        const line = lines[i];
        if (!line) continue;
        if (line.startsWith('```')) break;
        if (line.startsWith('#')) {
          return line.replace(/^#+\s*/, '') || fallback;
        }
        if (/request/i.test(line) || /response/i.test(line)) {
          return line;
        }
        if (/example/i.test(line)) {
          return line;
        }
        if (/[A-Za-z]/.test(line[0])) {
          return line;
        }
      }
      return fallback;
    };

    const blocks = [];
    const codeBlockRegex = /```json\s*([\s\S]*?)```/gi;
    let match;
    while ((match = codeBlockRegex.exec(text))) {
      try {
        const parsed = JSON.parse(match[1]);
        const label = extractLabel(text, match.index, `Example ${blocks.length + 1}`);
        blocks.push({ label, json: parsed });
      } catch (err) {
        console.warn('Failed to parse JSON code block from doc', err);
      }
    }
    if (blocks.length === 0) {
      const trimmed = text.trim();
      if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        try {
          blocks.push({ label: 'Example 1', json: JSON.parse(trimmed) });
        } catch (err) {
          console.warn('Failed to parse top-level JSON from doc', err);
        }
      }
    }

    const tableDescriptions = {};
    const tableRegex = /\|\s*Field\s*\|\s*Description[\s\S]*?\n((?:\|[^\n]*\|\s*\n?)+)/gi;
    let tableMatch;
    while ((tableMatch = tableRegex.exec(text))) {
      const rows = tableMatch[1]
        .split(/\r?\n/)
        .map((row) => row.trim())
        .filter((row) => row.startsWith('|'));
      for (const row of rows) {
        const cells = row
          .split('|')
          .slice(1, -1)
          .map((cell) => cell.trim())
          .filter((cell, index) => !(index === 0 && !cell));
        if (cells.length < 2) continue;
        const field = cells[0].replace(/`/g, '');
        const description = cells[1];
        if (field && description) {
          tableDescriptions[field] = description;
        }
      }
    }

    const methodPathRegex = /(GET|POST|PUT|DELETE|PATCH)\s+(\/[^\s]*)/i;
    const methodMatch = methodPathRegex.exec(text);
    const methodJsonRegex = /"method"\s*:\s*"(GET|POST|PUT|DELETE|PATCH)"/i;
    const pathJsonRegex = /"path"\s*:\s*"(\/[^"\s]*)"/i;

    const metadata = {
      method:
        (methodMatch && methodMatch[1]) ||
        (methodJsonRegex.exec(text)?.[1]) ||
        undefined,
      path:
        (methodMatch && methodMatch[2]) ||
        (pathJsonRegex.exec(text)?.[1]) ||
        undefined,
      testServerUrl: 'https://posapi-test.tax.gov.mn',
    };

    const fieldDescriptions = Object.keys(tableDescriptions).length > 0 ? tableDescriptions : undefined;

    res.json({ text, blocks, metadata, fieldDescriptions });
  } catch (err) {
    next(err);
  }
});

router.post('/test', requireAuth, async (req, res, next) => {
  try {
    const guard = await requireSystemSettings(req, res);
    if (!guard) return;
    const definition = req.body?.endpoint;
    if (!definition || typeof definition !== 'object') {
      res.status(400).json({ message: 'endpoint definition is required' });
      return;
    }
    if (!definition.testable) {
      res.status(400).json({ message: 'Endpoint is not marked as testable' });
      return;
    }

    const environment = req.body?.environment === 'production' ? 'production' : 'staging';
    const testBaseUrl =
      environment === 'production'
        ? definition.testServerUrlProduction || definition.testServerUrl
        : definition.testServerUrl || definition.testServerUrlProduction;
    if (!testBaseUrl || typeof testBaseUrl !== 'string') {
      res.status(400).json({ message: 'Test server URL is required' });
      return;
    }

    const payload = {};
    const params = Array.isArray(definition.parameters) ? definition.parameters : [];
    params.forEach((param) => {
      if (!param?.name) return;
      const value = coerceParamValue(param);
      if (value !== '') {
        payload[param.name] = value;
      }
    });
    if (definition.requestBody && typeof definition.requestBody === 'object') {
      const schema = definition.requestBody.schema;
      if (schema !== undefined && schema !== null && definition.method !== 'GET') {
        payload.body = schema;
      }
    }

    const selectedAuthEndpoint =
      typeof req.body?.authEndpointId === 'string' && req.body.authEndpointId.trim()
        ? req.body.authEndpointId.trim()
        : typeof definition.authEndpointId === 'string'
          ? definition.authEndpointId
          : '';

    try {
      const result = await invokePosApiEndpoint(definition.id || 'draftEndpoint', payload, {
        endpoint: definition,
        baseUrl: testBaseUrl,
        debug: true,
        authEndpointId: selectedAuthEndpoint,
        environment,
      });
      res.json(result);
    } catch (err) {
      if (err?.status) {
        res.status(err.status).json({ message: err.message, request: err.request || null });
      } else {
        next(err);
      }
    }
  } catch (err) {
    next(err);
  }
});

router.post('/import/test', requireAuth, async (req, res, next) => {
  try {
    const guard = await requireSystemSettings(req, res);
    if (!guard) return;
    const endpoint = req.body?.endpoint;
    const payload = req.body?.payload;
    const baseUrl = typeof req.body?.baseUrl === 'string' ? req.body.baseUrl.trim() : '';
    const authEndpointId =
      typeof req.body?.authEndpointId === 'string' ? req.body.authEndpointId.trim() : '';
    if (!endpoint || typeof endpoint !== 'object') {
      res.status(400).json({ message: 'endpoint object is required' });
      return;
    }
    const sanitized = {
      id: endpoint.id || 'draftEndpoint',
      name: endpoint.name || endpoint.id || 'Draft endpoint',
      method: (endpoint.method || 'GET').toUpperCase(),
      path: endpoint.path || '/',
      parameters: Array.isArray(endpoint.parameters)
        ? endpoint.parameters.filter(Boolean)
        : [],
      posApiType: endpoint.posApiType || undefined,
    };
    const inputPayload = payload && typeof payload === 'object' ? payload : {};
    const paramsBag = inputPayload.params && typeof inputPayload.params === 'object'
      ? inputPayload.params
      : {};
    const bodyPayload =
      inputPayload.body === undefined || inputPayload.body === null ? undefined : inputPayload.body;
    const combinedPayload = { ...paramsBag };
    if (bodyPayload !== undefined) {
      combinedPayload.body = bodyPayload;
    }

    try {
      const result = await invokePosApiEndpoint(sanitized.id, combinedPayload, {
        endpoint: sanitized,
        baseUrl: baseUrl || undefined,
        debug: true,
        authEndpointId,
      });
      res.json({
        ok: true,
        request: result.request,
        response: result.response,
        endpoint: sanitized,
      });
    } catch (err) {
      const status = err?.status || 502;
      res
        .status(status)
        .json({
          message: err?.message || 'Failed to invoke POSAPI endpoint',
          request: err?.request || null,
        });
    }
  } catch (err) {
    next(err);
  }
});

export default router;
