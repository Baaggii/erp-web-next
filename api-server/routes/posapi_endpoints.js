import express from 'express';
import { requireAuth } from '../middlewares/auth.js';
import { loadEndpoints, saveEndpoints } from '../services/posApiRegistry.js';
import { getEmploymentSession } from '../../db/index.js';

const router = express.Router();

function findJsonBoundary(text, start) {
  const open = text[start];
  const close = open === '{' ? '}' : ']';
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === '\\') {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === open) depth += 1;
    if (ch === close) {
      depth -= 1;
      if (depth === 0) {
        return i;
      }
    }
  }
  return -1;
}

function extractJsonBlocksFromText(text) {
  if (!text) return [];
  const seen = new Set();
  const blocks = [];

  function pushCandidate(candidate) {
    if (!candidate) return;
    const trimmed = candidate.trim();
    if (!trimmed || trimmed.length < 2 || trimmed.length > 200000) return;
    if (seen.has(trimmed)) return;
    try {
      blocks.push(JSON.parse(trimmed));
      seen.add(trimmed);
    } catch (err) {
      // Ignore invalid JSON snippets
    }
  }

  const fencedRegex = /```(?:json)?\s*([\s\S]*?)```/gi;
  let match;
  while ((match = fencedRegex.exec(text))) {
    pushCandidate(match[1]);
  }

  const dataRegex = /--data(?:-raw)?\s+(?:'([\s\S]*?)'|"([\s\S]*?)")/gi;
  while ((match = dataRegex.exec(text))) {
    let candidate = match[1] || match[2];
    if (!candidate && typeof match[2] === 'string') {
      candidate = match[2];
    }
    if (match[2]) {
      try {
        candidate = JSON.parse(`"${match[2]}"`);
      } catch (err) {
        // Leave candidate as captured string if unescaping fails
      }
    }
    pushCandidate(candidate);
  }

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '{' || ch === '[') {
      const end = findJsonBoundary(text, i);
      if (end !== -1) {
        pushCandidate(text.slice(i, end + 1));
        i = end;
      }
    }
  }

  return blocks;
}

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
    const blocks = extractJsonBlocksFromText(text);
    res.json({ text, blocks });
  } catch (err) {
    next(err);
  }
});

router.post('/test', requireAuth, async (req, res, next) => {
  try {
    const guard = await requireSystemSettings(req, res);
    if (!guard) return;

    const payload = req.body?.request || req.body;
    const method = (payload?.method || 'GET').toUpperCase();
    const url = payload?.url;
    const headers = payload?.headers || {};
    let body = payload?.body;

    if (!url || typeof url !== 'string') {
      res.status(400).json({ message: 'A request URL is required' });
      return;
    }

    let parsedUrl;
    try {
      parsedUrl = new URL(url);
    } catch (err) {
      res.status(400).json({ message: 'Invalid request URL' });
      return;
    }

    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      res.status(400).json({ message: 'Only HTTP(S) URLs are supported' });
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const requestInit = {
      method,
      headers: {},
      signal: controller.signal,
    };

    if (headers && typeof headers === 'object') {
      for (const [key, value] of Object.entries(headers)) {
        if (value === undefined || value === null) continue;
        requestInit.headers[key] = String(value);
      }
    }

    if (body !== undefined && body !== null) {
      if (typeof body === 'object') {
        requestInit.body = JSON.stringify(body);
        if (!requestInit.headers['Content-Type'] && !requestInit.headers['content-type']) {
          requestInit.headers['Content-Type'] = 'application/json';
        }
      } else {
        requestInit.body = String(body);
      }
    }

    const startedAt = Date.now();
    let response;
    try {
      response = await fetch(url, requestInit);
    } finally {
      clearTimeout(timeout);
    }

    const elapsedMs = Date.now() - startedAt;
    const responseHeaders = Object.fromEntries(response.headers.entries());
    const text = await response.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      // Ignore JSON parse errors
    }

    res.status(response.status).json({
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      durationMs: elapsedMs,
      headers: responseHeaders,
      body: json,
      rawBody: json ? undefined : text,
    });
  } catch (err) {
    if (err.name === 'AbortError') {
      res.status(504).json({ message: 'Request timed out after 15s' });
      return;
    }
    if (err instanceof TypeError || err.code === 'ECONNREFUSED') {
      res.status(502).json({ message: err.message || 'Failed to execute test request' });
      return;
    }
    next(err);
  }
});

export default router;
