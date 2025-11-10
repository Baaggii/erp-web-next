import { pool } from '../../db/index.js';
import { getEndpointById, loadEndpoints } from './posApiRegistry.js';
import { getPosApiToken, posApiFetch } from './posApiService.js';

const ALLOWED_USAGE = new Set(['info', 'admin', '']);

function normalizeIds(ids) {
  if (!ids) return [];
  const values = Array.isArray(ids) ? ids : [ids];
  return Array.from(
    new Set(
      values
        .map((value) => {
          if (typeof value === 'string') return value.trim();
          if (value === undefined || value === null) return '';
          return String(value).trim();
        })
        .filter((value) => value),
    ),
  );
}

function sanitizeDefinition(definition) {
  if (!definition || typeof definition !== 'object') return null;
  const {
    id,
    name,
    category,
    method,
    path,
    parameters,
    requestFields,
    responseFields,
    requestBody,
    usage,
    description,
  } = definition;
  return {
    id,
    name,
    category,
    method,
    path,
    parameters: Array.isArray(parameters) ? parameters : [],
    requestFields: Array.isArray(requestFields) ? requestFields : [],
    responseFields: Array.isArray(responseFields) ? responseFields : [],
    requestBody,
    usage,
    description,
  };
}

export async function getInfoEndpointDefinitions(ids) {
  const normalizedIds = normalizeIds(ids);
  const endpoints = await loadEndpoints();
  const filtered = endpoints.filter((endpoint) => {
    if (!endpoint || typeof endpoint !== 'object') return false;
    if (!endpoint.id || typeof endpoint.id !== 'string') return false;
    if (normalizedIds.length > 0 && !normalizedIds.includes(endpoint.id)) return false;
    const usage = typeof endpoint.usage === 'string' ? endpoint.usage.trim() : '';
    if (usage && !ALLOWED_USAGE.has(usage)) return false;
    return true;
  });
  const sanitized = filtered
    .map((endpoint) => sanitizeDefinition(endpoint))
    .filter((endpoint) => endpoint && endpoint.id);
  if (normalizedIds.length === 0) return sanitized;
  const byId = new Map(sanitized.map((entry) => [entry.id, entry]));
  return normalizedIds.map((id) => byId.get(id)).filter(Boolean);
}

function buildRequestContext(definition, params = {}, body = undefined) {
  const method = (definition?.method || 'GET').toUpperCase();
  const rawPath = (definition?.path || '/').trim() || '/';
  const paramDefs = Array.isArray(definition?.parameters)
    ? definition.parameters.filter((param) => param && typeof param === 'object')
    : [];

  const normalizedParams = {};
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    const strKey = typeof key === 'string' ? key.trim() : String(key).trim();
    if (!strKey) return;
    normalizedParams[strKey] = value;
  });

  let resolvedPath = rawPath;
  const query = new URLSearchParams();
  const used = new Set();

  paramDefs.forEach((param) => {
    const name = typeof param.name === 'string' ? param.name.trim() : '';
    if (!name) return;
    const location = typeof param.in === 'string' ? param.in.trim().toLowerCase() : '';
    const value = normalizedParams[name];
    if (location === 'path') {
      if (value === undefined || value === null) return;
      const encoded = encodeURIComponent(String(value));
      resolvedPath = resolvedPath.replace(new RegExp(`{${name}}`, 'g'), encoded);
      used.add(name);
    } else if (location === 'query') {
      if (value === undefined || value === null || `${value}`.trim() === '') return;
      query.set(name, String(value));
      used.add(name);
    }
  });

  Object.entries(normalizedParams).forEach(([key, value]) => {
    if (used.has(key)) return;
    if (value === undefined || value === null || `${value}`.trim() === '') return;
    query.set(key, String(value));
  });

  if (/{[^}]+}/.test(resolvedPath)) {
    throw new Error('Missing required path parameters');
  }

  const queryObject = {};
  query.forEach((value, key) => {
    queryObject[key] = value;
  });

  const queryString = query.toString();
  const finalPath = queryString ? `${resolvedPath}?${queryString}` : resolvedPath;

  const hasBody = method !== 'GET' && method !== 'HEAD';
  let requestBody = undefined;
  if (hasBody) {
    if (body !== undefined && body !== null) {
      requestBody = body;
    } else if (definition?.requestBody && typeof params === 'object') {
      requestBody = body;
    }
  }

  return {
    method,
    path: finalPath,
    query: queryObject,
    body: requestBody,
  };
}

function toJsonColumn(value) {
  if (value === undefined || value === null) return null;
  try {
    return JSON.stringify(value);
  } catch {
    return JSON.stringify(String(value));
  }
}

export async function invokeInfoEndpoint(endpointId, options = {}) {
  if (!endpointId || typeof endpointId !== 'string') {
    const err = new Error('endpointId is required');
    err.status = 400;
    throw err;
  }
  const endpoint = await getEndpointById(endpointId.trim());
  if (!endpoint) {
    const err = new Error(`POSAPI endpoint not found: ${endpointId}`);
    err.status = 404;
    throw err;
  }
  const usage = typeof endpoint.usage === 'string' ? endpoint.usage.trim() : '';
  if (usage && !ALLOWED_USAGE.has(usage)) {
    const err = new Error('Endpoint is not enabled for information lookups');
    err.status = 400;
    throw err;
  }

  const { method, path, query, body } = buildRequestContext(endpoint, options.params, options.body);
  const token = await getPosApiToken();
  const headers = {};
  let requestBodyPayload;
  if (body !== undefined && body !== null) {
    headers['Content-Type'] = 'application/json';
    requestBodyPayload = typeof body === 'string' ? body : JSON.stringify(body);
  }

  let responseBody = null;
  let responseStatus = null;
  try {
    const response = await posApiFetch(path, {
      method,
      token,
      headers,
      body: requestBodyPayload,
    });
    responseBody = response;
    responseStatus = 200;
    return {
      endpoint: sanitizeDefinition(endpoint),
      data: response,
      status: 200,
      request: { method, path, query },
    };
  } catch (err) {
    responseStatus = err?.status ?? 500;
    responseBody = { error: err.message };
    throw err;
  } finally {
    try {
      await pool.query(
        `INSERT INTO posapi_info_audit
          (company_id, user_id, table_name, form_name, endpoint_id, request_method, request_path, request_query, request_body, response_status, response_body)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          options.companyId ?? null,
          options.userId ?? null,
          options.tableName ?? null,
          options.formName ?? null,
          endpointId.trim(),
          method,
          path,
          toJsonColumn(query),
          toJsonColumn(body ?? null),
          responseStatus,
          toJsonColumn(responseBody),
        ],
      );
    } catch (logErr) {
      console.error('Failed to audit POSAPI info lookup', {
        endpointId,
        error: logErr,
      });
    }
  }
}
