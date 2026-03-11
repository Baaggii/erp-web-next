import { pool, insertTableRow, updateTableRow } from '../../db/index.js';
import { upsertTwinState } from './twinStateService.js';
import { runAiPolicy } from './aiPolicyService.js';
import { resolvePolicyPath } from './policyExpressionEngine.js';

function resolveValue(template, event) {
  if (typeof template !== 'string') return template;
  if (!template.includes('.')) return template;
  return resolvePolicyPath(event, template);
}

function resolveMapping(mapping = {}, event) {
  const out = {};
  for (const [key, value] of Object.entries(mapping || {})) {
    out[key] = resolveValue(value, event);
  }
  return out;
}

async function createNotification(action, event, companyId, conn = pool) {
  const mode = action?.target?.mode || 'empids';
  const recipients = Array.isArray(action?.target?.values) ? action.target.values : [];
  if (!recipients.length) return { skipped: true, reason: 'no_recipients' };

  const created = [];
  for (const recipient of recipients) {
    const recipientEmpid = String(recipient || '').trim().toUpperCase();
    if (!recipientEmpid) continue;
    const [result] = await conn.query(
      `INSERT INTO notifications
      (company_id, recipient_empid, type, related_id, message, created_by, created_at)
      VALUES (?, ?, 'request', ?, ?, ?, NOW())`,
      [companyId, recipientEmpid, event.source?.recordId ?? null, action.message || event.eventType, event.actorEmpid || null],
    );
    created.push({ notificationId: result.insertId, recipientEmpid, mode });
  }
  return { created };
}

async function callProcedureSafely(action, companyId, conn = pool) {
  const allowed = new Set(Array.isArray(action?.allowList) ? action.allowList : []);
  const procedure = String(action?.procedure || '').trim();
  if (!procedure || !allowed.has(procedure)) {
    throw new Error('Procedure call blocked by policy allow-list');
  }
  const params = Array.isArray(action?.params) ? action.params : [];
  const callWithCompanyScope = action?.includeCompanyId !== false;
  const finalParams = callWithCompanyScope ? [...params, companyId] : params;
  const placeholders = finalParams.map(() => '?').join(', ');
  const sql = `CALL \`${procedure}\`(${placeholders})`;
  await conn.query(sql, finalParams);
  return { called: procedure };
}

export async function executePolicyActions({ event, policy, companyId, conn = pool, adapters = {} }) {
  const actionJson = policy?.action_json && typeof policy.action_json === 'string'
    ? JSON.parse(policy.action_json)
    : (policy?.action_json || policy?.actionJson || {});
  const actions = Array.isArray(actionJson.actions) ? actionJson.actions : [];
  const results = [];

  for (const action of actions) {
    const type = String(action?.type || '').trim().toLowerCase();
    if (!type) continue;

    if (type === 'create_transaction') {
      const tableName = String(action?.tableName || `transactions_${action?.transactionType || 'dynamic'}`);
      const row = resolveMapping(action.mapping, event);
      row.company_id = companyId;
      const createTxn = adapters.createTransaction || insertTableRow;
      const created = await createTxn(tableName, row, undefined, undefined, false, event.actorEmpid, {
        conn,
        mutationContext: { changedBy: event.actorEmpid, companyId },
      });
      results.push({ type, created });
      continue;
    }

    if (type === 'update_transaction') {
      const tableName = String(action?.tableName || '');
      const recordId = resolveValue(action?.recordId, event);
      const updates = resolveMapping(action.mapping, event);
      const updateTxn = adapters.updateTransaction || updateTableRow;
      const updated = await updateTxn(tableName, recordId, updates, companyId, conn, {
        mutationContext: { changedBy: event.actorEmpid, companyId },
      });
      results.push({ type, updated });
      continue;
    }

    if (type === 'create_notification' || type === 'notify') {
      results.push({ type, ...(await createNotification(action, event, companyId, conn)) });
      continue;
    }

    if (type === 'update_twin') {
      const twin = String(action?.twin || '').trim().toLowerCase();
      const record = resolveMapping(action.mapping, event);
      record.company_id = companyId;
      if (event.eventId) record.last_event_id = event.eventId;
      const upserted = await upsertTwinState(twin, record, conn);
      results.push({ type, upserted });
      continue;
    }

    if (type === 'enqueue_ai_review') {
      const ai = await runAiPolicy({ policy: action.aiPolicy || {}, event, companyId });
      results.push({ type, ai });
      continue;
    }

    if (type === 'call_procedure') {
      results.push({ type, ...(await callProcedureSafely(action, companyId, conn)) });
      continue;
    }

    results.push({ type, skipped: true, reason: 'action_type_not_implemented' });
  }
  return results;
}
