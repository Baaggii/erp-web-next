import express from 'express';
import { requireAuth } from '../middlewares/auth.js';
import {
  createTemporarySubmission,
  listTemporarySubmissions,
  getTemporarySummary,
  promoteTemporarySubmission,
  rejectTemporarySubmission,
  promoteTemporarySubmissionsBulk,
} from '../services/transactionTemporaries.js';

const router = express.Router();

router.get('/summary', requireAuth, async (req, res, next) => {
  try {
    const summary = await getTemporarySummary(req.user.empid, req.user.companyId);
    res.json(summary);
  } catch (err) {
    next(err);
  }
});

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const { scope = 'created', table, status } = req.query;
    const list = await listTemporarySubmissions({
      scope: scope === 'review' ? 'review' : 'created',
      tableName: table || null,
      empId: req.user.empid,
      companyId: req.user.companyId,
      status: status || 'pending',
    });
    res.json({ rows: list });
  } catch (err) {
    next(err);
  }
});

router.post('/', requireAuth, async (req, res, next) => {
  try {
    const {
      table: tableName,
      formName,
      configName,
      moduleKey,
      payload,
      rawValues,
      cleanedValues,
      tenant = {},
    } = req.body || {};
    const result = await createTemporarySubmission({
      tableName,
      formName,
      configName,
      moduleKey,
      payload,
      rawValues,
      cleanedValues,
      companyId: tenant.company_id ?? req.user.companyId,
      branchId: tenant.branch_id ?? null,
      departmentId: tenant.department_id ?? null,
      createdBy: req.user.empid,
    });
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/bulk/promote', requireAuth, async (req, res, next) => {
  try {
    const { ids, notes } = req.body || {};
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: 'ids is required' });
    }
    const io = req.app.get('io');
    const result = await promoteTemporarySubmissionsBulk(ids, {
      reviewerEmpId: req.user.empid,
      notes,
      io,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/:id/promote', requireAuth, async (req, res, next) => {
  try {
    const { notes } = req.body || {};
    const io = req.app.get('io');
    const result = await promoteTemporarySubmission(req.params.id, {
      reviewerEmpId: req.user.empid,
      notes,
      io,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/:id/reject', requireAuth, async (req, res, next) => {
  try {
    const { notes } = req.body || {};
    if (!notes || !String(notes).trim()) {
      return res.status(400).json({ message: 'notes is required' });
    }
    const io = req.app.get('io');
    const result = await rejectTemporarySubmission(req.params.id, {
      reviewerEmpId: req.user.empid,
      notes,
      io,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;

