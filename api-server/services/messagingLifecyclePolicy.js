import crypto from 'node:crypto';

export const MESSAGE_CLASSES = Object.freeze(['general', 'financial', 'hr_sensitive', 'legal']);
export const HOLD_SCOPES = Object.freeze(['user', 'conversation', 'linked_entity', 'company']);

const DEFAULT_RETENTION_DAYS = Object.freeze({
  general: 365,
  financial: 2555,
  hr_sensitive: 2555,
  legal: 3650,
});

function normalizeDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isHoldActive(hold, now = new Date()) {
  const startsAt = normalizeDate(hold?.startsAt) || new Date(0);
  const endsAt = normalizeDate(hold?.endsAt);
  if (hold?.status !== 'active') return false;
  if (startsAt > now) return false;
  if (endsAt && endsAt <= now) return false;
  return true;
}

function holdMatchesMessage(hold, message) {
  if (!hold || !message) return false;
  switch (hold.scope) {
    case 'company':
      return Number(hold.companyId) === Number(message.companyId);
    case 'user':
      return String(hold.targetUserEmpid) === String(message.authorEmpid);
    case 'conversation':
      return String(hold.conversationId) === String(message.conversationId);
    case 'linked_entity':
      return (
        String(hold.linkedEntityType) === String(message.linkedEntityType) &&
        String(hold.linkedEntityId) === String(message.linkedEntityId)
      );
    default:
      return false;
  }
}

export function resolveRetentionDays({ className, companyPolicy = {}, defaultPolicy = DEFAULT_RETENTION_DAYS }) {
  if (!MESSAGE_CLASSES.includes(className)) {
    throw new Error(`Unsupported message class: ${className}`);
  }
  const explicit = Number(companyPolicy[className]);
  if (Number.isFinite(explicit) && explicit >= 1) return explicit;
  return defaultPolicy[className];
}

export function evaluateMessageLifecycle({ message, companyPolicy = {}, legalHolds = [], asOf = new Date() }) {
  const createdAt = normalizeDate(message?.createdAt);
  if (!createdAt) throw new Error('message.createdAt is required');
  const messageClass = message?.messageClass || 'general';
  const retentionDays = resolveRetentionDays({ className: messageClass, companyPolicy });
  const retentionDeadline = new Date(createdAt.getTime() + retentionDays * 24 * 60 * 60 * 1000);

  const matchingHold = legalHolds.find((hold) => isHoldActive(hold, asOf) && holdMatchesMessage(hold, message));

  if (matchingHold) {
    return {
      status: 'blocked_by_legal_hold',
      purgeEligible: false,
      messageClass,
      retentionDays,
      retentionDeadline,
      holdId: matchingHold.id,
      reason: `Legal hold ${matchingHold.id} (${matchingHold.scope}) blocks purge`,
    };
  }

  const expired = retentionDeadline <= asOf;
  return {
    status: expired ? 'eligible_for_purge' : 'retained',
    purgeEligible: expired,
    messageClass,
    retentionDays,
    retentionDeadline,
    holdId: null,
    reason: expired ? 'Retention deadline reached' : 'Retention window still active',
  };
}

export function buildPurgePlan({ companyId, messages = [], companyPolicy = {}, legalHolds = [], asOf = new Date() }) {
  const candidates = [];
  const skipped = [];

  for (const message of messages) {
    if (Number(message.companyId) !== Number(companyId)) {
      skipped.push({ messageId: message.id, reason: 'different_company' });
      continue;
    }
    const decision = evaluateMessageLifecycle({ message, companyPolicy, legalHolds, asOf });
    if (decision.purgeEligible) {
      candidates.push({ messageId: message.id, decision });
    } else {
      skipped.push({ messageId: message.id, reason: decision.status, holdId: decision.holdId });
    }
  }

  return {
    companyId,
    asOf: asOf.toISOString(),
    summary: {
      inspected: messages.length,
      candidateCount: candidates.length,
      skippedCount: skipped.length,
    },
    candidates,
    skipped,
  };
}

export function applyPurgePlan({ purgePlan, dryRun = true, approvals = [], requiredApprovals = 1 }) {
  const uniqueApprovers = Array.from(new Set(approvals.filter(Boolean).map((v) => String(v))));
  if (!dryRun && uniqueApprovers.length < requiredApprovals) {
    throw new Error(`Approval gate not met: need ${requiredApprovals}, got ${uniqueApprovers.length}`);
  }

  const now = new Date().toISOString();
  const actions = purgePlan.candidates.map((candidate) => ({
    messageId: candidate.messageId,
    action: dryRun ? 'would_delete' : 'delete',
    actedAt: now,
  }));

  return {
    companyId: purgePlan.companyId,
    dryRun,
    approvalGateSatisfied: dryRun ? null : uniqueApprovers.length >= requiredApprovals,
    approvals: uniqueApprovers,
    actions,
  };
}

export function buildChainOfCustodyRecord({ purgeRunId, companyId, messageId, previousHash = '' }) {
  const payload = `${purgeRunId}|${companyId}|${messageId}|${previousHash}`;
  const recordHash = crypto.createHash('sha256').update(payload).digest('hex');
  return {
    purgeRunId,
    companyId,
    messageId,
    previousHash,
    recordHash,
  };
}

export function buildDeletionCertificate({ companyId, purgeRunId, actionCount, chainTailHash, generatedBy }) {
  const issuedAt = new Date().toISOString();
  const certificateBody = JSON.stringify({
    companyId,
    purgeRunId,
    actionCount,
    chainTailHash,
    generatedBy,
    issuedAt,
  });
  const certificateDigest = crypto.createHash('sha256').update(certificateBody).digest('hex');
  return {
    companyId,
    purgeRunId,
    actionCount,
    chainTailHash,
    generatedBy,
    issuedAt,
    certificateDigest,
  };
}
