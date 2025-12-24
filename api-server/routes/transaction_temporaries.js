import express from 'express';
import { requireAuth } from '../middlewares/auth.js';
import {
  createTemporarySubmission,
  listTemporarySubmissions,
  listTemporarySubmissionGroups,
  getTemporarySummary,
  promoteTemporarySubmission,
  rejectTemporarySubmission,
  getTemporaryChainHistory,
  deleteTemporarySubmission,
} from '../services/transactionTemporaries.js';

const router = express.Router();

router.get('/summary', requireAuth, async (req, res, next) => {
  try {
    const summary = await getTemporarySummary(req.user.empid, req.user.companyId, {
      tableName: req.query.table || null,
      transactionTypeField: req.query.transactionTypeField || null,
      transactionTypeValue: req.query.transactionTypeValue || null,
    });
    res.json(summary);
  } catch (err) {
    next(err);
  }
});

router.get('/:id/chain', requireAuth, async (req, res, next) => {
  try {
    const chain = await getTemporaryChainHistory(req.params.id);
    res.json({
      chainId: chain.chainId || null,
      chain: chain.chain || chain,
      reviewHistory: chain.reviewHistory || [],
    });
  } catch (err) {
    next(err);
  }
});

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const {
      scope = 'created',
      table,
      status,
      limit,
      offset,
      transactionTypeField = null,
      transactionTypeValue = null,
    } = req.query;
    const scopeParam = typeof scope === 'string' ? scope.trim().toLowerCase() : '';
    const normalizedScope = scopeParam === 'review' ? 'review' : 'created';
    const statusParam = typeof status === 'string' ? status.trim().toLowerCase() : '';
    const normalizedStatus = statusParam
      ? statusParam
      : normalizedScope === 'review'
      ? 'pending'
      : null;
    const list = await listTemporarySubmissions({
      scope: normalizedScope,
      tableName: table || null,
      empId: req.user.empid,
      companyId: req.user.companyId,
      status: normalizedStatus,
      limit,
      offset,
      transactionTypeField,
      transactionTypeValue,
      includeHasMore: true,
    });
    res.json({ rows: list.rows, hasMore: list.hasMore, nextOffset: list.nextOffset });
  } catch (err) {
    next(err);
  }
});

router.get('/grouped', requireAuth, async (req, res, next) => {
  try {
    const {
      scope = 'created',
      table,
      status,
      limit,
      offset,
      transactionTypeField = null,
      transactionTypeValue = null,
    } = req.query;
    const scopeParam = typeof scope === 'string' ? scope.trim().toLowerCase() : '';
    const normalizedScope = scopeParam === 'review' ? 'review' : 'created';
    const statusParam = typeof status === 'string' ? status.trim().toLowerCase() : '';
    const normalizedStatus = statusParam
      ? statusParam
      : normalizedScope === 'review'
      ? 'pending'
      : null;
    const list = await listTemporarySubmissionGroups({
      scope: normalizedScope,
      tableName: table || null,
      empId: req.user.empid,
      companyId: req.user.companyId,
      status: normalizedStatus,
      limit,
      offset,
      transactionTypeField,
      transactionTypeValue,
    });
    res.json({
      rows: list.rows,
      groups: list.groups,
      hasMore: list.hasMore,
      nextOffset: list.nextOffset,
    });
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
      chainId,
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
      chainId,
      companyId: tenant.company_id ?? req.user.companyId,
      branchId: tenant.branch_id ?? null,
      departmentId: tenant.department_id ?? null,
      createdBy: req.user.empid,
      tenant,
    });
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/:id/promote', requireAuth, async (req, res, next) => {
  try {
    const { notes, cleanedValues, forcePromote } = req.body || {};
    if (forcePromote !== undefined && typeof forcePromote !== 'boolean') {
      return res.status(400).json({ message: 'forcePromote must be a boolean' });
    }
    const io = req.app.get('io');
    const result = await promoteTemporarySubmission(req.params.id, {
      reviewerEmpId: req.user.empid,
      notes,
      io,
      cleanedValues,
      forcePromote: forcePromote === true,
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

router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const result = await deleteTemporarySubmission(req.params.id, {
      requesterEmpId: req.user.empid,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
