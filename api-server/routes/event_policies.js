import express from 'express';
import { requireAuth } from '../middlewares/auth.js';
import { pool } from '../../db/index.js';
import { validateEventPolicySchema } from '../services/eventPolicyEvaluator.js';
import rateLimit from 'express-rate-limit';
import rateLimit from 'express-rate-limit';

const router = express.Router();
// Apply rate limiting to all event policy routes to mitigate abuse of database-backed endpoints.
const eventPoliciesLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs for these routes
  standardHeaders: true,
  legacyHeaders: false,
});

router.use(eventPoliciesLimiter);


const eventPoliciesLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs for these routes
});

router.get('/', eventPoliciesLimiter, requireAuth, async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT * FROM core_event_policies WHERE company_id = ? AND deleted_at IS NULL ORDER BY priority ASC, policy_id ASC`,
      [req.user.companyId],
    );
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

router.post('/', eventPoliciesLimiter, requireAuth, async (req, res, next) => {
  try {
    const validation = validateEventPolicySchema(req.body || {});
    if (!validation.ok) return res.status(400).json(validation);

    const payload = req.body || {};
    const [result] = await pool.query(
      `INSERT INTO core_event_policies
      (policy_key, policy_name, event_type, module_key, priority, is_active, stop_on_match, condition_json, action_json, ai_policy_json, company_id, created_by, updated_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        payload.policy_key,
        payload.policy_name,
        payload.event_type,
        payload.module_key || null,
        Number(payload.priority || 100),
        payload.is_active === undefined ? 1 : (payload.is_active ? 1 : 0),
        payload.stop_on_match ? 1 : 0,
        JSON.stringify(payload.condition_json || {}),
        JSON.stringify(payload.action_json || {}),
        payload.ai_policy_json ? JSON.stringify(payload.ai_policy_json) : null,
        req.user.companyId,
        req.user.empid,
        req.user.empid,
      ],
    );
    res.status(201).json({ policy_id: result.insertId });
  } catch (error) {
    next(error);
  }
});

router.put('/:id', eventPoliciesLimiter, requireAuth, async (req, res, next) => {
  try {
    const validation = validateEventPolicySchema(req.body || {});
    if (!validation.ok) return res.status(400).json(validation);

    const payload = req.body || {};
    await pool.query(
      `UPDATE core_event_policies
       SET policy_name = ?, module_key = ?, event_type = ?, priority = ?, is_active = ?, stop_on_match = ?,
           condition_json = ?, action_json = ?, ai_policy_json = ?, updated_by = ?, updated_at = NOW()
       WHERE policy_id = ? AND company_id = ? AND deleted_at IS NULL`,
      [
        payload.policy_name,
        payload.module_key || null,
        payload.event_type,
        Number(payload.priority || 100),
        payload.is_active === undefined ? 1 : (payload.is_active ? 1 : 0),
        payload.stop_on_match ? 1 : 0,
        JSON.stringify(payload.condition_json || {}),
        JSON.stringify(payload.action_json || {}),
        payload.ai_policy_json ? JSON.stringify(payload.ai_policy_json) : null,
        req.user.empid,
        req.params.id,
        req.user.companyId,
      ],
    );
    res.sendStatus(204);
  } catch (error) {
    next(error);
  }
});

export default router;
