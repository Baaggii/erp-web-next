export async function runAiPolicy({ policy = {}, event }) {
  const enabled = Boolean(policy?.enabled);
  if (!enabled) return { skipped: true, reason: 'ai_policy_disabled' };
  if (!process.env.OPENAI_API_KEY) return { skipped: true, reason: 'openai_not_configured' };

  const payload = event?.payload || {};
  const redactions = Array.isArray(policy?.redactPaths) ? policy.redactPaths : [];
  const redacted = JSON.parse(JSON.stringify(payload));
  for (const path of redactions) {
    const parts = String(path || '').split('.').filter(Boolean);
    let cursor = redacted;
    for (let i = 0; i < parts.length - 1; i += 1) {
      cursor = cursor?.[parts[i]];
      if (!cursor || typeof cursor !== 'object') break;
    }
    if (cursor && typeof cursor === 'object') cursor[parts.at(-1)] = '[REDACTED]';
  }

  return {
    skipped: true,
    reason: 'ai_overlay_placeholder',
    redactedPayload: redacted,
  };
}
