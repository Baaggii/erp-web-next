export function convertLegacyPolicyToGraph({ eventType, conditionJson, actionJson }) {
  const actions = Array.isArray(actionJson?.actions) ? actionJson.actions : [];
  const nodes = [
    { id: 'node_trigger', type: 'trigger', properties: { eventType: eventType || '' }, nextIds: ['node_condition'] },
    { id: 'node_condition', type: 'condition', properties: { expression: conditionJson || { logic: 'and', rules: [] } }, nextIds: [] },
  ];

  let prev = 'node_condition';
  actions.forEach((action, index) => {
    const id = `node_action_${index + 1}`;
    nodes.push({ id, type: 'action', properties: { ...action }, nextIds: [] });
    const prevNode = nodes.find((node) => node.id === prev);
    prevNode.nextIds = [id];
    prev = id;
  });

  return { version: 1, nodes };
}
