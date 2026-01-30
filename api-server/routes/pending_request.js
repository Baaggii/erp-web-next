import express from 'express';
import rateLimit from 'express-rate-limit';
import { requireAuth } from '../middlewares/auth.js';
import {
  createRequest,
  createBulkEditRequest,
  listRequests,
  listRequestsByEmp,
  respondRequest,
  ALLOWED_REQUEST_TYPES,
} from '../services/pendingRequest.js';


const router = express.Router();

const pendingRequestLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id ?? req.user?.empid ?? req.ip,
});

router.post('/bulk_edit', requireAuth, pendingRequestLimiter, async (req, res, next) => {
  try {
    const {
      table,
      ids,
      table_name,
      record_ids,
      field,
      value,
      request_reason,
      report_payload,
    } = req.body || {};
    const tableName = table || table_name;
    const recordIds = Array.isArray(ids) ? ids : record_ids;
    if (!tableName || !Array.isArray(recordIds) || recordIds.length === 0 || !field) {
      return res.status(400).json({
        message: 'table, ids, and field are required',
      });
    }
    if (!request_reason || !String(request_reason).trim()) {
      return res.status(400).json({ message: 'request_reason is required' });
    }
    const result = await createBulkEditRequest({
      tableName,
      recordIds,
      empId: req.user.empid,
      field,
      value,
      requestReason: request_reason,
      companyId: req.user.companyId,
      reportPayload: report_payload,
    });
    const io = req.app.get('io');
    if (io && result?.senior_empid) {
      // Deprecated: legacy event; notification:new is authoritative.
      io.to(`user:${result.senior_empid}`).emit('newRequest', {
        requestId: result.request_id,
        tableName,
        recordId: result.record_id,
        requestType: 'bulk_edit',
      });
    }
    res.status(201).json(result);
  } catch (err) {
    if (err.status === 400 && err.message === 'invalid table_name') {
      return res.status(400).json({ message: 'invalid table_name' });
    }
    if (err.status === 400) {
      return res.status(400).json({ message: err.message });
    }
    if (err.status === 409) {
      return res.status(409).json({ message: err.message });
    }
    if (err.status === 423) {
      return res.status(423).json({ message: err.message });
    }
    next(err);
  }
});

router.post('/', requireAuth, pendingRequestLimiter, async (req, res, next) => {
  try {
    const { table_name, record_id, request_type, proposed_data, request_reason } = req.body;
    if (!table_name || !record_id || !request_type) {
      return res
        .status(400)
        .json({ message: 'table_name, record_id and request_type are required' });
    }
    if (!request_reason || !String(request_reason).trim()) {
      return res.status(400).json({ message: 'request_reason is required' });
    }

    if (!ALLOWED_REQUEST_TYPES.has(request_type)) {
      return res.status(400).json({ message: 'invalid request_type' });
    }
    if (request_type === 'bulk_edit') {
      return res.status(400).json({ message: 'Use the bulk_edit endpoint' });
    }
    const result = await createRequest({
      tableName: table_name,
      recordId: record_id,
      empId: req.user.empid,
      requestType: request_type,
      proposedData: proposed_data,
      requestReason: request_reason,
      companyId: req.user.companyId,
    });
    const io = req.app.get('io');
    if (io && result.senior_empid) {
      // Deprecated: legacy event; notification:new is authoritative.
      io.to(`user:${result.senior_empid}`).emit('newRequest', {
        requestId: result.request_id,
        tableName: table_name,
        recordId: record_id,
        requestType: request_type,
      });
    }
    res.status(201).json(result);
  } catch (err) {
    if (err.status === 400 && err.message === 'invalid table_name') {
      return res.status(400).json({ message: 'invalid table_name' });
    }
    if (err.status === 400 && err.message === 'invalid_report_payload') {
      return res.status(400).json({ message: 'invalid report_approval payload' });
    }
    if (err.status === 400 && err.message === 'invalid_bulk_payload') {
      return res.status(400).json({ message: 'invalid bulk update payload' });
    }
    next(err);
  }
});

router.get('/outgoing', requireAuth, async (req, res, next) => {
  try {
    const {
      status,
      table_name,
      request_type,
      date_from,
      date_to,
      date_field,
      page,
      per_page,
      count_only,
    } = req.query;
    const normalizedCountOnly =
      typeof count_only === 'string'
        ? ['1', 'true', 'yes'].includes(count_only.trim().toLowerCase())
        : Boolean(count_only);
    const { rows, total } = await listRequestsByEmp(req.user.empid, {
      status,
      table_name,
      request_type,
      date_from,
      date_to,
      date_field,
      page,
      per_page,
      count_only: normalizedCountOnly,
    });
    const pageNum = Number(page) > 0 ? Number(page) : 1;
    const perPageNum = Number(per_page) > 0 ? Number(per_page) : 2;
    res.json({ rows, total, page: pageNum, per_page: perPageNum });
  } catch (err) {
    next(err);
  }
});

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const {
      status,
      requested_empid,
      table_name,
      request_type,
      date_from,
      date_to,
      date_field,
      page,
      per_page,
      count_only,
    } = req.query;

    const empid = String(req.user.empid).trim().toUpperCase();
    const normalizedCountOnly =
      typeof count_only === 'string'
        ? ['1', 'true', 'yes'].includes(count_only.trim().toLowerCase())
        : Boolean(count_only);

    const { rows, total } = await listRequests({
      status,
      senior_empid: empid,
      requested_empid,
      table_name,
      request_type,
      date_from,
      date_to,
      date_field,
      page,
      per_page,
      count_only: normalizedCountOnly,
    });
    const pageNum = Number(page) > 0 ? Number(page) : 1;
    const perPageNum = Number(per_page) > 0 ? Number(per_page) : 2;
    res.json({ rows, total, page: pageNum, per_page: perPageNum });
  } catch (err) {
    next(err);
  }
});

router.put('/:id/respond', requireAuth, async (req, res, next) => {
  try {
    const { status, response_notes } = req.body;
    if (!['accepted', 'declined'].includes(status)) {
      return res.status(400).json({ message: 'invalid status' });
    }
    if (!response_notes || !String(response_notes).trim()) {
      return res.status(400).json({ message: 'response_notes is required' });
    }
    const result = await respondRequest(
      req.params.id,
      req.user.empid,
      status,
      response_notes,
    );
    const io = req.app.get('io');
    if (io && result?.requester) {
      // Deprecated: legacy event; notification:new is authoritative.
      io.to(`user:${result.requester}`).emit('requestResolved', {
        requestId: req.params.id,
        status,
        requestType: result?.requestType,
        lockedTransactions: result?.lockedTransactions || [],
      });
    }
    res.sendStatus(204);
  } catch (err) {
    if (err.message === 'Forbidden') return res.sendStatus(403);
    if (err.status === 400 && err.message === 'invalid_report_payload') {
      return res.status(400).json({ message: 'invalid report_approval payload' });
    }
    if (err.status === 423) {
      return res.status(423).json({ message: err.message });
    }
    next(err);
  }
});

export default router;
