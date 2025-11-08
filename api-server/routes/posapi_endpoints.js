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

export default router;
