import express from 'express';
import { requireAuth } from '../middlewares/auth.js';
import { loadEndpoints, getEndpointById } from '../services/posApiRegistry.js';
import { invokePosApiEndpoint } from '../services/posApiService.js';
import { recordPosApiInfoCall } from '../services/posApiAudit.js';

const router = express.Router();

function parseIds(queryValue) {
  if (!queryValue) return [];
  if (Array.isArray(queryValue)) {
    return queryValue
      .flatMap((entry) => String(entry).split(','))
      .map((id) => id.trim())
      .filter((id) => id);
  }
  return String(queryValue)
    .split(',')
    .map((id) => id.trim())
    .filter((id) => id);
}

function sanitizeContext(context = {}) {
  const tableName = typeof context.table === 'string' ? context.table : context.tableName;
  const formName = typeof context.formName === 'string' ? context.formName : context.name;
  const recordId = context.recordId ?? context.id ?? null;
  return {
    tableName: typeof tableName === 'string' ? tableName : null,
    formName: typeof formName === 'string' ? formName : null,
    recordId,
  };
}

function normalizeParams(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value;
}

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const ids = parseIds(req.query.ids);
    if (!ids.length) {
      res.json([]);
      return;
    }
    const idSet = new Set(ids);
    const endpoints = await loadEndpoints();
    const filtered = endpoints
      .filter((endpoint) => endpoint && typeof endpoint === 'object' && idSet.has(endpoint.id))
      .map((endpoint) => ({
        id: endpoint.id,
        name: endpoint.name || '',
        usage: endpoint.usage || '',
        method: (endpoint.method || 'GET').toUpperCase(),
        path: endpoint.path || '',
        description: endpoint.description || '',
        parameters: Array.isArray(endpoint.parameters)
          ? endpoint.parameters
              .filter((param) => param && typeof param === 'object')
              .map((param) => ({
                name: param.name || '',
                in: param.in || 'query',
                required: Boolean(param.required),
                description: param.description || '',
                example: param.example,
                default: param.default,
                sample: param.sample,
                testValue: param.testValue,
              }))
          : [],
        responseFields: Array.isArray(endpoint.responseFields)
          ? endpoint.responseFields.filter((field) => field && typeof field === 'object')
          : [],
      }));
    res.json(filtered);
  } catch (err) {
    next(err);
  }
});

router.post('/:endpointId/invoke', requireAuth, async (req, res, next) => {
  const { endpointId } = req.params;
  const companyId = Number(req.query.companyId ?? req.user.companyId);
  const params = normalizeParams(req.body?.params);
  const context = sanitizeContext(req.body?.context || {});
  const body = req.body?.body;

  let requestSnapshot = { params };
  try {
    const invocation = await invokePosApiEndpoint(endpointId, {
      params,
      body,
    });
    requestSnapshot = invocation.request || requestSnapshot;
    await recordPosApiInfoCall({
      endpointId,
      companyId,
      userId: req.user.id,
      tableName: context.tableName,
      formName: context.formName,
      recordId: context.recordId,
      params: requestSnapshot,
      response: invocation.response,
    });
    res.json({
      response: invocation.response,
      endpoint: {
        id: invocation.endpoint?.id || endpointId,
        name: invocation.endpoint?.name || '',
        method: invocation.endpoint?.method || '',
      },
    });
  } catch (err) {
    await recordPosApiInfoCall({
      endpointId,
      companyId,
      userId: req.user.id,
      tableName: context.tableName,
      formName: context.formName,
      recordId: context.recordId,
      params: requestSnapshot,
      response: { error: err.message },
    });
    next(err);
  }
});

router.get('/:endpointId', requireAuth, async (req, res, next) => {
  try {
    const endpoint = await getEndpointById(req.params.endpointId);
    if (!endpoint) {
      res.status(404).json({ message: 'Endpoint not found' });
      return;
    }
    res.json(endpoint);
  } catch (err) {
    next(err);
  }
});

export default router;
