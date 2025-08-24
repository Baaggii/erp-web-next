import express from 'express';
import { requireAuth } from '../middlewares/auth.js';
import {
  createRequest,
  listRequests,
  listRequestsByEmp,
  respondRequest,
  ALLOWED_REQUEST_TYPES,
} from '../services/pendingRequest.js';


const router = express.Router();

router.post('/', requireAuth, async (req, res, next) => {
  try {
    const { table_name, record_id, request_type, proposed_data } = req.body;
    if (!table_name || !record_id || !request_type) {
      return res
        .status(400)
        .json({ message: 'table_name, record_id and request_type are required' });
    }

    if (!ALLOWED_REQUEST_TYPES.has(request_type)) {
      return res.status(400).json({ message: 'invalid request_type' });
    }
    const result = await createRequest({
      tableName: table_name,
      recordId: record_id,
      empId: req.user.empid,
      requestType: request_type,
      proposedData: proposed_data,
    });
    const io = req.app.get('io');
    if (io && result.senior_empid) {
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
    } = req.query;
    const { rows, total } = await listRequestsByEmp(req.user.empid, {
      status,
      table_name,
      request_type,
      date_from,
      date_to,
      date_field,
      page,
      per_page,
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
    } = req.query;

    const empid = String(req.user.empid).trim().toUpperCase();

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
    const result = await respondRequest(
      req.params.id,
      req.user.empid,
      status,
      response_notes,
    );
    const io = req.app.get('io');
    if (io && result?.requester) {
      io.to(`user:${result.requester}`).emit('requestResolved', {
        requestId: req.params.id,
        status,
      });
    }
    res.sendStatus(204);
  } catch (err) {
    if (err.message === 'Forbidden') return res.sendStatus(403);
    next(err);
  }
});

export default router;
