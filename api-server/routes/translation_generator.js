import express from 'express';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { requireAuth } from '../middlewares/auth.js';
import { getEmploymentSession } from '../../db/index.js';
import { hasAction } from '../utils/hasAction.js';

const router = express.Router();
let currentController = null;

async function checkPermission(req) {
  const session =
    req.session ||
    (await getEmploymentSession(req.user.empid, req.user.companyId));
  return hasAction(session, 'system_settings');
}

router.get('/', requireAuth, async (req, res, next) => {
  try {
    if (!(await checkPermission(req))) return res.sendStatus(403);

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders && res.flushHeaders();

    const controller = new AbortController();
    currentController = controller;

    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const scriptPath = path.resolve(__dirname, '../../scripts/generateTranslations.cli.js');

    const sendError = (err) => {
      res.write(`event: generator_error\ndata: ${err.message}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
      if (currentController === controller) currentController = null;
    };

    let child;
    try {
      child = spawn(process.execPath, [scriptPath], {
        signal: controller.signal,
      });
    } catch (err) {
      sendError(err);
      return;
    }

    const send = (chunk) => {
      const lines = chunk.toString().split(/\r?\n/);
      for (const line of lines) {
        if (line) res.write(`data: ${line}\n\n`);
      }
    };

    const sendErrorLine = (chunk) => {
      const lines = chunk.toString().split(/\r?\n/);
      for (const line of lines) {
        if (line)
          res.write(`event: generator_error\ndata: ${line}\n\n`);
      }
    };

    child.stdout.on('data', send);
    child.stderr.on('data', sendErrorLine);

    child.on('error', sendError);

    child.on('close', (code) => {
      if (code !== 0) {
        sendError(new Error(`Process exited with code ${code}`));
        return;
      }
      res.write('data: [DONE]\n\n');
      res.end();
      if (currentController === controller) currentController = null;
    });

    req.on('close', () => {
      controller.abort();
    });
  } catch (err) {
    next(err);
  }
});

router.post('/stop', requireAuth, async (req, res, next) => {
  try {
    if (!(await checkPermission(req))) return res.sendStatus(403);
    if (currentController) {
      currentController.abort();
      currentController = null;
    }
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;

