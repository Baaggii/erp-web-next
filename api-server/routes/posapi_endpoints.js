import express from 'express';
import multer from 'multer';
import { parseYaml } from '../utils/yaml.js';
import { requireAuth } from '../middlewares/auth.js';
import { loadEndpoints, saveEndpoints } from '../services/posApiRegistry.js';
import { invokePosApiEndpoint } from '../services/posApiService.js';
import { getEmploymentSession } from '../../db/index.js';

const DEFAULT_MAPPING_HINTS = {
  branchNo: 'session.branch_id',
  branchId: 'session.branch_id',
  branchCode: 'session.branch_code',
  posNo: 'session.pos_no',
  posNumber: 'session.pos_no',
  tin: 'session.tin',
  registerNo: 'session.register_no',
};

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

function validateEndpointDefinition(endpoint, index = 0) {
  const issues = [];
  const label = endpoint?.name || endpoint?.id || `endpoint ${index + 1}`;
  const hasBaseUrl = ['serverUrl', 'testServerUrl', 'productionServerUrl', 'testServerUrlProduction'].some(
    (key) => typeof endpoint?.[key] === 'string' && endpoint[key].trim(),
  );
  if (!hasBaseUrl) {
    issues.push(`${label} is missing a base URL (staging or production).`);
  }
  const variations = Array.isArray(endpoint?.variations) ? endpoint.variations : [];
  variations.forEach((variation, idx) => {
    const variationLabel = variation?.name || `variation ${idx + 1}`;
    if (!variation?.request && !variation?.requestExample) {
      issues.push(`${label} - ${variationLabel} is missing a request definition.`);
    }
  });
  return issues;
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
    const validationIssues = payload
      .map((endpoint, index) => validateEndpointDefinition(endpoint, index))
      .flat();
    if (validationIssues.length) {
      res.status(400).json({ message: 'Endpoint validation failed', issues: validationIssues });
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

function tokenizeFieldPath(path) {
  if (typeof path !== 'string' || !path.trim()) return [];
  return path
    .split('.')
    .map((segment) => {
      const trimmed = segment.trim();
      if (!trimmed) return null;
      const arrayMatch = /^(.*)\[\]$/.exec(trimmed);
      if (arrayMatch) {
        return { key: arrayMatch[1], isArray: true };
      }
      return { key: trimmed, isArray: false };
    })
    .filter(Boolean);
}

function setValueAtTokens(target, tokens, value) {
  if (!target || typeof target !== 'object' || !tokens.length) return false;
  let current = target;
  tokens.forEach((token, index) => {
    if (!token?.key) return;
    const isLast = index === tokens.length - 1;
    if (isLast) {
      if (token.isArray) {
        current[token.key] = Array.isArray(current[token.key]) ? current[token.key] : [];
        if (!current[token.key].length) {
          current[token.key].push(value);
        } else {
          current[token.key][0] = value;
        }
      } else {
        current[token.key] = value;
      }
      return;
    }

    const nextContainer = token.isArray ? [] : {};
    if (current[token.key] === undefined || current[token.key] === null) {
      current[token.key] = token.isArray ? [nextContainer] : nextContainer;
    }
    if (token.isArray) {
      current[token.key] = Array.isArray(current[token.key]) ? current[token.key] : [];
      if (!current[token.key].length) {
        current[token.key].push(nextContainer);
      }
      current = current[token.key][0];
    } else {
      if (typeof current[token.key] !== 'object') {
        current[token.key] = nextContainer;
      }
      current = current[token.key];
    }
  });
  return true;
}

function parseEnvValue(rawValue) {
  if (rawValue === undefined || rawValue === null) return rawValue;
  if (typeof rawValue !== 'string') return rawValue;
  const trimmed = rawValue.trim();
  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return trimmed;
    }
  }
  return trimmed;
}

function applyEnvMapToPayload(payload, envMap = {}) {
  const basePayload = payload && typeof payload === 'object' && !Array.isArray(payload)
    ? JSON.parse(JSON.stringify(payload))
    : {};
  const hasBodyContainer =
    basePayload.body && typeof basePayload.body === 'object' && !Array.isArray(basePayload.body);
  const bodyTarget = hasBodyContainer ? basePayload.body : basePayload;
  const warnings = [];

  Object.entries(envMap || {}).forEach(([fieldPath, mapping]) => {
    if (!fieldPath || !mapping) return;
    const normalized =
      typeof mapping === 'string'
        ? { envVar: mapping, applyToBody: true }
        : { envVar: mapping.envVar || mapping, applyToBody: mapping.applyToBody !== false };
    if (!normalized.envVar) return;
    const envRaw = process.env[normalized.envVar];
    if (envRaw === undefined || envRaw === null || envRaw === '') {
      warnings.push(
        `Environment variable ${normalized.envVar} is not set; using literal value for ${fieldPath}.`,
      );
      return;
    }
    const parsed = parseEnvValue(envRaw);
    const tokens = tokenizeFieldPath(fieldPath);
    const target = normalized.applyToBody ? bodyTarget : basePayload;
    if (!tokens.length || !setValueAtTokens(target, tokens, parsed)) {
      warnings.push(`Could not apply environment variable ${normalized.envVar} to ${fieldPath}.`);
    }
  });

  return { payload: basePayload, warnings };
}

function normalizeUrlMode(mode, envVar) {
  if (mode === 'env') return 'env';
  if (mode === 'literal') return 'literal';
  return envVar ? 'env' : 'literal';
}

function resolveEndpointUrl(definition, key, urlEnvMap = {}, warnings = []) {
  const envVar = (urlEnvMap && urlEnvMap[key]) || definition[`${key}EnvVar`];
  const mode = normalizeUrlMode(definition[`${key}Mode`], envVar);
  const literal = typeof definition[key] === 'string' ? definition[key].trim() : '';
  if (mode === 'env' && envVar) {
    const envRaw = process.env[envVar];
    if (envRaw !== undefined && envRaw !== null && envRaw !== '') {
      return String(envRaw).trim();
    }
    warnings.push(`Environment variable ${envVar} is not set; using literal value for ${key}.`);
  }
  return literal;
}

function pickTestBaseUrl(definition, environment, urlEnvMap = {}, warnings = []) {
  const candidateKeys =
    environment === 'production'
      ? ['productionServerUrl', 'testServerUrlProduction', 'testServerUrl', 'serverUrl']
      : ['testServerUrl', 'testServerUrlProduction', 'productionServerUrl', 'serverUrl'];
  for (const key of candidateKeys) {
    const resolved = resolveEndpointUrl(definition, key, urlEnvMap, warnings);
    if (resolved) return resolved;
  }
  return '';
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

function buildSchemaFromExample(example) {
  const detectType = (value) => {
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'array';
    return typeof value;
  };

  const walk = (value) => {
    const type = detectType(value);
    switch (type) {
      case 'object': {
        const properties = {};
        Object.entries(value).forEach(([key, val]) => {
          properties[key] = walk(val);
        });
        const required = Object.keys(properties);
        return { type: 'object', properties, required };
      }
      case 'array': {
        const first = value.length ? walk(value[0]) : {};
        return { type: 'array', items: first };
      }
      case 'number':
        return { type: Number.isInteger(value) ? 'integer' : 'number' };
      case 'boolean':
        return { type: 'boolean' };
      case 'null':
        return { type: 'string', nullable: true };
      default:
        return { type: 'string' };
    }
  };

  return walk(example);
}

function mergeExampleSchemas(examples) {
  if (!Array.isArray(examples) || examples.length === 0) return undefined;
  const objectExamples = examples.filter((item) => item && typeof item === 'object' && !Array.isArray(item));
  if (!objectExamples.length) return undefined;
  const properties = {};
  const counts = {};
  objectExamples.forEach((obj) => {
    Object.entries(obj).forEach(([key, value]) => {
      properties[key] = buildSchemaFromExample(value);
      counts[key] = (counts[key] || 0) + 1;
    });
  });
  const required = Object.keys(counts).filter((key) => counts[key] === objectExamples.length);
  return {
    type: 'object',
    properties,
    ...(required.length ? { required } : {}),
  };
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

function mergeParameterEntries(existing, incoming) {
  if (!existing) return incoming;
  const hasRequiredFlag = existing.required !== undefined || incoming.required !== undefined;
  return {
    ...existing,
    description: existing.description || incoming.description || '',
    example: existing.example ?? incoming.example,
    default: existing.default ?? incoming.default,
    testValue: existing.testValue ?? incoming.testValue,
    sample: existing.sample ?? incoming.sample,
    ...(hasRequiredFlag ? { required: Boolean(existing.required || incoming.required) } : {}),
  };
}

function normalizeParametersFromSpec(params) {
  const list = Array.isArray(params) ? params : [];
  const merged = new Map();
  list.forEach((param) => {
    if (!param || typeof param !== 'object') return;
    const name = typeof param.name === 'string' ? param.name.trim() : '';
    const loc = typeof param.in === 'string' ? param.in.trim() : '';
    if (!name || !loc) return;
    const key = `${name}:${loc}`;
    const normalized = {
      name,
      in: loc,
      required: param.required ?? loc === 'path',
      description: param.description || '',
      example: param.example ?? param.default ?? param.testValue
        ?? param.sample ?? (param.examples && Object.values(param.examples)[0]?.value),
      ...(param.default !== undefined ? { default: param.default } : {}),
      ...(param.testValue !== undefined ? { testValue: param.testValue } : {}),
      ...(param.sample !== undefined ? { sample: param.sample } : {}),
    };
    merged.set(key, mergeParameterEntries(merged.get(key), normalized));
  });
  return Array.from(merged.values());
}

function mergeTemplatePathParameters(path, parameters = []) {
  const detectedParams = typeof path === 'string'
    ? Array.from(new Set((path.match(/{([^}]+)}/g) || []).map((segment) => segment.replace(/^{|}$/g, ''))))
    : [];
  const seen = new Set(parameters.map((param) => `${param?.name}:${param?.in}`));
  const templateParams = detectedParams
    .filter(Boolean)
    .filter((name) => !seen.has(`${name}:path`))
    .map((name) => ({ name, in: 'path', required: true, description: 'Path parameter' }));
  return [...parameters, ...templateParams];
}

function mergePathParameters(...paramGroups) {
  const merged = new Map();
  paramGroups
    .flat()
    .filter(Boolean)
    .forEach((param) => {
      const name = typeof param?.name === 'string' ? param.name.trim() : '';
      const loc = typeof param?.in === 'string' ? param.in.trim() : '';
      if (!name || !loc) return;
      const key = `${name}:${loc}`;
      merged.set(key, mergeParameterEntries(merged.get(key), param));
    });
  return Array.from(merged.values());
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

function extractRequestExamples(requestBody) {
  if (!requestBody || typeof requestBody !== 'object') return [];
  const examples = [];
  const content = requestBody.content || {};
  Object.entries(content).forEach(([mediaType, media]) => {
    if (!media || typeof media !== 'object') return;
    const pushExample = (key, body) => {
      if (body === undefined) return;
      examples.push({
        key: key || mediaType,
        name: key || mediaType,
        body,
        contentType: mediaType,
      });
    };
    if (media.example !== undefined) {
      pushExample(`${mediaType}-example`, media.example);
    }
    if (media.examples && typeof media.examples === 'object') {
      Object.entries(media.examples).forEach(([name, entry]) => {
        if (entry && entry.value !== undefined) {
          pushExample(name || `${mediaType}-example`, entry.value);
        }
      });
    }
    if (media.schema && typeof media.schema === 'object') {
      if (media.schema.example !== undefined) {
        pushExample(`${mediaType}-schema-example`, media.schema.example);
      }
      if (media.schema.default !== undefined) {
        pushExample(`${mediaType}-schema-default`, media.schema.default);
      }
    }
  });
  return examples;
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

function extractResponseExamples(responses) {
  if (!responses || typeof responses !== 'object') return [];
  const entries = Object.entries(responses);
  const examples = [];
  entries.forEach(([statusCode, response]) => {
    if (!response || typeof response !== 'object') return;
    const content = response.content || {};
    Object.entries(content).forEach(([mediaType, media]) => {
      if (!media || typeof media !== 'object') return;
      const pushExample = (key, body) => {
        if (body === undefined) return;
        examples.push({
          key: key || `${statusCode}-${mediaType}`,
          name: key || `${statusCode} ${mediaType}`,
          status: statusCode,
          body,
          contentType: mediaType,
        });
      };
      if (media.example !== undefined) {
        pushExample(`${statusCode}-${mediaType}-example`, media.example);
      }
      if (media.examples && typeof media.examples === 'object') {
        Object.entries(media.examples).forEach(([name, entry]) => {
          if (entry && entry.value !== undefined) {
            pushExample(name || `${statusCode}-${mediaType}-example`, entry.value);
          }
        });
      }
      if (media.schema && typeof media.schema === 'object') {
        if (media.schema.example !== undefined) {
          pushExample(`${statusCode}-${mediaType}-schema-example`, media.schema.example);
        }
        if (media.schema.default !== undefined) {
          pushExample(`${statusCode}-${mediaType}-schema-default`, media.schema.default);
        }
      }
    });
  });
  return examples;
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

function buildRequestDetails(schema, contentType, exampleBodies = []) {
  if (!schema || typeof schema !== 'object') {
    return {
      requestFields: [],
      flags: {},
      enums: {},
      hasComplexity: false,
      warnings: [],
    };
  }
  const fields = [];
  const enums = { receiptTypes: [], taxTypes: [] };
  const flags = { supportsMultipleReceipts: false, supportsItems: false, supportsMultiplePayments: false };
  const warnings = [];

  const pushField = (path, node, required) => {
    if (!path) return;
    const entry = { field: path, required };
    if (node?.description) entry.description = node.description;
    fields.push(entry);
  };

  const walk = (node, pathPrefix, isRequired = false) => {
    if (!node || typeof node !== 'object') {
      if (pathPrefix) pushField(pathPrefix, node, isRequired);
      return;
    }
    const nodeType = node.type || (node.properties ? 'object' : node.items ? 'array' : undefined);
    if (nodeType === 'object') {
      const props = node.properties && typeof node.properties === 'object' ? node.properties : {};
      const requiredForNode = new Set(Array.isArray(node.required) ? node.required : []);
      if (!Object.keys(props).length && pathPrefix) {
        pushField(pathPrefix, node, isRequired || requiredForNode.size > 0);
      }
      Object.entries(props).forEach(([key, child]) => {
        const childPath = pathPrefix ? `${pathPrefix}.${key}` : key;
        const childIsRequired = requiredForNode.has(key);
        const childType = child?.type || (child?.properties ? 'object' : child?.items ? 'array' : undefined);
        if (childType === 'array') {
          pushField(childPath, child, childIsRequired);
        }
        walk(child, childPath, childIsRequired);
        if (childType !== 'object' && childType !== 'array') {
          pushField(childPath, child, childIsRequired);
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
      if (pathPrefix) {
        pushField(pathPrefix, node, isRequired);
      }
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
      pushField(arrayPath, node, isRequired);
      walk(node.items, arrayPath, false);
      return;
    }
    if (pathPrefix) {
      pushField(pathPrefix, node, isRequired);
    }
  };

  walk(schema, '', false);

  const exampleFields = (exampleBodies || [])
    .filter((body) => body !== undefined)
    .flatMap((body) => flattenFieldsFromExample(body));

  const requestFields = dedupeFieldEntries([...fields, ...exampleFields]);
  enums.receiptTypes = sanitizeCodes(enums.receiptTypes);
  enums.taxTypes = sanitizeCodes(enums.taxTypes);

  const hasComplexity = hasComplexComposition(schema);
  if (hasComplexity) {
    warnings.push('Some request schema elements could not be expanded automatically.');
  }
  return { requestFields, flags, enums, hasComplexity, warnings };
}

function buildParameterFieldHints(parameters = []) {
  return (parameters || [])
    .filter((param) => param?.name)
    .map((param) => ({
      field: param.name,
      required: Boolean(param.required),
      description: param.description || `${param.in} parameter`,
      location: param.in,
      in: param.in,
      defaultValue:
        param.testValue ?? param.example ?? param.default ?? param.sample ?? param.value ?? undefined,
    }));
}

function flattenFieldsFromExample(example, prefix = '') {
  const fields = [];
  const addField = (path) => {
    if (!path) return;
    fields.push({ field: path, required: false });
  };

  const walk = (value, currentPath) => {
    if (value === undefined || value === null) {
      if (currentPath) addField(currentPath);
      return;
    }
    if (Array.isArray(value)) {
      if (currentPath) addField(currentPath);
      const arrayPath = currentPath ? `${currentPath}[]` : '[]';
      addField(arrayPath);
      const first = value.length ? value[0] : undefined;
      walk(first, arrayPath);
      return;
    }
    if (typeof value === 'object') {
      const entries = Object.entries(value);
      if (!entries.length && currentPath) {
        addField(currentPath);
        return;
      }
      entries.forEach(([key, child]) => {
        const childPath = currentPath ? `${currentPath}.${key}` : key;
        walk(child, childPath);
      });
      return;
    }
    if (currentPath) addField(currentPath);
  };

  walk(example, prefix);
  return fields;
}

function flattenFieldsWithValues(example, prefix = '') {
  const fields = [];

  const addField = (path, value) => {
    if (!path) return;
    fields.push({ field: path, value });
  };

  const walk = (value, currentPath) => {
    if (value === undefined || value === null) {
      addField(currentPath, value);
      return;
    }
    if (Array.isArray(value)) {
      const arrayPath = currentPath ? `${currentPath}[]` : '[]';
      addField(arrayPath, value);
      if (value.length > 0) {
        walk(value[0], arrayPath);
      }
      return;
    }
    if (typeof value === 'object') {
      const entries = Object.entries(value);
      if (!entries.length) {
        addField(currentPath, value);
        return;
      }
      entries.forEach(([key, child]) => {
        const childPath = currentPath ? `${currentPath}.${key}` : key;
        walk(child, childPath);
      });
      return;
    }
    addField(currentPath, value);
  };

  walk(example, prefix);
  return fields;
}

function parseTabbedRequestVariations(markdown, flags = {}) {
  const variations = [];
  const warnings = [];
  if (typeof markdown !== 'string' || !markdown.includes('type: tab')) {
    return { variations, warnings };
  }

  const tabPatterns = [
    { regex: /<!--([\s\S]*?)-->/g, extract: (block) => block || '' },
    {
      regex: /@--([\s\S]*?)--/g,
      extract: (block) => (block || '').replace(/^\s*@--\s*/, ''),
    },
  ];

  try {
    const matches = [];

    tabPatterns.forEach(({ regex, extract }) => {
      let match;
      while ((match = regex.exec(markdown))) {
        const block = extract(match[1]);
        if (!/type:\s*tab/i.test(block)) continue;
        const titleMatch = /title:\s*([^\n]+)/i.exec(block);
        const title = titleMatch ? titleMatch[1].trim() : '';
        matches.push({ title, start: match.index, end: regex.lastIndex });
      }
    });

    matches
      .sort((a, b) => a.start - b.start)
      .forEach((entry, index) => {
        const sliceEnd = matches[index + 1]?.start ?? markdown.length;
        const slice = markdown.slice(entry.end, sliceEnd);
        const codeMatch = /```(?:json|js)?\s*([\s\S]*?)```/i.exec(slice);
        const codeText = codeMatch ? codeMatch[1].trim() : '';
        const description = (codeMatch ? slice.slice(0, codeMatch.index) : slice).trim();

        if (!codeText) {
          warnings.push(`Tabbed example for ${entry.title || 'variation'} is missing a code block.`);
          return;
        }

        try {
          const requestExample = JSON.parse(codeText);
          const exampleFields = flattenFieldsWithValues(requestExample);
          const variationKey = entry.title || `variation-${index + 1}`;
          const requestFields = flattenFieldsFromExample(requestExample).map((field) => {
            const valueEntry = exampleFields.find((item) => item.field === field.field);
            return {
              ...field,
              required: true,
              requiredCommon: false,
              requiredVariations: { [variationKey]: true },
              defaultVariations: valueEntry?.field ? { [variationKey]: valueEntry.value } : {},
            };
          });

          variations.push({
            key: variationKey,
            name: entry.title || `Variation ${index + 1}`,
            description,
            requestExample,
            requestExampleText: codeText,
            requestFields,
            flags,
            request: { body: requestExample },
          });
        } catch (err) {
          warnings.push(
            `Failed to parse tabbed example ${entry.title || index + 1}: ${err.message}. Skipping this tab.`,
          );
        }
      });
  } catch (err) {
    warnings.push(`Tabbed example parsing failed: ${err.message}`);
  }

  return { variations, warnings };
}

function collectTabbedRequestVariationsFromSchema(schema, flags = {}) {
  const variations = [];
  const warnings = [];

  const visit = (node) => {
    if (!node || typeof node !== 'object') return;
    if (typeof node.description === 'string' && node.description.includes('type: tab')) {
      const parsed = parseTabbedRequestVariations(node.description, flags);
      variations.push(...parsed.variations);
      warnings.push(...parsed.warnings);
    }
    if (node.properties && typeof node.properties === 'object') {
      Object.values(node.properties).forEach((child) => visit(child));
    }
    if (node.items) {
      visit(node.items);
    }
    ['oneOf', 'anyOf', 'allOf'].forEach((key) => {
      if (Array.isArray(node[key])) {
        node[key].forEach((child) => visit(child));
      }
    });
  };

  visit(schema);
  return { variations, warnings };
}

function buildVariationFieldMetadata(variations = []) {
  const variationNames = variations
    .map((variation, index) => variation?.name || variation?.key || `variation-${index + 1}`)
    .filter(Boolean);
  const lookup = new Map();

  variations.forEach((variation, index) => {
    const variationName = variation?.name || variation?.key || `variation-${index + 1}`;
    const fields = Array.isArray(variation?.requestFields) ? variation.requestFields : [];
    fields.forEach((field) => {
      const fieldPath = typeof field?.field === 'string' ? field.field.trim() : '';
      if (!fieldPath) return;
      const meta = lookup.get(fieldPath) || {
        requiredCount: 0,
        descriptions: new Set(),
        required: {},
        defaults: {},
      };
      if (typeof field.description === 'string' && field.description.trim()) {
        meta.descriptions.add(field.description.trim());
      }
      const isRequired = field.required !== false;
      meta.required[variationName] = isRequired;
      if (isRequired) meta.requiredCount += 1;
      const defaultMap = field?.defaultVariations || {};
      if (Object.prototype.hasOwnProperty.call(defaultMap, variationName)) {
        meta.defaults[variationName] = defaultMap[variationName];
      }
      lookup.set(fieldPath, meta);
    });
  });

  return { variationNames, lookup };
}

function applyVariationFieldMetadata(variations = []) {
  if (!Array.isArray(variations) || !variations.length) return variations;
  const { lookup, variationNames } = buildVariationFieldMetadata(variations);
  const totalVariations = variationNames.length || 1;

  const normalized = variations.map((variation, index) => {
    const variationName = variation?.name || variation?.key || `variation-${index + 1}`;
    const fields = Array.isArray(variation?.requestFields) ? variation.requestFields : [];
    const existingMap = new Map();
    fields.forEach((field) => {
      const fieldPath = typeof field?.field === 'string' ? field.field.trim() : '';
      if (!fieldPath) return;
      existingMap.set(fieldPath, field);
    });

    const normalizedFields = [];
    lookup.forEach((meta, fieldPath) => {
      const current = existingMap.get(fieldPath) || { field: fieldPath, required: false };
      const requiredMap = { ...(current.requiredVariations || {}) };
      const defaultMap = { ...(current.defaultVariations || {}) };

      requiredMap[variationName] = Boolean(meta.required?.[variationName]);
      if (Object.prototype.hasOwnProperty.call(meta.defaults, variationName)) {
        defaultMap[variationName] = meta.defaults[variationName];
      }

      normalizedFields.push({
        ...current,
        description: current.description || Array.from(meta.descriptions || [])[0] || '',
        required: meta.required?.[variationName] ?? current.required ?? false,
        requiredCommon: meta.requiredCount === totalVariations,
        requiredVariations: requiredMap,
        defaultVariations: defaultMap,
      });
    });

    return { ...variation, requestFields: normalizedFields, name: variationName };
  });

  return normalized;
}

function buildResponseDetails(schema, exampleBodies = []) {
  const responseFields = [];
  const warnings = [];

  const pushField = (path, node, required) => {
    if (!path) return;
    const entry = { field: path, required };
    if (node?.description) entry.description = node.description;
    responseFields.push(entry);
  };

  const walk = (node, pathPrefix, inheritedRequired = false) => {
    if (!node || typeof node !== 'object') {
      if (pathPrefix) pushField(pathPrefix, node, inheritedRequired);
      return;
    }
    const nodeType = node.type || (node.properties ? 'object' : node.items ? 'array' : undefined);
    if (nodeType === 'object') {
      const props = node.properties && typeof node.properties === 'object' ? node.properties : {};
      const requiredForNode = new Set(Array.isArray(node.required) ? node.required : []);
      if (!Object.keys(props).length && pathPrefix) {
        pushField(pathPrefix, node, inheritedRequired || requiredForNode.size > 0);
      }
      Object.entries(props).forEach(([key, child]) => {
        const childPath = pathPrefix ? `${pathPrefix}.${key}` : key;
        const isRequired = inheritedRequired || requiredForNode.has(key);
        walk(child, childPath, isRequired);
        const childType = child?.type || (child?.properties ? 'object' : child?.items ? 'array' : undefined);
        if (childType !== 'object' && childType !== 'array') {
          pushField(childPath, child, isRequired);
        }
      });
      return;
    }
    if (nodeType === 'array') {
      const arrayPath = pathPrefix ? `${pathPrefix}[]` : '[]';
      pushField(arrayPath, node, inheritedRequired || Boolean(node.required?.length));
      walk(node.items, arrayPath, true);
      return;
    }
    if (pathPrefix) {
      pushField(pathPrefix, node, inheritedRequired);
    }
  };

  walk(schema || {}, '', false);

  const exampleFields = (exampleBodies || [])
    .filter((body) => body !== undefined)
    .flatMap((body) => {
      if (body && typeof body === 'object') {
        return flattenFieldsFromExample(body);
      }
      warnings.push('Response example could not be parsed into fields; added generic placeholder.');
      return [{ field: 'response', required: false }];
    });

  const combinedFields = dedupeFieldEntries([...responseFields, ...exampleFields]);
  const hasComplexity = hasComplexComposition(schema);
  if (!combinedFields.length) {
    warnings.push('Response fields could not be derived; added a generic placeholder.');
    combinedFields.push({ field: 'response', required: false });
  }
  if (hasComplexity) {
    warnings.push('Some response schema elements could not be expanded automatically.');
  }
  return { responseFields: combinedFields, hasComplexity, warnings };
}

function dedupeFieldEntries(fields) {
  const seen = new Map();
  const dedupeKey = (entry) => {
    const location = typeof entry?.location === 'string' ? entry.location.trim() : '';
    const field = typeof entry?.field === 'string' ? entry.field.trim() : '';
    if (!field) return null;
    return `${location || 'body'}:${field}`;
  };
  fields.forEach((entry) => {
    const key = dedupeKey(entry);
    if (!key) return;
    const current = seen.get(key);
    if (!current) {
      seen.set(key, entry);
      return;
    }
    const candidateScore = entry.field.split('.').length + (entry.field.endsWith('[]') ? 0.5 : 0);
    const currentScore = current.field.split('.').length + (current.field.endsWith('[]') ? 0.5 : 0);
    if (candidateScore > currentScore) {
      seen.set(key, entry);
    }
  });
  return Array.from(seen.values());
}

function collectFieldDefaults(fields = []) {
  const defaults = {};
  fields.forEach((entry) => {
    const key = typeof entry?.field === 'string' ? entry.field.trim() : '';
    if (!key) return;
    if (entry.defaultValue !== undefined && entry.defaultValue !== null && entry.defaultValue !== '') {
      defaults[key] = entry.defaultValue;
    }
  });
  return defaults;
}

function deriveMappingHintsFromFields(fields = []) {
  const hints = {};
  const topLevelFields = [];
  const seenTopLevel = new Set();
  const receiptFields = [];
  const itemFields = [];
  const paymentFields = [];
  const nestedObjects = deriveNestedObjectsFromFields(fields);

  fields.forEach((entry) => {
    const key = typeof entry?.field === 'string' ? entry.field.trim() : '';
    if (!key) return;
    const base = {
      field: key,
      required: Boolean(entry?.required),
      description: typeof entry?.description === 'string' ? entry.description : undefined,
    };
    if (key.startsWith('receipts[].items[].')) {
      if (!seenTopLevel.has('items[]')) {
        topLevelFields.push({ field: 'items[]', required: false, description: 'Item list' });
        seenTopLevel.add('items[]');
      }
      itemFields.push({ ...base, field: key.replace('receipts[].items[].', '') });
      return;
    }
    if (key.startsWith('receipts[].payments[].')) {
      paymentFields.push({ ...base, field: key.replace('receipts[].payments[].', '') });
      return;
    }
    if (key.startsWith('payments[].')) {
      paymentFields.push({ ...base, field: key.replace('payments[].', '') });
      return;
    }
    if (key.startsWith('receipts[].')) {
      receiptFields.push({ ...base, field: key.replace('receipts[].', '') });
      return;
    }
    topLevelFields.push(base);
    if (DEFAULT_MAPPING_HINTS[key]) {
      hints[key] = DEFAULT_MAPPING_HINTS[key];
    }
  });

  if (topLevelFields.length) hints.topLevelFields = topLevelFields;
  if (itemFields.length) hints.itemFields = itemFields;
  if (receiptFields.length) hints.receiptFields = receiptFields;
  if (paymentFields.length) hints.paymentFields = paymentFields;
  if (nestedObjects.length) hints.nestedObjects = nestedObjects;

  return hints;
}

function deriveNestedObjectsFromFields(fields = []) {
  const nested = new Map();
  const humanize = (segment) => {
    if (!segment) return '';
    return segment
      .replace(/\[\]/g, '')
      .replace(/[_-]+/g, ' ')
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/^./, (c) => c.toUpperCase());
  };

  fields.forEach((entry) => {
    const key = typeof entry?.field === 'string' ? entry.field.trim() : '';
    if (!key) return;
    const tokens = tokenizeFieldPath(key);
    const pathTokens = [];
    tokens.forEach((token) => {
      pathTokens.push(`${token.key}${token.isArray ? '[]' : ''}`);
      if (token.isArray) {
        const path = pathTokens.join('.');
        if (!nested.has(path)) {
          const labelParts = pathTokens
            .map((segment) => humanize(segment))
            .filter(Boolean);
          nested.set(path, {
            path,
            label: labelParts.join(' – ') || humanize(token.key),
            repeatable: true,
          });
        }
      }
    });
  });

  return Array.from(nested.values());
}

function buildRequestSampleFromFields(fields = [], defaults = {}, example) {
  const sample = {};
  const defaultMap = defaults && typeof defaults === 'object' ? defaults : {};
  const exampleValues = Array.isArray(example)
    ? []
    : example && typeof example === 'object'
      ? flattenFieldsWithValues(example)
      : [];
  const exampleLookup = new Map(
    exampleValues
      .map((entry) => [entry.field, entry.value])
      .filter(([field]) => typeof field === 'string' && field),
  );

  fields.forEach((entry) => {
    const fieldPath = typeof entry?.field === 'string' ? entry.field.trim() : '';
    if (!fieldPath) return;
    const tokens = tokenizeFieldPath(fieldPath);
    const defaultValue =
      exampleLookup.has(fieldPath) && exampleLookup.get(fieldPath) !== undefined
        ? exampleLookup.get(fieldPath)
        : defaultMap[fieldPath] !== undefined
          ? defaultMap[fieldPath]
          : null;
    setValueAtTokens(sample, tokens, defaultValue);
  });

  return Object.keys(sample).length ? sample : undefined;
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

function resolveServerUrl(server) {
  const rawUrl = typeof server?.url === 'string' ? server.url.trim() : '';
  if (!rawUrl) return '';
  const variables = server?.variables && typeof server.variables === 'object' ? server.variables : {};
  let resolved = rawUrl;
  Object.entries(variables).forEach(([name, def]) => {
    const replacement = def?.default ?? (Array.isArray(def?.enum) ? def.enum[0] : undefined);
    if (replacement !== undefined) {
      resolved = resolved.replace(new RegExp(`{${name}}`, 'g'), replacement);
    }
  });
  return resolved;
}

function pickTestServers(operation, specServers) {
  const opServers = Array.isArray(operation?.servers) ? operation.servers : [];
  const servers = [...opServers, ...(Array.isArray(specServers) ? specServers : [])]
    .map((server) => ({ ...server, url: resolveServerUrl(server) || server?.url || '' }))
    .filter((server) => typeof server?.url === 'string' && server.url.trim());
  const staging = servers.find((server) => /staging|dev|test/i.test(server.url));
  const productionCandidate = servers.find((server) => server !== staging);
  const fallback = servers[0];
  const resolvedTest = staging?.url || fallback?.url || '';
  const resolvedProd = productionCandidate?.url || servers[1]?.url || resolvedTest;
  return {
    serverUrl: fallback?.url || '',
    testServerUrl: resolvedTest,
    productionServerUrl: resolvedProd,
    testServerUrlProduction: resolvedProd,
  };
}

function deriveReceiptTypes(requestSchema, example) {
  const typeNode = requestSchema?.properties?.type;
  const fromEnum = pickEnumValues(typeNode);
  const fromExamples = [typeNode?.example, typeNode?.default, example?.type]
    .flat()
    .filter((value) => value !== undefined && value !== null);
  const candidates = sanitizeCodes(fromEnum.length ? fromEnum : fromExamples);
  return candidates;
}

function deriveTaxTypes(requestSchema, example) {
  const taxNode = requestSchema?.properties?.taxType;
  const fromEnum = pickEnumValues(taxNode);
  const fromExamples = [taxNode?.example, taxNode?.default, example?.taxType]
    .flat()
    .filter((value) => value !== undefined && value !== null);
  const candidates = sanitizeCodes(fromEnum.length ? fromEnum : fromExamples);
  return candidates;
}

function derivePaymentMethods(requestSchema, example) {
  const paymentCodeNode = requestSchema?.properties?.payments?.items?.properties?.code;
  const fromEnum = pickEnumValues(paymentCodeNode);
  const fromExampleArray = Array.isArray(example?.payments)
    ? example.payments.map((payment) => payment?.code)
    : [];
  const candidates = sanitizeCodes(fromEnum.length ? fromEnum : fromExampleArray);
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

  const resolvedReceiptTypes = receiptTypes.length ? receiptTypes : [];
  const resolvedTaxTypes = taxTypes.length ? taxTypes : [];
  const resolvedPaymentMethods = paymentMethods.length ? paymentMethods : [];
  const nestedPaths = {};
  if (receiptsNode) {
    nestedPaths.receipts = receiptsNode.type === 'array' ? 'receipts[]' : 'receipts';
    if (supportsItems) {
      nestedPaths.items = 'items[]';
    }
  }
  if (paymentsNode) {
    nestedPaths.payments = paymentsNode.type === 'array' ? 'payments[]' : 'payments';
  }

  return {
    receiptTypes: resolvedReceiptTypes,
    taxTypes: resolvedTaxTypes,
    paymentMethods: resolvedPaymentMethods,
    supportsItems,
    supportsMultipleReceipts,
    supportsMultiplePayments,
    posApiType: resolvedReceiptTypes[0] || '',
    ...(Object.keys(nestedPaths).length ? { nestedPaths } : {}),
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
      const parametersWithTemplates = mergeTemplatePathParameters(path, opParams);
      const requestExamples = extractRequestExamples(op.requestBody);
      const example = requestExamples[0]?.body ?? extractRequestExample(op.requestBody);
      const { schema: requestSchema, description: requestDescription, contentType } =
        extractRequestSchema(op.requestBody);
      const responseExampleEntries = extractResponseExamples(op.responses);
      const { schema: responseSchema, description: responseDescription } =
        extractResponseSchema(op.responses);
      const isFormUrlEncoded = contentType === 'application/x-www-form-urlencoded';
      const formFields = isFormUrlEncoded ? buildFormFields(requestSchema) : undefined;
      const requestExample = isFormUrlEncoded ? buildFormEncodedExample(requestSchema) : example;
      const requestDetails = buildRequestDetails(
        requestSchema,
        contentType,
        requestExamples.map((entry) => entry.body).concat(requestExample !== undefined ? [requestExample] : []),
      );
      const responseDetails = buildResponseDetails(
        responseSchema,
        responseExampleEntries.map((entry) => entry.body),
      );
      const parameterFields = buildParameterFieldHints(parametersWithTemplates);
      const requestFields = dedupeFieldEntries([
        ...(isFormUrlEncoded ? formFields : requestDetails.requestFields),
        ...parameterFields,
      ]);
      const responseFields = responseDetails.responseFields;
      const parseWarnings = [
        ...(Array.isArray(requestDetails.warnings) ? requestDetails.warnings : []),
        ...(Array.isArray(responseDetails.warnings) ? responseDetails.warnings : []),
      ];
      if (!requestFields.length) {
        parseWarnings.push('Added placeholder request field because no request parameters were defined.');
        requestFields.push({ field: 'request', required: false });
      }
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
      const variationWarnings = [];
      const tabbedVariations = collectTabbedRequestVariationsFromSchema(requestSchema, {
        posApiType: inferredPosApiType,
        supportsItems: requestDetails.flags.supportsItems,
        supportsMultiplePayments: requestDetails.flags.supportsMultiplePayments,
        supportsMultipleReceipts: requestDetails.flags.supportsMultipleReceipts,
      });
      variationWarnings.push(...(tabbedVariations.warnings || []));
      const variationKeys = new Set([
        ...requestExamples.map((ex) => ex.key || ex.name || ''),
        ...responseExampleEntries.map((ex) => ex.key || ex.name || ''),
      ]);
      const hasRequestPayload = Boolean(
        requestSchema || requestExample !== undefined || (requestExamples && requestExamples.length),
      );
      const variationsFromExamples = Array.from(variationKeys).map((key, index) => {
        const req = requestExamples.find((ex) => (ex.key || ex.name) === key) || requestExamples[index];
        const resp = responseExampleEntries.find((ex) => (ex.key || ex.name) === key) || responseExampleEntries[index];
        const variationName = req?.name || resp?.name || key || `Variation ${index + 1}`;
        const exampleValueMap = Object.fromEntries(
          flattenFieldsWithValues(req?.body || {}).map(({ field, value }) => [field, value]),
        );
        const variationRequestFields = dedupeFieldEntries([
          ...requestFields,
          ...flattenFieldsFromExample(req?.body || {}),
        ]).map((field) => {
          const required = field?.required !== false;
          const value = exampleValueMap[field.field];
          const defaultMap =
            field && typeof field.defaultVariations === 'object' && field.defaultVariations !== null
              ? field.defaultVariations
              : {};
          const requiredMap =
            field && typeof field.requiredVariations === 'object' && field.requiredVariations !== null
              ? field.requiredVariations
              : {};
          return {
            ...field,
            required,
            requiredCommon: Boolean(field.requiredCommon),
            requiredVariations: { ...requiredMap, [variationName]: required },
            defaultVariations:
              value !== undefined
                ? { ...defaultMap, [variationName]: value }
                : Object.keys(defaultMap).length
                  ? defaultMap
                  : {},
          };
        });
        const variationResponseFields = dedupeFieldEntries([
          ...responseFields,
          ...flattenFieldsFromExample(resp?.body || {}),
        ]);
        if (!variationRequestFields.length && hasRequestPayload) {
          variationWarnings.push('Added placeholder request field because a variation had no request schema.');
          variationRequestFields.push({ field: 'request', required: false });
        }
        if (!variationResponseFields.length) {
          variationWarnings.push('Added placeholder response field because a variation had no response schema.');
          variationResponseFields.push({ field: 'response', required: false });
        }
        const resolvedRequest = req
          ? { body: req.body }
          : requestExample !== undefined
            ? { body: requestExample }
            : hasRequestPayload
              ? { body: {} }
              : undefined;
        if (!req && requestExample === undefined && hasRequestPayload) {
          variationWarnings.push('Variation missing explicit request example; inserted generic placeholder.');
        }
        let resolvedResponse;
        if (resp) {
          resolvedResponse = { status: resp.status, body: resp.body };
        } else if (responseExampleEntries[index] || responseExampleEntries[0]) {
          const fallback = responseExampleEntries[index] || responseExampleEntries[0];
          resolvedResponse = { status: fallback?.status, body: fallback?.body };
          variationWarnings.push('Variation missing explicit response example; used nearest available example.');
        } else if (responseSchema) {
          resolvedResponse = { status: undefined, body: responseSchema };
          variationWarnings.push('Variation missing response example; used response schema as placeholder.');
        } else {
          resolvedResponse = { status: undefined, body: {} };
          variationWarnings.push('Variation missing response definition; inserted empty object.');
        }
        return {
          key: key || `variation-${index + 1}`,
          name: variationName,
          request: resolvedRequest,
          requestExample: resolvedRequest?.body,
          response: resolvedResponse,
          requestFields: variationRequestFields,
          responseFields: variationResponseFields,
        };
      });
      const variations = applyVariationFieldMetadata([
        ...variationsFromExamples,
        ...tabbedVariations.variations,
      ]);

      const fieldDefaults = collectFieldDefaults(requestFields);
      const mappingHints = deriveMappingHintsFromFields(requestFields);
      const nestedObjects =
        Array.isArray(mappingHints?.nestedObjects) && mappingHints.nestedObjects.length
          ? mappingHints.nestedObjects
          : deriveNestedObjectsFromFields(requestFields);
      const requestSample = buildRequestSampleFromFields(
        requestFields,
        fieldDefaults,
        requestExample && typeof requestExample === 'object' ? requestExample : undefined,
      );

      entries.push({
        id: id || `${method}-${entries.length + 1}`,
        name: op.summary || op.operationId || `${method} ${path}`,
        method,
        path,
        summary: op.summary || op.description || '',
        parameters: parametersWithTemplates,
        requestExample,
        posApiType: inferredPosApiType,
        posApiCategory: inferredCategory || inferredPosApiType,
        serverUrl: serverSelection.serverUrl || serverSelection.testServerUrl || '',
        tags: Array.isArray(op.tags) ? op.tags : [],
        requestBody: requestSchema ? { schema: requestSchema, description: requestDescription } : undefined,
        responseBody: responseSchema ? { schema: responseSchema, description: responseDescription } : undefined,
        requestFields,
        responseFields,
        examples: requestExamples,
        responseExamples: responseExampleEntries,
        variations,
        ...(Object.keys(fieldDefaults).length ? { fieldDefaults } : {}),
        ...(requestSample ? { requestSample } : {}),
        ...(Object.keys(mappingHints).length ? { mappingHints } : {}),
        ...(nestedObjects.length ? { nestedObjects } : {}),
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
            serverUrl: serverSelection.serverUrl || serverSelection.testServerUrl,
            testServerUrl: serverSelection.testServerUrl,
            testServerUrlProduction: serverSelection.testServerUrlProduction,
            productionServerUrl: serverSelection.productionServerUrl,
            testable: true,
          }
          : {}),
        validation: validationIssues.length
          ? { state: hasPartialSchema ? 'partial' : 'incomplete', issues: validationIssues }
          : { state: 'ok' },
        ...((hasPartialSchema || parseWarnings.length)
          ? {
            parseWarnings: [
              ...(hasPartialSchema
                ? ['Some schema elements could not be expanded automatically.']
                : []),
              ...parseWarnings,
              ...variationWarnings,
            ],
            rawSchemas: { request: requestSchema, response: responseSchema },
          }
          : {}),
        sourceName: metaLookup?.[metaKey]?.sourceNames?.join(', ') || meta.sourceName || '',
        isBundled: metaLookup?.[metaKey]?.isBundled ?? Boolean(meta.isBundled),
      });
    });
  });
  return entries;
}

function replacePostmanVariables(text, variableLookup = {}) {
  if (!text) return '';
  return text.replace(/{{\s*([^}]+)\s*}}/g, (_, key) => {
    const trimmedKey = key.trim();
    return Object.prototype.hasOwnProperty.call(variableLookup, trimmedKey)
      ? variableLookup[trimmedKey]
      : `{{${trimmedKey}}}`;
  });
}

function extractPostmanScripts(events = []) {
  const scripts = { preRequest: [], test: [] };
  if (!Array.isArray(events)) return scripts;
  events.forEach((event) => {
    const target = event?.listen === 'prerequest' ? 'preRequest' : event?.listen === 'test' ? 'test' : null;
    if (!target) return;
    const lines = Array.isArray(event?.script?.exec) ? event.script.exec : [];
    if (lines.length) {
      scripts[target].push(lines.join('\n'));
    }
  });
  return scripts;
}

function parsePostmanUrl(urlObj, variableLookup = {}) {
  const detectPathParams = (rawPath) => {
    const params = new Set();
    const colonMatches = rawPath.match(/:\w+/g) || [];
    colonMatches.forEach((segment) => params.add(segment.slice(1)));
    const braceMatches = rawPath.match(/{{\s*([\w-]+)\s*}}/g) || [];
    braceMatches.forEach((segment) => {
      const key = segment.replace(/^{+|}+$/g, '').replace(/\s+/g, '');
      if (key) params.add(key);
    });
    const normalizedMatches = rawPath.match(/{([^}]+)}/g) || [];
    normalizedMatches.forEach((segment) => {
      const key = segment.replace(/^{|}$/g, '');
      if (key) params.add(key);
    });
    return Array.from(params);
  };

  if (!urlObj) return { path: '/', query: [], baseUrl: '', pathParams: [] };
  if (typeof urlObj === 'string') {
    const resolvedUrl = replacePostmanVariables(urlObj, variableLookup);
    const urlString = resolvedUrl.startsWith('http') ? resolvedUrl : `https://placeholder.local${resolvedUrl}`;
    try {
      const parsed = new URL(urlString);
      const path = parsed.pathname || '/';
      const query = [];
      parsed.searchParams.forEach((value, key) => {
        query.push({ name: key, in: 'query', value });
      });
      const baseUrl = `${parsed.protocol}//${parsed.host}`;
      return { path, query, baseUrl, pathParams: detectPathParams(path) };
    } catch {
      return { path: '/', query: [], baseUrl: '', pathParams: [] };
    }
  }
  const pathParts = Array.isArray(urlObj.path) ? urlObj.path : [];
  const rawPath = `/${pathParts.join('/')}`;
  const normalizedPath = rawPath.replace(/\/:([\w-]+)/g, '/{$1}').replace(/{{\s*([\w-]+)\s*}}/g, '{$1}');
  const query = Array.isArray(urlObj.query)
    ? urlObj.query.map((entry) => ({
      name: entry.key,
      in: 'query',
      example: entry.value,
      default: entry?.value,
      description: entry?.description || '',
    }))
    : [];
  const host = Array.isArray(urlObj.host) ? urlObj.host.join('.') : '';
  const protocol = Array.isArray(urlObj.protocol) ? urlObj.protocol[0] : urlObj.protocol;
  const resolvedHost = replacePostmanVariables(host, variableLookup);
  const resolvedProtocol = replacePostmanVariables(protocol || 'https', variableLookup) || 'https';
  const baseUrl = resolvedHost ? `${resolvedProtocol}://${resolvedHost}` : '';
  return { path: normalizedPath || '/', query, baseUrl, pathParams: detectPathParams(rawPath) };
}

function pickPostmanServers(baseUrl, variables = {}) {
  const urlCandidates = new Set();
  const tryAdd = (value) => {
    if (typeof value !== 'string') return;
    const trimmed = value.trim();
    if (!trimmed) return;
    if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith('{{')) {
      urlCandidates.add(trimmed);
    }
  };

  tryAdd(baseUrl);
  Object.values(variables || {}).forEach((val) => tryAdd(val));

  const urls = Array.from(urlCandidates.values());
  const fallback = urls[0] || '';
  const staging = urls.find((url) => /staging|dev|test/i.test(url));
  const production = urls.find((url) => /prod|live/i.test(url));
  const altProduction = urls.find((url) => url !== staging && url !== fallback);
  const resolvedProd = production || altProduction || fallback;

  return {
    serverUrl: fallback,
    testServerUrl: staging || fallback,
    productionServerUrl: resolvedProd,
  };
}

function extractOperationsFromPostman(spec, meta = {}) {
  const items = spec?.item;
  if (!Array.isArray(items)) return [];
  const entries = [];

  const variables = Array.isArray(spec?.variable)
    ? spec.variable
      .map((variable) => (typeof variable?.key === 'string' ? variable.key.trim() : ''))
      .filter(Boolean)
    : [];
  const variableLookup = Array.isArray(spec?.variable)
    ? spec.variable.reduce((acc, variable) => {
      if (typeof variable?.key === 'string' && variable.key.trim()) {
        acc[variable.key.trim()] = variable?.value;
      }
      return acc;
    }, {})
    : {};

  function parseRequestBody(body) {
    if (!body || typeof body !== 'object') return {};
    if (body.mode === 'raw') {
      const rawText = typeof body.raw === 'string' ? body.raw.trim() : '';
      if (!rawText) return {};
      try {
        const parsed = JSON.parse(rawText);
        return { requestExample: parsed, requestSchema: buildSchemaFromExample(parsed) };
      } catch {
        return { requestExample: body.raw };
      }
    }
    if (body.mode === 'urlencoded' && Array.isArray(body.urlencoded)) {
      const example = {};
      body.urlencoded
        .filter((entry) => !entry?.disabled)
        .forEach((entry) => {
          const key = entry?.key || '';
          example[key] = entry?.value ?? '';
        });
      return { requestExample: example, requestSchema: buildSchemaFromExample(example) };
    }
    if (body.mode === 'formdata' && Array.isArray(body.formdata)) {
      const example = {};
      const schemaProperties = {};
      body.formdata
        .filter((entry) => !entry?.disabled)
        .forEach((entry) => {
          const key = entry?.key || '';
          if (!key) return;
          if (entry.type === 'file') {
            example[key] = entry?.src || 'file';
            schemaProperties[key] = { type: 'string', format: 'binary' };
          } else {
            example[key] = entry?.value ?? '';
            schemaProperties[key] = { type: 'string' };
          }
        });
      const requestSchema = Object.keys(schemaProperties).length
        ? { type: 'object', properties: schemaProperties, required: Object.keys(schemaProperties) }
        : undefined;
      return { requestExample: example, requestSchema };
    }
    return {};
  }

  function parseResponses(responses = []) {
    const examples = [];
    const jsonBodies = [];
    const warnings = [];
    responses
      .filter((resp) => resp)
      .forEach((resp) => {
        const headers = Array.isArray(resp.header)
          ? resp.header.reduce((acc, h) => {
            if (h?.key) acc[h.key] = h?.value;
            return acc;
          }, {})
          : {};
        const contentType = headers['Content-Type'] || headers['content-type'] || '';
        let parsedBody = resp.body;
        const bodyLooksJson = typeof resp.body === 'string' && /^[{\[]/.test(resp.body.trim());
        if (/json/i.test(contentType) || bodyLooksJson) {
          try {
            parsedBody = typeof resp.body === 'string' ? JSON.parse(resp.body) : resp.body;
            if (parsedBody && typeof parsedBody === 'object') {
              jsonBodies.push(parsedBody);
            }
          } catch {
            warnings.push(`Response example for ${resp.name || resp.status || 'example'} was not valid JSON.`);
          }
        }
        examples.push({
          status: resp.code || resp.status,
          name: resp.name || resp.status || '',
          body: parsedBody !== undefined ? parsedBody : resp.body,
          headers,
        });
      });
    if (!examples.length) {
      warnings.push('No response examples were defined; added a placeholder response.');
      examples.push({ status: undefined, name: 'placeholder', body: {}, headers: {} });
    }
    const responseSchema = jsonBodies.length ? mergeExampleSchemas(jsonBodies) : undefined;
    return { examples, responseSchema, warnings };
  }

  function parseExampleRequest(request = {}) {
    const method = (request.method || '').toUpperCase() || 'GET';
    const { path, query, baseUrl, pathParams } = parsePostmanUrl(request.url || '/', variableLookup);
    const headers = Array.isArray(request.header)
      ? request.header.reduce((acc, header) => {
        if (header?.key) acc[header.key] = header?.value ?? '';
        return acc;
      }, {})
      : {};
    const { requestExample } = parseRequestBody(request.body);
    return {
      method,
      baseUrl,
      path,
      pathParams,
      queryParams: query,
      headers,
      body: requestExample,
    };
  }

  function buildPostmanExamples(item) {
    if (!Array.isArray(item?.response) || item.response.length === 0) return [];
    return item.response.map((resp, index) => {
      const request = resp.originalRequest || item.request || {};
      const headers = Array.isArray(resp.header)
        ? resp.header.reduce((acc, h) => {
          if (h?.key) acc[h.key] = h?.value;
          return acc;
        }, {})
        : {};
      const parsedRequest = parseExampleRequest(request);
      const contentType = headers['Content-Type'] || headers['content-type'] || '';
      let parsedBody = resp.body;
      if (/json/i.test(contentType)) {
        try {
          parsedBody = JSON.parse(resp.body);
        } catch {
          // ignore parsing errors
        }
      }
      return {
        key: resp.name || resp.status || `example-${index + 1}`,
        name: resp.name || resp.status || `Example ${index + 1}`,
        request: parsedRequest,
        response: {
          status: resp.code || resp.status,
          headers,
          body: parsedBody,
        },
      };
    });
  }

  function walk(list, folderTags = [], folderPath = []) {
    list.forEach((item) => {
      if (item?.item) {
        walk(item.item, [...folderTags, item.name || ''], [...folderPath, item.name || '']);
        return;
      }
      if (!item?.request) return;
      const method = (item.request.method || 'GET').toUpperCase();
      const { path, query, baseUrl, pathParams } = parsePostmanUrl(
        item.request.url || '/',
        variableLookup,
      );
      const body = item.request.body;
      const { requestExample, requestSchema } = parseRequestBody(body);
      const { examples: responseExamples, responseSchema, warnings: responseWarnings } = parseResponses(
        item.response,
      );
      const examples = buildPostmanExamples(item);
      const scripts = extractPostmanScripts(item.event || []);
      const parameters = normalizeParametersFromSpec([
        ...query,
        ...pathParams.map((name) => ({ name, in: 'path', required: true })),
        ...(Array.isArray(item.request.header)
          ? item.request.header.map((header) => ({
            name: header?.key,
            in: 'header',
            required: header?.disabled === false || header?.required === true,
            example: header?.value,
            description: header?.description || '',
          }))
          : []),
      ]);
      const idSource = `${method}-${path}`;
      const id = idSource.replace(/[^a-zA-Z0-9-_]+/g, '-');
      const posApiType = classifyPosApiType(folderTags, path, item.request.description || '');
      const requestDetails = buildRequestDetails(requestSchema, 'application/json', [requestExample]);
      const parameterFields = buildParameterFieldHints(parameters);
      const responseDetails = buildResponseDetails(
        responseSchema,
        Array.isArray(responseExamples) ? responseExamples.map((ex) => ex?.body) : [],
      );
      const combinedRequestFields = dedupeFieldEntries([
        ...requestDetails.requestFields,
        ...parameterFields,
      ]);
      const variationWarnings = [];
      const hasRequestPayload = Boolean(
        requestSchema || requestExample !== undefined || (examples && examples.length),
      );
      const variations = Array.isArray(examples)
        ? examples.map((example) => {
          const exampleRequestFields = flattenFieldsFromExample(example?.request?.body || example?.request || {});
          const exampleResponseFields = flattenFieldsFromExample(example?.response?.body || example?.response || {});
          const requestFields = dedupeFieldEntries([
            ...parameterFields,
            ...requestDetails.requestFields,
            ...exampleRequestFields,
          ]);
          const responseFields = dedupeFieldEntries([
            ...responseDetails.responseFields,
            ...exampleResponseFields,
          ]);
          if (!requestFields.length && hasRequestPayload) {
            variationWarnings.push('Added placeholder request field because a variation had no request schema.');
            requestFields.push({ field: 'request', required: false });
          }
          if (!responseFields.length) {
            variationWarnings.push('Added placeholder response field because a variation had no response schema.');
            responseFields.push({ field: 'response', required: false });
          }
          const resolvedRequest = example.request && Object.keys(example.request).length
            ? example.request
            : example.request || (hasRequestPayload ? { body: requestExample ?? {} } : undefined);
          const resolvedResponse = example.response
            ? example.response
            : responseExamples[0]
              ? {
                status: responseExamples[0].status,
                headers: responseExamples[0].headers,
                body: responseExamples[0].body,
              }
              : { status: undefined, body: {} };
          if (!example.response) {
            variationWarnings.push('Variation missing explicit response example; inserted placeholder response.');
          }
          return {
            ...example,
            request: resolvedRequest,
            response: resolvedResponse,
            requestFields,
            responseFields,
          };
        })
        : [];
      const description = item.request.description || item.description || '';
      const serverSelection = pickPostmanServers(baseUrl, variableLookup);
      const parseWarnings = [
        ...(Array.isArray(responseWarnings) ? responseWarnings : []),
        ...(Array.isArray(requestDetails.warnings) ? requestDetails.warnings : []),
        ...(Array.isArray(responseDetails.warnings) ? responseDetails.warnings : []),
      ];

      const fieldDefaults = collectFieldDefaults(combinedRequestFields);
      const mappingHints = deriveMappingHintsFromFields(combinedRequestFields);
      const nestedObjects =
        Array.isArray(mappingHints?.nestedObjects) && mappingHints.nestedObjects.length
          ? mappingHints.nestedObjects
          : deriveNestedObjectsFromFields(combinedRequestFields);
      const requestSample = buildRequestSampleFromFields(
        combinedRequestFields,
        fieldDefaults,
        requestExample && typeof requestExample === 'object' ? requestExample : undefined,
      );

      entries.push({
        id: id || `${method}-${entries.length + 1}`,
        name: item.name || `${method} ${path}`,
        method,
        path,
        summary: description,
        parameters,
        requestExample,
        posApiType,
        serverUrl: serverSelection.serverUrl || baseUrl,
        tags: [...folderPath],
        requestBody: requestSchema ? { schema: requestSchema, description } : undefined,
        responseBody: responseSchema
          ? {
            schema: responseSchema,
            description: responseExamples?.[0]?.name || responseExamples?.[0]?.status || '',
          }
          : undefined,
        responseExamples,
        examples,
        scripts,
        requestFields: combinedRequestFields,
        responseFields: responseDetails.responseFields,
        variations,
        ...(Object.keys(fieldDefaults).length ? { fieldDefaults } : {}),
        ...(requestSample ? { requestSample } : {}),
        ...(Object.keys(mappingHints).length ? { mappingHints } : {}),
        ...(nestedObjects.length ? { nestedObjects } : {}),
        ...(parseWarnings.length || variationWarnings.length
          ? { parseWarnings: [...parseWarnings, ...variationWarnings] }
          : {}),
        ...(Array.isArray(requestDetails.enums.receiptTypes) && requestDetails.enums.receiptTypes.length
          ? { receiptTypes: requestDetails.enums.receiptTypes }
          : {}),
        ...(Array.isArray(requestDetails.enums.taxTypes) && requestDetails.enums.taxTypes.length
          ? { taxTypes: requestDetails.enums.taxTypes }
          : {}),
        ...(requestDetails.flags.supportsMultipleReceipts !== undefined
          ? { supportsMultipleReceipts: requestDetails.flags.supportsMultipleReceipts }
          : {}),
        ...(requestDetails.flags.supportsMultiplePayments !== undefined
          ? { supportsMultiplePayments: requestDetails.flags.supportsMultiplePayments }
          : {}),
        ...(requestDetails.flags.supportsItems !== undefined ? { supportsItems: requestDetails.flags.supportsItems } : {}),
        ...(serverSelection.serverUrl
          ? {
            serverUrl: serverSelection.serverUrl,
            testServerUrl: serverSelection.testServerUrl,
            productionServerUrl: serverSelection.productionServerUrl,
            testServerUrlProduction: serverSelection.productionServerUrl,
            testable: Boolean(serverSelection.testServerUrl || serverSelection.productionServerUrl),
          }
          : {}),
        validation: posApiType ? { state: 'ok' } : {
          state: 'incomplete',
          issues: ['POSAPI type could not be determined automatically.'],
        },
        sourceName: meta.sourceName || '',
        isBundled: Boolean(meta.isBundled),
        variables,
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
    const candidateIsCopy = /copy/i.test(operation.sourceName || '');
    const existingIsCopy = /copy/i.test(existing.sourceName || '');
    if (candidateIsCopy && !existingIsCopy) {
      merged.set(key, { ...existing, ...operation });
      return;
    }
    if (existingIsCopy && !candidateIsCopy) {
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
    const urlEnvMap = definition.urlEnvMap || {};
    const warnings = [];
    const testBaseUrl = pickTestBaseUrl(definition, environment, urlEnvMap, warnings);
    if (!testBaseUrl || typeof testBaseUrl !== 'string') {
      res.status(400).json({ message: 'Test server URL is required' });
      return;
    }

    const payload = {};
    const bodyOverride = req.body?.body;
    const params = Array.isArray(definition.parameters) ? definition.parameters : [];
    params.forEach((param) => {
      if (!param?.name) return;
      const value = coerceParamValue(param);
      if (value !== '') {
        payload[param.name] = value;
      }
    });
    if (bodyOverride !== undefined) {
      payload.body = bodyOverride;
    } else if (definition.requestExample !== undefined && definition.method !== 'GET') {
      payload.body = definition.requestExample;
    } else if (definition.requestBody && typeof definition.requestBody === 'object') {
      const schema = definition.requestBody.schema;
      if (schema !== undefined && schema !== null && definition.method !== 'GET') {
        payload.body = schema;
      }
    }

    const { payload: mappedPayload, warnings: envWarnings } = applyEnvMapToPayload(
      payload,
      definition.requestEnvMap,
    );
    const combinedWarnings = [...warnings, ...envWarnings];

    const selectedAuthEndpoint =
      typeof req.body?.authEndpointId === 'string' && req.body.authEndpointId.trim()
        ? req.body.authEndpointId.trim()
        : typeof definition.authEndpointId === 'string'
          ? definition.authEndpointId
          : '';

    try {
      const result = await invokePosApiEndpoint(definition.id || 'draftEndpoint', mappedPayload, {
        endpoint: definition,
        baseUrl: testBaseUrl,
        debug: true,
        authEndpointId: selectedAuthEndpoint,
        useCachedToken: req.body?.useCachedToken !== false,
        environment,
      });
      const responsePayload = combinedWarnings.length ? { ...result, envWarnings: combinedWarnings } : result;
      res.json(responsePayload);
    } catch (err) {
      if (err?.status) {
        const status = err.status === 401 || err.status === 403 ? 502 : err.status;
        res.status(status).json({ message: err.message, request: err.request || null });
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
    const environment = req.body?.environment === 'production' ? 'production' : 'staging';
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
      requestEnvMap: endpoint.requestEnvMap || {},
      urlEnvMap: endpoint.urlEnvMap || {},
      testServerUrl: endpoint.testServerUrl || baseUrl,
      productionServerUrl: endpoint.productionServerUrl,
      testServerUrlProduction: endpoint.testServerUrlProduction,
      serverUrl: endpoint.serverUrl,
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

    const { payload: mappedPayload } = applyEnvMapToPayload(
      combinedPayload,
      sanitized.requestEnvMap,
    );

    const warnings = [];
    const baseUrlForTest = pickTestBaseUrl(sanitized, environment, sanitized.urlEnvMap, warnings);
    if (!baseUrlForTest) {
      res.status(400).json({ message: 'Test server URL is required' });
      return;
    }

    try {
      const result = await invokePosApiEndpoint(sanitized.id, mappedPayload, {
        endpoint: sanitized,
        baseUrl: baseUrlForTest,
        debug: true,
        authEndpointId,
        useCachedToken: req.body?.useCachedToken !== false,
      });
      res.json({
        ok: true,
        request: result.request,
        response: result.response,
        endpoint: sanitized,
        envWarnings: warnings.length ? warnings : undefined,
      });
    } catch (err) {
      const status = err?.status || 502;
      const safeStatus = status === 401 || status === 403 ? 502 : status;
      res
        .status(safeStatus)
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
