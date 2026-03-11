import { pool } from '../../db/index.js';
import { evaluateConditionTree } from './eventPolicyEvaluator.js';
import { executePolicyActions } from './eventActionExecutor.js';
import { isEventEngineEnabled } from './eventEngineConfigService.js';

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

const MAX_RETRIES = 8;

function computeRetryBackoff(retryCount) {
  const safeRetry = Math.max(0, Number(retryCount) || 0);
  const seconds = Math.min(3600, 2 ** safeRetry);
  return new Date(Date.now() + (seconds * 1000));
}

async function beginTx(conn) {
  if (typeof conn.beginTransaction === 'function') await conn.beginTransaction();
}

async function commitTx(conn) {
  if (typeof conn.commit === 'function') await conn.commit();
}

async function rollbackTx(conn) {
  if (typeof conn.rollback === 'function') await conn.rollback();
}

export async function processPendingEvents({ companyId, eventId = null, limit = 50, conn = pool } = {}) {
  if (!(await isEventEngineEnabled(conn))) {
    return { processed: 0, failed: 0, ignored: 0, events: [], skipped: true };
  }

  const params = [];
  let where = `status IN ('pending','failed') AND deleted_at IS NULL AND (next_retry_at IS NULL OR next_retry_at <= NOW())`;
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
    try {
      await beginTx(conn);
      await conn.query(`UPDATE core_events SET status='processing', updated_at=NOW() WHERE event_id = ?`, [event.eventId]);
      const [policies] = await conn.query(
        `SELECT * FROM core_event_policies
         WHERE company_id = ? AND event_type = ? AND is_active = 1 AND deleted_at IS NULL
         ORDER BY priority ASC, policy_id ASC`,
        [event.companyId, event.eventType],
      );

      if (!Array.isArray(policies) || policies.length === 0) {
        await conn.query(
          `UPDATE core_events SET status = 'ignored', processed_at = NOW(), error_message = NULL, updated_at = NOW() WHERE event_id = ?`,
          [event.eventId],
        );
        summary.processed += 1;
        summary.ignored += 1;
        summary.events.push({ eventId: event.eventId, status: 'ignored' });
        await commitTx(conn);
        continue;
      }

      let matchedAny = false;
      for (const policy of policies) {
        const conditionJson = parseJson(policy.condition_json, {});
        let conditionResult;
        try {
          conditionResult = evaluateConditionTree(conditionJson, event);
        } catch (evaluationError) {
          console.error('Event policy evaluation failed', {
            eventId: event.eventId,
            policyId: policy?.policy_id,
            error: evaluationError?.message,
          });
          await writePolicyRun(conn, {
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
          await writePolicyRun(conn, {
            eventId: event.eventId,
            policyId: policy.policy_id,
            runStatus: 'skipped',
            conditionResult,
            companyId: event.companyId,
          });
          continue;
        }

        matchedAny = true;
        await writePolicyRun(conn, {
          eventId: event.eventId,
          policyId: policy.policy_id,
          runStatus: 'matched',
          conditionResult,
          companyId: event.companyId,
        });

        try {
          const actionResult = await executePolicyActions({ event, policy, companyId: event.companyId, conn });
          await writePolicyRun(conn, {
            eventId: event.eventId,
            policyId: policy.policy_id,
            runStatus: 'completed',
            conditionResult,
            actionResult,
            companyId: event.companyId,
          });
        } catch (actionError) {
          await writePolicyRun(conn, {
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
      await conn.query(
        `UPDATE core_events SET status = ?, processed_at = NOW(), error_message = NULL, updated_at = NOW() WHERE event_id = ?`,
        [finalStatus, event.eventId],
      );
      summary.processed += 1;
      if (!matchedAny) summary.ignored += 1;
      summary.events.push({ eventId: event.eventId, status: finalStatus });
      await commitTx(conn);
    } catch (error) {
      await rollbackTx(conn);
      const nextRetryAt = computeRetryBackoff((row.retry_count || 0) + 1);
      await conn.query(
        `UPDATE core_events
         SET status='failed', retry_count = retry_count + 1, error_message = ?, next_retry_at = ?, updated_at = NOW()
         WHERE event_id = ?`,
        [error?.message || 'event_processing_failed', nextRetryAt, event.eventId],
      );
      if ((row.retry_count || 0) + 1 >= MAX_RETRIES) {
        await conn.query(
          `INSERT INTO core_event_dead_letters (event_id, company_id, failure_stage, error_message, event_snapshot_json, retry_count)
           VALUES (?, ?, 'event_processor', ?, ?, (SELECT retry_count FROM core_events WHERE event_id = ?))`,
          [event.eventId, event.companyId, error?.message || 'event_processing_failed', JSON.stringify(event), event.eventId],
        );
        console.error('Event moved to dead letter queue after repeated failures', {
          eventId: event.eventId,
          companyId: event.companyId,
          retryCount: (row.retry_count || 0) + 1,
          error: error?.message || 'event_processing_failed',
        });
      } else {
        console.error('Event processing failed; scheduled retry', {
          eventId: event.eventId,
          companyId: event.companyId,
          retryCount: (row.retry_count || 0) + 1,
          nextRetryAt: nextRetryAt.toISOString(),
          error: error?.message || 'event_processing_failed',
        });
      }
      summary.failed += 1;
      summary.events.push({ eventId: event.eventId, status: 'failed', error: error?.message });
    }
  }

  return summary;
}
