import express from 'express';
import { requireAuth } from '../middlewares/auth.js';
import { createRequest, listRequests, respondRequest } from '../services/pendingRequest.js';
import { getEmploymentSession } from '../../db/index.js';

const router = express.Router();

router.post('/', requireAuth, async (req, res, next) => {
  try {
    const session = await getEmploymentSession(req.user.empid, req.user.companyId);
    if (!session?.permissions?.edit_delete_request) return res.sendStatus(403);
    const { table_name, record_id, request_type, proposed_data } = req.body;
    if (!table_name || !record_id || !request_type) {
      return res.status(400).json({ message: 'table_name, record_id and request_type are required' });
    }
    const result = await createRequest({
      tableName: table_name,
      recordId: record_id,
      empId: req.user.empid,
      requestType: request_type,
      proposedData: proposed_data,
    });
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const { status, senior_empid } = req.query;
    if (!status || !senior_empid) {
      return res.status(400).json({ message: 'status and senior_empid are required' });
    }
    if (req.user.empid !== senior_empid) return res.sendStatus(403);
    const requests = await listRequests(status, senior_empid);
    res.json(requests);
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
    await respondRequest(req.params.id, req.user.empid, status, response_notes);
    res.sendStatus(204);
  } catch (err) {
    if (err.message === 'Forbidden') return res.sendStatus(403);
    next(err);
  }
});

export default router;
