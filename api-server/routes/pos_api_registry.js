import express from 'express';
import { requireAuth } from '../middlewares/auth.js';
import { loadEndpoints, saveEndpoints } from '../services/posApiRegistry.js';
import { getEmploymentSession } from '../../db/index.js';

const router = express.Router();

async function ensureAdmin(req) {
  const companyId = Number(req.query.companyId ?? req.user.companyId);
  const session =
    req.session || (await getEmploymentSession(req.user.empid, companyId));
  const canManage =
    session?.permissions?.system_settings ||
    req.user?.permissions?.system_settings;
  if (!canManage) {
    const err = new Error('Forbidden');
    err.status = 403;
    throw err;
  }
  return { companyId, session };
}

function decodeHtmlEntities(str) {
  return str
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function tryParseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function extractJsonBlocks(source) {
  if (!source) return [];
  const blocks = [];
  const fenceRegex = /```(?:json)?\s*([\s\S]*?)\s*```/gi;
  let match;
  while ((match = fenceRegex.exec(source))) {
    const snippet = match[1].trim();
    const parsed = tryParseJson(snippet);
    if (parsed !== null) {
      blocks.push({
        label: `Code block ${blocks.length + 1}`,
        json: parsed,
      });
    }
  }

  const codeRegex = /<code[^>]*>([\s\S]*?)<\/code>/gi;
  while ((match = codeRegex.exec(source))) {
    const snippet = decodeHtmlEntities(match[1].trim());
    const parsed = tryParseJson(snippet);
    if (parsed !== null) {
      blocks.push({
        label: `Snippet ${blocks.length + 1}`,
        json: parsed,
      });
    }
  }

  return blocks;
}

router.get('/', requireAuth, async (req, res, next) => {
  try {
    await ensureAdmin(req);
    const endpoints = await loadEndpoints();
    res.json({ endpoints });
  } catch (err) {
    next(err);
  }
});

router.put('/', requireAuth, async (req, res, next) => {
  try {
    await ensureAdmin(req);
    const payload = req.body?.endpoints ?? req.body;
    const endpoints = await saveEndpoints(payload || []);
    res.json({ endpoints });
  } catch (err) {
    next(err);
  }
});

router.post('/scrape', requireAuth, async (req, res, next) => {
  try {
    await ensureAdmin(req);
    const { url } = req.body || {};
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ message: 'url is required' });
    }
    const response = await fetch(url);
    if (!response.ok) {
      const text = await response.text();
      const err = new Error(
        `Failed to fetch documentation (${response.status} ${response.statusText})`,
      );
      err.details = text.slice(0, 500);
      throw err;
    }
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const json = await response.json();
      return res.json({
        blocks: [
          {
            label: 'Document JSON',
            json,
          },
        ],
      });
    }
    const text = await response.text();
    const blocks = extractJsonBlocks(text);
    res.json({
      blocks,
      raw: blocks.length ? undefined : text.slice(0, 5000),
    });
  } catch (err) {
    next(err);
  }
});

export default router;
