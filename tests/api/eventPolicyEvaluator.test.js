import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateConditionTree } from '../../api-server/services/eventPolicyEvaluator.js';

test('event policy evaluator matches nested rules', () => {
  const condition = {
    logic: 'and',
    rules: [
      { field: 'payload.shortageQty', operator: '>', value: 10 },
      {
        logic: 'or',
        rules: [
          { field: 'payload.severity', operator: '=', value: 'high' },
          { field: 'payload.severity', operator: '=', value: 'critical' },
        ],
      },
    ],
  };
  const result = evaluateConditionTree(condition, { payload: { shortageQty: 18, severity: 'high' } });
  assert.equal(result.matched, true);
});

test('event policy evaluator reports non-match', () => {
  const condition = { logic: 'and', rules: [{ field: 'payload.value', operator: 'exists' }, { field: 'payload.value', operator: '<', value: 1 }] };
  const result = evaluateConditionTree(condition, { payload: { value: 3 } });
  assert.equal(result.matched, false);
});
