import { pool } from '../../db/index.js';
import { evaluateConditionTree } from './eventPolicyEvaluator.js';
import { executePolicyActions } from './eventActionExecutor.js';
import { isEventEngineEnabled } from './eventEngineConfigService.js';

const MAX_RETRY_COUNT = Number(process.env.EVENT_ENGINE_MAX_RETRIES || 5);
const RETRY_BASE_SECONDS = Number(process.env.EVENT_ENGINE_RETRY_BASE_SECONDS || 30);

function parseJson(value, fallback = {}) {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
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

function computeNextRetryAt(retryCount) {
  const exponent = Math.max(0, Number(retryCount) - 1);
  const backoffSeconds = RETRY_BASE_SECONDS * (2 ** exponent);
  return `DATE_ADD(NOW(), INTERVAL ${Math.max(1, Math.floor(backoffSeconds))} SECOND)`;
}

async function writePolicyRun(conn, payload) {
  const [result] = await conn.query(
    `INSERT INTO core_event_policy_runs
    (event_id, policy_id, run_status, condition_result_json, action_result_json, error_message, company_id, finished_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
    [
      payload.eventId,
      payload.policyId,
      payload.runStatus,
      payload.conditionResult ? JSON.stringify(payload.conditionResult) : null,
      payload.actionResult ? JSON.stringify(payload.actionResult) : null,
      payload.errorMessage || null,
      payload.companyId,
    ],
  );
  return result.insertId;
}

async function processSingleEvent(event, txConn) {
  await txConn.query(`UPDATE core_events SET status='processing', updated_at=NOW() WHERE event_id = ?`, [event.eventId]);
  const [policies] = await txConn.query(
    `SELECT * FROM core_event_policies
      WHERE company_id = ? AND event_type = ? AND is_active = 1 AND deleted_at IS NULL
      ORDER BY priority ASC, policy_id ASC`,
    [event.companyId, event.eventType],
  );

  if (!Array.isArray(policies) || policies.length === 0) {
    await txConn.query(
      `UPDATE core_events SET status = 'ignored', processed_at = NOW(), error_message = NULL, updated_at = NOW() WHERE event_id = ?`,
      [event.eventId],
    );
    return { status: 'ignored' };
  }

  let matchedAny = false;
  for (const policy of policies) {
    const conditionJson = parseJson(policy.condition_json, {});
    let conditionResult;
    try {
      conditionResult = evaluateConditionTree(conditionJson, event);
    } catch (evaluationError) {
      await writePolicyRun(txConn, {
        eventId: event.eventId,
        policyId: policy.policy_id,
        runStatus: 'failed',
        conditionResult: { matched: false, reason: 'evaluation_error' },
        errorMessage: evaluationError?.message || 'policy_evaluation_failed',
        companyId: event.companyId,
      });
      throw evaluationError;
    }
    if (!conditionResult.matched) {
      await writePolicyRun(txConn, {
        eventId: event.eventId,
        policyId: policy.policy_id,
        runStatus: 'skipped',
        conditionResult,
        companyId: event.companyId,
      });
      continue;
    }

    matchedAny = true;
    await writePolicyRun(txConn, {
      eventId: event.eventId,
      policyId: policy.policy_id,
      runStatus: 'matched',
      conditionResult,
      companyId: event.companyId,
    });

    try {
      const actionResult = await executePolicyActions({ event, policy, companyId: event.companyId, conn: txConn });
      await writePolicyRun(txConn, {
        eventId: event.eventId,
        policyId: policy.policy_id,
        runStatus: 'completed',
        conditionResult,
        actionResult,
        companyId: event.companyId,
      });
    } catch (actionError) {
      await writePolicyRun(txConn, {
        eventId: event.eventId,
        policyId: policy.policy_id,
        runStatus: 'failed',
        conditionResult,
        errorMessage: actionError?.message || 'action_failed',
        companyId: event.companyId,
      });
      throw actionError;
    }

    if (Number(policy.stop_on_match) === 1) break;
  }

  const finalStatus = matchedAny ? 'processed' : 'ignored';
  await txConn.query(
    `UPDATE core_events SET status = ?, processed_at = NOW(), error_message = NULL, updated_at = NOW() WHERE event_id = ?`,
    [finalStatus, event.eventId],
  );
  return { status: finalStatus };
}

export async function processPendingEvents({ companyId, eventId = null, limit = 50, conn = pool } = {}) {
  if (!(await isEventEngineEnabled(conn))) {
    return { processed: 0, failed: 0, ignored: 0, events: [], skipped: true };
  }

  const params = [];
  let where = `status IN ('pending','failed') AND deleted_at IS NULL AND retry_count < ?
    AND (status = 'pending' OR next_retry_at IS NULL OR next_retry_at <= NOW())`;
  params.push(MAX_RETRY_COUNT);
  if (companyId) {
    where += ' AND company_id = ?';
    params.push(companyId);
  }
  if (eventId != null) {
    where += ' AND event_id = ?';
    params.push(eventId);
  }

  const [events] = await conn.query(
    `SELECT * FROM core_events WHERE ${where} ORDER BY occurred_at ASC LIMIT ?`,
    [...params, Number(limit) || 50],
  );

  const summary = { processed: 0, failed: 0, ignored: 0, events: [] };

  for (const row of events) {
    const event = normalizeEventRow(row);
    const txConn = typeof conn.getConnection === 'function' ? await conn.getConnection() : conn;
    const supportsTx = typeof txConn.beginTransaction === 'function';
    try {
      if (supportsTx) await txConn.beginTransaction();
      const result = await processSingleEvent(event, txConn);
      if (supportsTx) await txConn.commit();
      summary.processed += 1;
      if (result.status === 'ignored') summary.ignored += 1;
      summary.events.push({ eventId: event.eventId, status: result.status });
    } catch (error) {
      if (supportsTx) await txConn.rollback();
      const nextRetryExpr = computeNextRetryAt((Number(row.retry_count) || 0) + 1);
      await conn.query(
        `UPDATE core_events
         SET status='failed', retry_count = retry_count + 1, next_retry_at = ${nextRetryExpr}, error_message = ?, updated_at = NOW()
         WHERE event_id = ?`,
        [error?.message || 'event_processing_failed', event.eventId],
      );
      await conn.query(
        `INSERT INTO core_event_dead_letters (event_id, company_id, failure_stage, error_message, event_snapshot_json, retry_count)
         VALUES (?, ?, 'event_processor', ?, ?, (SELECT retry_count FROM core_events WHERE event_id = ?))`,
        [event.eventId, event.companyId, error?.message || 'event_processing_failed', JSON.stringify(event), event.eventId],
      );
      summary.failed += 1;
      summary.events.push({ eventId: event.eventId, status: 'failed', error: error?.message });
    } finally {
      if (txConn !== conn && typeof txConn.release === 'function') txConn.release();
    }
  }

  return summary;
}
