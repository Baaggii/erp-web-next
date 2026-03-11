import express from 'express';
import rateLimit from 'express-rate-limit';
import { requireAuth } from '../middlewares/auth.js';
import { pool } from '../../db/index.js';
import { validateEventPolicySchema } from '../services/eventPolicyEvaluator.js';
import { invalidateTenantEventEngineFastCheck } from '../services/eventEngineFastCheck.js';

const router = express.Router();

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
});

router.use(requireAuth, limiter);

function requireSystemSettings(req, res) {
  if (!req.user?.permissions?.system_settings) {
    res.sendStatus(403);
    return false;
  }
  return true;
}

function resolveCompanyId(req) {
  return req.user?.companyId
    ?? req.user?.company_id
    ?? req.session?.companyId
    ?? req.session?.company_id
    ?? null;
}


function parseJsonSafely(value, fallback) {
  if (value == null) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

router.get('/event-types', async (req, res, next) => {
  try {
    if (!requireSystemSettings(req, res)) return;
    const companyId =
      req.user?.companyId ??
      req.user?.company_id ??
      req.session?.companyId ??
      null;

    const [rows] = companyId == null
      ? await pool.query(
        `SELECT DISTINCT event_type
         FROM core_events
         ORDER BY event_type`,
      )
      : await pool.query(
        `SELECT DISTINCT event_type
         FROM core_events
         WHERE company_id = ?
         ORDER BY event_type`,
        [companyId],
      );
    res.json(rows.map((row) => row.event_type).filter(Boolean));
  } catch (error) {
    next(error);
  }
});

router.get('/list', async (req, res, next) => {
  try {
    if (!requireSystemSettings(req, res)) return;
    const companyId = resolveCompanyId(req);
    const [rows] = companyId == null
      ? await pool.query(
        `SELECT
          policy_id,
          policy_name,
          policy_key,
          event_type,
          module_key,
          priority,
          is_active
         FROM core_event_policies
         WHERE deleted_at IS NULL
         ORDER BY priority ASC, policy_id ASC`,
      )
      : await pool.query(
        `SELECT
        policy_id,
        policy_name,
        policy_key,
        event_type,
        module_key,
        priority,
        is_active
       FROM core_event_policies
       WHERE company_id = ?
         AND deleted_at IS NULL
       ORDER BY priority ASC, policy_id ASC`,
        [companyId],
      );
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

router.get('/:id(\d+)', async (req, res, next) => {
  try {
    if (!requireSystemSettings(req, res)) return;
    const companyId = resolveCompanyId(req);
    const [rows] = companyId == null
      ? await pool.query(
        `SELECT
          policy_id,
          policy_name,
          policy_key,
          event_type,
          module_key,
          priority,
          is_active,
          condition_json,
          action_json
         FROM core_event_policies
         WHERE policy_id = ?
           AND deleted_at IS NULL
         LIMIT 1`,
        [req.params.id],
      )
      : await pool.query(
        `SELECT
          policy_id,
          policy_name,
          policy_key,
          event_type,
          module_key,
          priority,
          is_active,
          condition_json,
          action_json
         FROM core_event_policies
         WHERE policy_id = ?
           AND company_id = ?
           AND deleted_at IS NULL
         LIMIT 1`,
        [req.params.id, companyId],
      );
    if (!rows.length) return res.sendStatus(404);
    const row = rows[0];
    let conditionJson = row.condition_json;
    let actionJson = row.action_json;
    if (typeof conditionJson === 'string') {
      try { conditionJson = JSON.parse(conditionJson); } catch {}
    }
    if (typeof actionJson === 'string') {
      try { actionJson = JSON.parse(actionJson); } catch {}
    }
    res.json({ ...row, condition_json: conditionJson, action_json: actionJson });
  } catch (error) {
    next(error);
  }
});

router.get('/', async (req, res, next) => {
  try {
    if (!requireSystemSettings(req, res)) return;
    const companyId = resolveCompanyId(req);
    const [rows] = companyId == null
      ? await pool.query(
        `SELECT * FROM core_event_policies WHERE deleted_at IS NULL ORDER BY priority ASC, policy_id ASC`,
      )
      : await pool.query(
        `SELECT * FROM core_event_policies WHERE company_id = ? AND deleted_at IS NULL ORDER BY priority ASC, policy_id ASC`,
        [companyId],
      );
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

router.get('/scenarios', async (req, res, next) => {
  try {
    if (!requireSystemSettings(req, res)) return;
    const companyId = resolveCompanyId(req);
    const [rows] = companyId == null
      ? await pool.query(
        `SELECT
          scenario_key,
          scenario_name,
          event_type,
          default_condition_json,
          default_action_json,
          default_policy_name,
          default_policy_key
         FROM event_scenarios
         WHERE is_active = 1
         ORDER BY sort_order ASC, scenario_name ASC`,
      )
      : await pool.query(
        `SELECT
          scenario_key,
          scenario_name,
          event_type,
          default_condition_json,
          default_action_json,
          default_policy_name,
          default_policy_key
         FROM event_scenarios
         WHERE is_active = 1
           AND (company_id IS NULL OR company_id = ?)
         ORDER BY sort_order ASC, scenario_name ASC`,
        [companyId],
      );
    const scenarios = rows.map((row) => ({
      ...row,
      default_condition_json: parseJsonSafely(row.default_condition_json, { logic: 'and', rules: [] }),
      default_action_json: parseJsonSafely(row.default_action_json, { actions: [] }),
    }));
    res.json(scenarios);
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req, res, next) => {
  try {
    if (!requireSystemSettings(req, res)) return;
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
    invalidateTenantEventEngineFastCheck(req.user.companyId);
    res.status(201).json({ policy_id: result.insertId });
  } catch (error) {
    next(error);
  }
});

router.put('/:id(\d+)', async (req, res, next) => {
  try {
    if (!requireSystemSettings(req, res)) return;
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
    invalidateTenantEventEngineFastCheck(req.user.companyId);
    res.sendStatus(204);
  } catch (error) {
    next(error);
  }
});

router.get('/drafts', async (req, res, next) => {
  try {
    if (!requireSystemSettings(req, res)) return;
    const [rows] = await pool.query(
      `SELECT * FROM policy_drafts WHERE company_id = ? ORDER BY updated_at DESC`,
      [req.user.companyId],
    );
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

router.post('/drafts', async (req, res, next) => {
  try {
    if (!requireSystemSettings(req, res)) return;
    const payload = req.body || {};
    const [result] = await pool.query(
      `INSERT INTO policy_drafts
      (company_id, policy_name, policy_key, event_type, module_key, priority, is_active, condition_json, action_json, created_by, updated_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.user.companyId,
        payload.policy_name,
        payload.policy_key,
        payload.event_type,
        payload.module_key || null,
        Number(payload.priority || 100),
        payload.is_active ? 1 : 0,
        JSON.stringify(payload.condition_json || { logic: 'and', rules: [] }),
        JSON.stringify(payload.action_json || { actions: [] }),
        req.user.empid,
        req.user.empid,
      ],
    );
    res.status(201).json({ policy_draft_id: result.insertId });
  } catch (error) {
    next(error);
  }
});

router.put('/drafts/:id', async (req, res, next) => {
  try {
    if (!requireSystemSettings(req, res)) return;
    const payload = req.body || {};
    await pool.query(
      `UPDATE policy_drafts SET policy_name=?, policy_key=?, event_type=?, module_key=?, priority=?, is_active=?,
      condition_json=?, action_json=?, updated_by=?, updated_at=NOW()
      WHERE policy_draft_id=? AND company_id=?`,
      [
        payload.policy_name,
        payload.policy_key,
        payload.event_type,
        payload.module_key || null,
        Number(payload.priority || 100),
        payload.is_active ? 1 : 0,
        JSON.stringify(payload.condition_json || { logic: 'and', rules: [] }),
        JSON.stringify(payload.action_json || { actions: [] }),
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

router.post('/deploy/:draftId', async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    if (!requireSystemSettings(req, res)) return;
    await conn.beginTransaction();

    const [draftRows] = await conn.query(
      `SELECT * FROM policy_drafts WHERE policy_draft_id = ? AND company_id = ? LIMIT 1`,
      [req.params.draftId, req.user.companyId],
    );
    if (!draftRows.length) {
      await conn.rollback();
      return res.sendStatus(404);
    }
    const draft = draftRows[0];

    const validation = validateEventPolicySchema({ condition_json: draft.condition_json, action_json: draft.action_json });
    if (!validation.ok) {
      await conn.rollback();
      return res.status(400).json(validation);
    }

    const [existingRows] = await conn.query(
      `SELECT * FROM core_event_policies WHERE policy_key=? AND company_id=? AND deleted_at IS NULL LIMIT 1`,
      [draft.policy_key, req.user.companyId],
    );

    let policyId = existingRows[0]?.policy_id;
    if (policyId) {
      await conn.query(
        `UPDATE core_event_policies SET policy_name=?, event_type=?, module_key=?, priority=?, is_active=?,
         condition_json=?, action_json=?, updated_by=?, updated_at=NOW() WHERE policy_id=? AND company_id=?`,
        [draft.policy_name, draft.event_type, draft.module_key, draft.priority, draft.is_active, draft.condition_json, draft.action_json, req.user.empid, policyId, req.user.companyId],
      );
    } else {
      const [insertResult] = await conn.query(
        `INSERT INTO core_event_policies
        (policy_key, policy_name, event_type, module_key, priority, is_active, stop_on_match, condition_json, action_json, company_id, created_by, updated_by)
        VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?)`,
        [draft.policy_key, draft.policy_name, draft.event_type, draft.module_key, draft.priority, draft.is_active, draft.condition_json, draft.action_json, req.user.companyId, req.user.empid, req.user.empid],
      );
      policyId = insertResult.insertId;
    }

    const [versionRows] = await conn.query(
      `SELECT COALESCE(MAX(version_number), 0) AS max_version FROM policy_versions WHERE policy_id = ?`,
      [policyId],
    );
    const nextVersion = Number(versionRows[0]?.max_version || 0) + 1;

    await conn.query(
      `INSERT INTO policy_versions
       (policy_id, condition_json, action_json, version_number, created_by, company_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [policyId, draft.condition_json, draft.action_json, nextVersion, req.user.empid, req.user.companyId],
    );

    await conn.commit();
    invalidateTenantEventEngineFastCheck(req.user.companyId);
    res.json({ ok: true, policy_id: policyId, version_number: nextVersion });
  } catch (error) {
    await conn.rollback();
    next(error);
  } finally {
    conn.release();
  }
});

router.get('/:id(\d+)/versions', async (req, res, next) => {
  try {
    if (!requireSystemSettings(req, res)) return;
    const [rows] = await pool.query(
      `SELECT version_id, policy_id, version_number, created_by, created_at
       FROM policy_versions WHERE policy_id = ? AND company_id = ? ORDER BY version_number DESC`,
      [req.params.id, req.user.companyId],
    );
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

export default router;
