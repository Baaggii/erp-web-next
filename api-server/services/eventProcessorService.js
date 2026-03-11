import { pool } from '../../db/index.js';
import { evaluateConditionTree } from './eventPolicyEvaluator.js';
import { executePolicyActions } from './eventActionExecutor.js';
import { isEventEngineEnabled } from './eventEngineConfigService.js';
import { evaluateGraphPolicy, convertLegacyPolicyToGraph } from './graphPolicyEngine.js';

function parseJson(value, fallback = {}) {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

function normalizeEventRow(row) {
  return {
    eventId: row.event_id,
    eventType: row.event_type,
    companyId: row.company_id,
    branchId: row.branch_id,
    departmentId: row.department_id,
    workplaceId: row.workplace_id,
    actorEmpid: row.actor_empid,
    correlationId: row.correlation_id,
    causationId: row.causation_id,
    source: {
      transactionType: row.source_transaction_type,
      table: row.source_table,
      recordId: row.source_record_id,
      action: row.source_action,
    },
    payload: parseJson(row.payload_json, {}),
  };
}

async function writePolicyRun(conn, payload) {
  const [result] = await conn.query(
    `INSERT INTO core_event_policy_runs
    (policy_id, event_id, run_id, status, graph_json_snapshot, executed_at, company_id)
    VALUES (?, ?, ?, ?, ?, NOW(), ?)`,
    [
      payload.policyId,
      payload.eventId,
      payload.runId,
      payload.status,
      payload.graphJsonSnapshot ? JSON.stringify(payload.graphJsonSnapshot) : null,
      payload.companyId,
    ],
  );
  return result.insertId;
}

export async function processPendingEvents({ companyId, eventId = null, limit = 50, conn = pool } = {}) {
  if (!(await isEventEngineEnabled(conn))) return { processed: 0, failed: 0, ignored: 0, events: [], skipped: true };

  const params = [];
  let where = `status IN ('pending','failed') AND deleted_at IS NULL`;
  if (companyId) { where += ' AND company_id = ?'; params.push(companyId); }
  if (eventId != null) { where += ' AND event_id = ?'; params.push(eventId); }

  const [events] = await conn.query(`SELECT * FROM core_events WHERE ${where} ORDER BY occurred_at ASC LIMIT ?`, [...params, Number(limit) || 50]);
  const summary = { processed: 0, failed: 0, ignored: 0, events: [] };

  for (const row of events) {
    const event = normalizeEventRow(row);
    const tx = conn.getConnection ? await conn.getConnection() : await pool.getConnection();
    try {
      if (tx.beginTransaction) await tx.beginTransaction();
      await tx.query(`UPDATE core_events SET status='processing', updated_at=NOW() WHERE event_id = ?`, [event.eventId]);
      const [policies] = await tx.query(
        `SELECT * FROM core_event_policies
         WHERE company_id = ? AND event_type = ? AND is_active = 1 AND deleted_at IS NULL
         ORDER BY priority ASC, policy_id ASC`,
        [event.companyId, event.eventType],
      );

      if (!policies.length) {
        await tx.query(`UPDATE core_events SET status='ignored', processed_at=NOW(), error_message=NULL, updated_at=NOW() WHERE event_id=?`, [event.eventId]);
        if (tx.commit) await tx.commit();
        if (tx.release) tx.release();
        summary.processed += 1; summary.ignored += 1; summary.events.push({ eventId: event.eventId, status: 'ignored' });
        continue;
      }

      let matchedAny = false;
      for (const policy of policies) {
        const conditionJson = parseJson(policy.condition_json, {});
        const actionJson = parseJson(policy.action_json, { actions: [] });
        const graphJson = parseJson(policy.graph_json, null) || convertLegacyPolicyToGraph({ eventType: event.eventType, conditionJson, actionJson });

        const conditionResult = evaluateConditionTree(conditionJson, event);
        const graphResult = evaluateGraphPolicy({ graphJson, event });
        if (!conditionResult.matched && !graphResult.matched) {
          continue;
        }

        matchedAny = true;
        for (const nodeId of graphResult.executionPath || []) {
          const idempotencyKey = `${event.eventId}:${policy.policy_id}:${nodeId}`;
          const [alreadyRun] = await tx.query(
            `SELECT id FROM core_event_policy_runs WHERE run_id = ? AND company_id = ? LIMIT 1`,
            [idempotencyKey, event.companyId],
          );
          if (alreadyRun.length) continue;
          await writePolicyRun(tx, {
            policyId: policy.policy_id,
            eventId: event.eventId,
            runId: idempotencyKey,
            status: 'completed',
            graphJsonSnapshot: graphJson,
            companyId: event.companyId,
          });
        }

        const actionPolicy = { ...policy, action_json: JSON.stringify({ actions: graphResult.actions?.length ? graphResult.actions : (actionJson.actions || []) }) };
        await executePolicyActions({ event, policy: actionPolicy, companyId: event.companyId, conn: tx });
        if (Number(policy.stop_on_match) === 1) break;
      }

      const finalStatus = matchedAny ? 'processed' : 'ignored';
      await tx.query(`UPDATE core_events SET status=?, processed_at=NOW(), error_message=NULL, updated_at=NOW() WHERE event_id=?`, [finalStatus, event.eventId]);
      if (tx.commit) await tx.commit();
      if (tx.release) tx.release();
      summary.processed += 1;
      if (!matchedAny) summary.ignored += 1;
      summary.events.push({ eventId: event.eventId, status: finalStatus });
    } catch (error) {
      try {
        if (tx.rollback) await tx.rollback();
        await tx.query(`UPDATE core_events SET status='failed', retry_count=retry_count+1, error_message=?, updated_at=NOW() WHERE event_id=?`, [error?.message || 'event_processing_failed', event.eventId]);
      } catch {}
      if (tx.release) tx.release();
      await conn.query(
        `INSERT INTO core_event_dead_letters (event_id, company_id, failure_stage, error_message, event_snapshot_json, retry_count)
         VALUES (?, ?, 'event_processor', ?, ?, (SELECT retry_count FROM core_events WHERE event_id = ?))`,
        [event.eventId, event.companyId, error?.message || 'event_processing_failed', JSON.stringify(event), event.eventId],
      );
      summary.failed += 1;
      summary.events.push({ eventId: event.eventId, status: 'failed', error: error?.message });
    }
  }

  return summary;
}
