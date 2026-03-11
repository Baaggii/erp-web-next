const BLOCKED_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const SAFE_PATH_PATTERN = /^(payload|source|eventType|companyId|branchId|departmentId|workplaceId|actorEmpid|correlationId|causationId)(\.[A-Za-z0-9_]+)*$/;

function isSafePath(path) {
  if (typeof path !== 'string') return false;
  const trimmed = path.trim();
  if (!trimmed || !SAFE_PATH_PATTERN.test(trimmed)) return false;
  return !trimmed.split('.').some((segment) => BLOCKED_KEYS.has(segment));
}

export function resolvePolicyPath(event = {}, path) {
  if (!isSafePath(path)) return undefined;
  return path.split('.').reduce((acc, key) => (acc == null ? undefined : acc[key]), event);
}

export function evaluatePolicyRule(rule = {}, event = {}) {
  const field = String(rule.field || '').trim();
  const operator = String(rule.operator || '').trim();
  const expected = rule.value;

  const actual = resolvePolicyPath(event, field);
  let matched = false;

  switch (operator) {
    case '=': matched = actual === expected; break;
    case '!=': matched = actual !== expected; break;
    case '>': matched = Number(actual) > Number(expected); break;
    case '>=': matched = Number(actual) >= Number(expected); break;
    case '<': matched = Number(actual) < Number(expected); break;
    case '<=': matched = Number(actual) <= Number(expected); break;
    case 'in': matched = Array.isArray(expected) && expected.includes(actual); break;
    case 'not_in': matched = Array.isArray(expected) && !expected.includes(actual); break;
    case 'contains': {
      if (Array.isArray(actual)) matched = actual.includes(expected);
      else if (typeof actual === 'string') matched = actual.includes(String(expected ?? ''));
      break;
    }
    case 'exists': matched = actual !== undefined && actual !== null; break;
    case 'not_exists': matched = actual === undefined || actual === null; break;
    default: matched = false;
  }

  return { matched, field, operator, expected, actual };
}
