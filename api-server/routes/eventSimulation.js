import express from 'express';
import { requireAuth } from '../middlewares/auth.js';
import { pool } from '../../db/index.js';
import { evaluateConditionTree } from '../services/eventPolicyEvaluator.js';
import { resolvePolicyPath } from '../services/policyExpressionEngine.js';
import { evaluateGraphPolicy, convertLegacyPolicyToGraph } from '../services/graphPolicyEngine.js';

const router = express.Router();

function parseJson(value, fallback) {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

function resolveMapping(mapping = {}, event = {}) {
  const out = {};
  for (const [key, val] of Object.entries(mapping || {})) {
    if (typeof val === 'string' && val.includes('.')) out[key] = resolvePolicyPath(event, val);
    else out[key] = val;
  }
  return out;
}

router.post('/simulate', requireAuth, async (req, res, next) => {
  try {
    if (!req.user?.permissions?.system_settings) return res.sendStatus(403);

    const payload = req.body || {};
    const event = {
      eventType: payload.eventType,
      payload: payload.payload && typeof payload.payload === 'object' ? payload.payload : {},
      source: payload.source && typeof payload.source === 'object' ? payload.source : {},
      companyId: Number(payload.companyId || req.user.companyId),
      branchId: payload.branchId || null,
    };

    const [policies] = await pool.query(
      `SELECT * FROM core_event_policies
       WHERE company_id = ? AND event_type = ? AND is_active = 1 AND deleted_at IS NULL
       ORDER BY priority ASC, policy_id ASC`,
      [req.user.companyId, event.eventType],
    );

    const matchedPolicies = [];
    const conditionResults = [];
    const actionsGenerated = [];
    const notifications = [];
    const twinChanges = [];
    const executionPath = [];
    const delays = [];

    for (const policy of policies) {
      const conditionJson = parseJson(policy.condition_json, { logic: 'and', rules: [] });
      const actionJson = parseJson(policy.action_json, { actions: [] });
      const graphJson = payload.graph_json || parseJson(policy.graph_json, null) || convertLegacyPolicyToGraph({ eventType: event.eventType, conditionJson, actionJson });

      const graphResult = evaluateGraphPolicy({ graphJson, event });
      executionPath.push(...(graphResult.executionPath || []));
      delays.push(...(graphResult.delays || []));

      const evaluation = evaluateConditionTree(conditionJson, event);
      conditionResults.push({ policyKey: policy.policy_key, matched: evaluation.matched, evaluation, graph: graphResult });
      if (!evaluation.matched && !graphResult.matched) continue;

      matchedPolicies.push(policy.policy_key);
      const actions = graphResult.actions?.length ? graphResult.actions : (Array.isArray(actionJson.actions) ? actionJson.actions : []);
      for (const action of actions) {
        const type = String(action?.type || 'unknown');
        actionsGenerated.push(type);
        if (type === 'notify') notifications.push({ message: action.message || event.eventType, target: action.target || null });
        if (type === 'update_twin') twinChanges.push({ twin: action.twin || 'unknown', mapping: resolveMapping(action.mapping, event) });
      }
    }

    res.json({
      matchedPolicies,
      conditionResults,
      actionsGenerated,
      executionPath,
      delays,
      preview: { twinChanges, notifications },
      simulationMode: true,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
