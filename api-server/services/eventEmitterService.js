import crypto from 'crypto';
import { pool } from '../../db/index.js';
import { tenantHasPolicies, tenantHasRecordedEvents } from './eventEngineFastCheck.js';

function parseBool(value) {
  if (value === undefined || value === null) return null;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on', 'enabled'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off', 'disabled'].includes(normalized)) return false;
  return null;
}

function isEventFastFallbackEnabled() {
  const envValue = parseBool(process.env.EVENT_FAST_FALLBACK_ENABLED);
  return envValue ?? true;
}

function uuid() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `corr-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeDate(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return new Date();
  return date;
}

export function toCanonicalEvent(input = {}) {
  const source = input.source || {};
  return {
    eventType: String(input.eventType || 'transaction.updated'),
    companyId: Number(input.companyId || 0),
    branchId: input.branchId ?? null,
    departmentId: input.departmentId ?? null,
    workplaceId: input.workplaceId ?? null,
    actorEmpid: input.actorEmpid ?? null,
    source: {
      transactionType: source.transactionType ?? null,
      table: source.table ?? null,
      recordId: source.recordId != null ? String(source.recordId) : null,
      action: source.action ?? null,
    },
    correlationId: input.correlationId || uuid(),
    causationId: input.causationId || null,
    occurredAt: normalizeDate(input.occurredAt),
    payload: input.payload && typeof input.payload === 'object' ? input.payload : {},
  };
}

export async function emitCanonicalEvent(eventInput, conn = pool) {
  const event = toCanonicalEvent(eventInput);
  if (!event.companyId) {
    throw new Error('companyId is required to emit event');
  }

  if (isEventFastFallbackEnabled()) {
    const hasPolicies = await tenantHasPolicies(event.companyId, conn);
    if (!hasPolicies) {
      await tenantHasRecordedEvents(event.companyId, conn);
      return null;
    }
  }

  const [result] = await conn.query(
    `INSERT INTO core_events (
      event_type, source_transaction_type, source_table, source_record_id, source_action,
      company_id, branch_id, department_id, workplace_id, actor_empid,
      correlation_id, causation_id, payload_json, status, occurred_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
    [
      event.eventType,
      event.source.transactionType,
      event.source.table,
      event.source.recordId,
      event.source.action,
      event.companyId,
      event.branchId,
      event.departmentId,
      event.workplaceId,
      event.actorEmpid,
      event.correlationId,
      event.causationId,
      JSON.stringify(event.payload || {}),
      event.occurredAt,
    ],
  );

  return { eventId: result.insertId, ...event };
}
