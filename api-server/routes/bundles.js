import express from 'express';
import { requireAuth } from '../middlewares/auth.js';
import { buildBundleContext, errorEnvelope, okEnvelope, setBundleHeaders } from '../services/bundles/bundleUtils.js';
import { getBootstrapBundle } from '../services/bundles/bootstrapBundleService.js';
import { getFormBundle } from '../services/bundles/formBundleService.js';
import { searchRelation } from '../services/relations/relationSearchService.js';
import { invalidateCacheByPrefix } from '../services/cache/cacheService.js';

const router = express.Router();

function done(res, start, bundle, payload) {
  const durationMs = Date.now() - start;
  setBundleHeaders(res, {
    bundle,
    cacheHit: payload.meta?.cache?.hit,
    cacheKey: payload.meta?.cache?.key,
    durationMs,
  });
  return res.json(payload);
}

router.get('/bootstrap', requireAuth, async (req, res, next) => {
  const start = Date.now();
  try {
    const { context, session } = await buildBundleContext(req);
    const result = await getBootstrapBundle(context, session);
    return done(
      res,
      start,
      'bootstrap',
      okEnvelope(result.value, {
        cache: {
          hit: result.hit,
          key: result.key,
          ttlSeconds: result.ttlSeconds,
          stale: false,
        },
      }),
    );
  } catch (err) {
    next(err);
  }
});

router.get('/page_bundle', requireAuth, async (req, res) => {
  const start = Date.now();
  const { context } = await buildBundleContext(req);
  const data = {
    page: context.pageKey,
    layout: { title: context.pageKey || 'Page', breadcrumbs: [] },
    widgets: [],
    summary: {},
    notificationsPreview: { items: [], nextCursor: null, hasMore: false },
    counts: { pendingRequests: 0, unreadNotifications: 0 },
    dependencies: { modules: [], menu: {}, permissions: {} },
  };
  return done(
    res,
    start,
    'page_bundle',
    okEnvelope(data, {
      cache: { hit: false, key: 'page_bundle:v2:passthrough', ttlSeconds: 0, stale: false },
    }),
  );
});

router.get('/form_bundle', requireAuth, async (req, res, next) => {
  const start = Date.now();
  try {
    const { context, session } = await buildBundleContext(req);
    if (!context.moduleKey) {
      return res.status(400).json(errorEnvelope('MODULE_KEY_REQUIRED', 'moduleKey is required'));
    }

    const result = await getFormBundle(context, session);
    return done(
      res,
      start,
      'form_bundle',
      okEnvelope(result.value, {
        cache: { hit: result.hit, key: result.key, ttlSeconds: result.ttlSeconds, stale: false },
      }),
    );
  } catch (err) {
    if (err?.code === 'FORM_NOT_FOUND') {
      return res.status(404).json(errorEnvelope(err.code, err.message));
    }
    next(err);
  }
});

router.get('/relations/:table', requireAuth, async (req, res, next) => {
  const start = Date.now();
  try {
    const { context } = await buildBundleContext(req);
    const result = await searchRelation(context, req.query);
    return done(
      res,
      start,
      'relation',
      okEnvelope(result.value, {
        cache: { hit: result.hit, key: result.key, ttlSeconds: result.ttlSeconds, stale: false },
      }),
    );
  } catch (err) {
    next(err);
  }
});

router.get('/table_bundle/:table', requireAuth, async (_req, res) => {
  return res.status(501).json(errorEnvelope('NOT_IMPLEMENTED', 'table_bundle is scheduled for phase 2'));
});

router.get('/report_bundle/:reportKey', requireAuth, async (_req, res) => {
  return res.status(501).json(errorEnvelope('NOT_IMPLEMENTED', 'report_bundle is scheduled for phase 2'));
});

router.post('/cache/invalidate', requireAuth, async (req, res) => {
  const scopes = Array.isArray(req.body?.scopes) ? req.body.scopes : [];
  const prefixes = scopes.map((scope) => `${String(scope)}:`);
  const removed = invalidateCacheByPrefix(prefixes);
  return res.json(okEnvelope({ invalidated: removed, scopes }));
});

export default router;
