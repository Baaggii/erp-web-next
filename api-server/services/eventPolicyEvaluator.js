import { evaluatePolicyRule } from './policyExpressionEngine.js';

const SUPPORTED_LOGIC = new Set(['and', 'or']);
const SUPPORTED_OPERATORS = new Set([
  '=', '!=', '>', '>=', '<', '<=', 'in', 'not_in', 'contains', 'exists', 'not_exists',
]);

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function evaluateRule(rule, event) {
  if (!rule || typeof rule !== 'object') {
    return { matched: false, reason: 'invalid_rule' };
  }
  if (Array.isArray(rule.rules)) {
    return evaluateConditionTree(rule, event);
  }
  const operator = String(rule.operator || '').trim();
  if (!SUPPORTED_OPERATORS.has(operator)) {
    return { matched: false, reason: 'invalid_expression', field: rule?.field, operator };
  }
  return evaluatePolicyRule(rule, event);
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
  const graph = policy.graph_json ?? policy.graphJson;
  const errors = [];

  if (graph && typeof graph === 'object') {
    const nodes = asArray(graph.nodes);
    if (!nodes.length) errors.push('graph_json.nodes must contain at least one node');
    const hasTrigger = nodes.some((node) => node?.type === 'trigger');
    const hasAction = nodes.some((node) => node?.type === 'action');
    if (!hasTrigger) errors.push('graph_json must include a trigger node');
    if (!hasAction) errors.push('graph_json must include at least one action node');
  } else {
    if (!condition || typeof condition !== 'object') errors.push('condition_json must be an object');
    if (!action || typeof action !== 'object') errors.push('action_json must be an object');

    const actions = asArray(action?.actions);
    if (!actions.length) errors.push('action_json.actions must contain at least one action');
  }

  return { ok: errors.length === 0, errors };
}

export const EVENT_POLICY_OPERATORS = Array.from(SUPPORTED_OPERATORS);
