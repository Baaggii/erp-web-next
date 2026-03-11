const SUPPORTED_LOGIC = new Set(['and', 'or']);
const SUPPORTED_OPERATORS = new Set([
  '=', '!=', '>', '>=', '<', '<=', 'in', 'not_in', 'contains', 'exists', 'not_exists', 'starts_with', 'ends_with',
]);

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function getPathValue(source, path) {
  if (!path || typeof path !== 'string') return undefined;
  return path.split('.').reduce((acc, segment) => {
    if (acc == null) return undefined;
    return acc[segment];
  }, source);
}

function compare(operator, actual, expected) {
  switch (operator) {
    case '=': return actual === expected;
    case '!=': return actual !== expected;
    case '>': return Number(actual) > Number(expected);
    case '>=': return Number(actual) >= Number(expected);
    case '<': return Number(actual) < Number(expected);
    case '<=': return Number(actual) <= Number(expected);
    case 'in': return Array.isArray(expected) ? expected.includes(actual) : false;
    case 'not_in': return Array.isArray(expected) ? !expected.includes(actual) : false;
    case 'contains': {
      if (Array.isArray(actual)) return actual.includes(expected);
      if (typeof actual === 'string') return actual.includes(String(expected ?? ''));
      return false;
    }
    case 'exists': return actual !== undefined && actual !== null;
    case 'not_exists': return actual === undefined || actual === null;
    case 'starts_with': return typeof actual === 'string' && actual.startsWith(String(expected ?? ''));
    case 'ends_with': return typeof actual === 'string' && actual.endsWith(String(expected ?? ''));
    default: return false;
  }
}

function evaluateRule(rule, event) {
  if (!rule || typeof rule !== 'object') {
    return { matched: false, reason: 'invalid_rule' };
  }
  if (Array.isArray(rule.rules)) {
    return evaluateConditionTree(rule, event);
  }
  const field = String(rule.field || '').trim();
  const operator = String(rule.operator || '').trim();
  if (!field || !SUPPORTED_OPERATORS.has(operator)) {
    return { matched: false, reason: 'invalid_expression', field, operator };
  }
  const actual = getPathValue(event, field);
  const matched = compare(operator, actual, rule.value);
  return { matched, field, operator, expected: rule.value, actual };
}

export function evaluateConditionTree(condition, event = {}) {
  if (!condition || typeof condition !== 'object') {
    return { matched: true, evaluations: [], reason: 'empty_condition' };
  }
  const logic = String(condition.logic || 'and').toLowerCase();
  if (!SUPPORTED_LOGIC.has(logic)) {
    return { matched: false, evaluations: [], reason: `unsupported_logic:${logic}` };
  }
  const rules = asArray(condition.rules);
  const evaluations = rules.map((rule) => evaluateRule(rule, event));
  const matched = logic === 'and'
    ? evaluations.every((entry) => entry.matched)
    : evaluations.some((entry) => entry.matched);
  return { matched, logic, evaluations };
}

export function validateEventPolicySchema(policy = {}) {
  const condition = policy.condition_json ?? policy.conditionJson;
  const action = policy.action_json ?? policy.actionJson;
  const errors = [];

  if (!condition || typeof condition !== 'object') {
    errors.push('condition_json must be an object');
  }
  if (!action || typeof action !== 'object') {
    errors.push('action_json must be an object');
  }
  const actions = asArray(action?.actions);
  if (!actions.length) {
    errors.push('action_json.actions must contain at least one action');
  }

  return {
    ok: errors.length === 0,
    errors,
  };
}

export const EVENT_POLICY_OPERATORS = Array.from(SUPPORTED_OPERATORS);
