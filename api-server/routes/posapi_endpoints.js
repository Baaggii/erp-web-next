import express from 'express';
import { requireAuth } from '../middlewares/auth.js';
import { loadEndpoints, saveEndpoints } from '../services/posApiRegistry.js';
import { getEmploymentSession } from '../../db/index.js';

const router = express.Router();

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
    const blocks = [];
    const codeBlockRegex = /```json\s*([\s\S]*?)```/gi;
    let match;
    while ((match = codeBlockRegex.exec(text))) {
      try {
        const parsed = JSON.parse(match[1]);
        blocks.push(parsed);
      } catch (err) {
        console.warn('Failed to parse JSON code block from doc', err);
      }
    }
    if (blocks.length === 0) {
      const trimmed = text.trim();
      if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        try {
          blocks.push(JSON.parse(trimmed));
        } catch (err) {
          console.warn('Failed to parse top-level JSON from doc', err);
        }
      }
    }
    res.json({ text, blocks });
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

    let requestBody = undefined;
    if (definition.requestBody && typeof definition.requestBody === 'object') {
      const schema = definition.requestBody.schema;
      if (schema !== undefined && schema !== null && definition.method !== 'GET') {
        requestBody = schema;
      }
    }

    const { method, url } = buildTestUrl(definition);

    const headers = new Headers({ Accept: 'application/json, text/plain;q=0.9, */*;q=0.5' });
    let body;
    if (requestBody !== undefined && requestBody !== null && method !== 'GET' && method !== 'HEAD') {
      headers.set('Content-Type', 'application/json');
      body = JSON.stringify(requestBody);
    }

    let response;
    try {
      response = await fetch(url, { method, headers, body });
    } catch (err) {
      res
        .status(502)
        .json({ message: err?.message || 'Failed to reach the POSAPI test server' });
      return;
    }
    const text = await response.text();
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }

    res.json({
      request: {
        method,
        url: url.toString(),
        headers: sanitizeHeaders(headers),
        body: requestBody ?? null,
      },
      response: {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        headers: sanitizeHeaders(response.headers),
        bodyText: text,
        bodyJson: parsed,
      },
    });
  } catch (err) {
    if (err?.message === 'Test server URL is required') {
      res.status(400).json({ message: err.message });
      return;
    }
    next(err);
  }
});

export default router;
