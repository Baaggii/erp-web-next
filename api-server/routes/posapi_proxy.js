import express from 'express';
import { requireAuth } from '../middlewares/auth.js';
import { requireAdmin } from '../middlewares/admin.js';
import { invokePosApiEndpoint, resolvePosApiEndpoint } from '../services/posApiService.js';
import { logUserAction } from '../services/userActivityLog.js';

const router = express.Router();

function serializeForLog(value, maxLength = 4000) {
  if (value === undefined || value === null) return value;
  try {
    const text = JSON.stringify(value);
    if (text.length <= maxLength) return value;
    return `${text.slice(0, maxLength - 1)}…`;
  } catch {
    const str = String(value);
    if (str.length <= maxLength) return str;
    return `${str.slice(0, maxLength - 1)}…`;
  }
}

router.post('/invoke', requireAuth, requireAdmin, async (req, res, next) => {
  const { endpointId, payload, context, options } = req.body || {};
  if (!endpointId || typeof endpointId !== 'string') {
    res.status(400).json({ message: 'endpointId is required' });
    return;
  }

  let endpoint;
  try {
    endpoint = await resolvePosApiEndpoint(endpointId);
    const safePayload =
      payload && typeof payload === 'object' && !Array.isArray(payload)
        ? payload
        : {};
    const safeOptions =
      options && typeof options === 'object' && !Array.isArray(options)
        ? options
        : {};

    const response = await invokePosApiEndpoint(endpoint.id, safePayload, {
      ...safeOptions,
      endpoint,
    });

    const responsePreview = serializeForLog(response);
    const logDetails = {
      endpointId: endpoint.id,
      endpointName: endpoint.name,
      method: endpoint.method,
      path: endpoint.path,
      payload: serializeForLog(safePayload),
      response: responsePreview,
      status: 'success',
    };
    if (context && typeof context === 'object') {
      logDetails.context = context;
    }

    try {
      await logUserAction({
        emp_id: req.user.empid,
        table_name: 'POSAPI_INFO',
        record_id:
          context && typeof context === 'object' && context.recordId !== undefined
            ? context.recordId
            : null,
        action: 'POSAPI_INFO_LOOKUP',
        details: logDetails,
        company_id: req.user.companyId,
      });
    } catch (logErr) {
      console.error('Failed to log POSAPI info lookup', logErr);
    }

    res.json({
      response,
      endpoint: {
        id: endpoint.id,
        name: endpoint.name,
        method: endpoint.method,
        path: endpoint.path,
      },
    });
  } catch (err) {
    try {
      await logUserAction({
        emp_id: req.user.empid,
        table_name: 'POSAPI_INFO',
        record_id:
          context && typeof context === 'object' && context.recordId !== undefined
            ? context.recordId
            : null,
        action: 'POSAPI_INFO_LOOKUP_ERROR',
        details: {
          endpointId,
          payload: serializeForLog(payload),
          error: err.message,
        },
        company_id: req.user.companyId,
      });
    } catch (logErr) {
      console.error('Failed to log POSAPI info lookup error', logErr);
    }
    next(err);
  }
});

export default router;
