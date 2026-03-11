import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateGraphPolicy, convertLegacyPolicyToGraph, graphToLegacyJson } from '../../api-server/services/graphPolicyEngine.js';

test('graph serialization roundtrip from legacy', () => {
  const graph = convertLegacyPolicyToGraph({
    eventType: 'transaction.created',
    conditionJson: { logic: 'and', rules: [{ field: 'payload.amount', operator: '>', value: 100 }] },
    actionJson: { actions: [{ type: 'notify', message: 'high value' }] },
  });
  const legacy = graphToLegacyJson(graph);
  assert.equal(legacy.event_type, 'transaction.created');
  assert.equal(legacy.action_json.actions.length, 1);
});

test('graph simulation follows condition branches and delay nodes', () => {
  const graph = {
    nodes: [
      { id: 't', type: 'trigger', properties: { eventType: 'transaction.created' }, nextIds: ['c'] },
      { id: 'c', type: 'condition', properties: { expression: { logic: 'and', rules: [{ field: 'payload.amount', operator: '>', value: 10 }] }, branches: { true: 'd', false: 'a2' } }, nextIds: [] },
      { id: 'd', type: 'delay', properties: { duration: '2 days' }, nextIds: ['a1'] },
      { id: 'a1', type: 'action', properties: { type: 'notify' }, nextIds: [] },
      { id: 'a2', type: 'action', properties: { type: 'call_procedure' }, nextIds: [] },
    ],
  };

  const result = evaluateGraphPolicy({ graphJson: graph, event: { payload: { amount: 20 } } });
  assert.deepEqual(result.executionPath, ['t', 'c', 'd', 'a1']);
  assert.equal(result.delays[0].duration, '2 days');
  assert.equal(result.actions.length, 1);
});
