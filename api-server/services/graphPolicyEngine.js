import { evaluateConditionTree } from './eventPolicyEvaluator.js';

function parseJson(value, fallback = null) {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function createNodeIndex(graph = {}) {
  const nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  return { nodes, nodeMap };
}

function pickTriggerNode(nodes = []) {
  return nodes.find((node) => node?.type === 'trigger') || nodes[0] || null;
}

function nextForCondition(node, evaluation) {
  const branches = node?.properties?.branches;
  if (!branches || typeof branches !== 'object') return Array.isArray(node?.nextIds) ? node.nextIds : [];
  const key = evaluation?.matched ? 'true' : 'false';
  const candidate = branches[key];
  if (typeof candidate === 'string' && candidate) return [candidate];
  if (Array.isArray(candidate)) return candidate.filter(Boolean);
  return Array.isArray(node?.nextIds) ? node.nextIds : [];
}

export function evaluateGraphPolicy({ graphJson, event = {} }) {
  const graph = parseJson(graphJson, { nodes: [] }) || { nodes: [] };
  const { nodes, nodeMap } = createNodeIndex(graph);
  const trigger = pickTriggerNode(nodes);
  if (!trigger) {
    return {
      matched: false,
      executionPath: [],
      actions: [],
      delays: [],
      evaluations: [],
      reason: 'missing_trigger',
    };
  }

  const queue = [trigger.id];
  const visited = new Set();
  const executionPath = [];
  const actions = [];
  const delays = [];
  const evaluations = [];

  while (queue.length) {
    const nodeId = queue.shift();
    if (!nodeId || visited.has(nodeId)) continue;
    visited.add(nodeId);
    const node = nodeMap.get(nodeId);
    if (!node) continue;

    executionPath.push(node.id);
    if (node.type === 'condition') {
      const expression = node?.properties?.expression || { logic: 'and', rules: [] };
      const result = evaluateConditionTree(expression, event);
      evaluations.push({ nodeId: node.id, ...result });
      const nextIds = nextForCondition(node, result);
      queue.push(...nextIds);
      continue;
    }

    if (node.type === 'action') {
      actions.push({ nodeId: node.id, ...node.properties });
    }

    if (node.type === 'delay') {
      delays.push({ nodeId: node.id, ...node.properties });
    }

    const nextIds = Array.isArray(node.nextIds) ? node.nextIds : [];
    queue.push(...nextIds);
  }

  return {
    matched: actions.length > 0,
    executionPath,
    actions,
    delays,
    evaluations,
  };
}

export function convertLegacyPolicyToGraph({ eventType, conditionJson, actionJson }) {
  const actionNodes = Array.isArray(actionJson?.actions) ? actionJson.actions : [];
  const triggerId = 'node_trigger';
  const conditionId = 'node_condition';

  const nodes = [
    {
      id: triggerId,
      type: 'trigger',
      properties: { eventType: eventType || '' },
      nextIds: [conditionId],
    },
    {
      id: conditionId,
      type: 'condition',
      properties: { expression: conditionJson || { logic: 'and', rules: [] } },
      nextIds: [],
      branches: {},
    },
  ];

  let previousId = conditionId;
  actionNodes.forEach((action, index) => {
    const id = `node_action_${index + 1}`;
    nodes.push({
      id,
      type: 'action',
      properties: { ...action },
      nextIds: [],
    });
    const prevNode = nodes.find((node) => node.id === previousId);
    prevNode.nextIds = [id];
    previousId = id;
  });

  return { version: 1, nodes };
}

export function graphToLegacyJson(graphJson) {
  const evaluated = evaluateGraphPolicy({ graphJson, event: {} });
  const graph = parseJson(graphJson, { nodes: [] }) || { nodes: [] };
  const trigger = (graph.nodes || []).find((node) => node.type === 'trigger');
  const firstCondition = (graph.nodes || []).find((node) => node.type === 'condition');
  return {
    event_type: trigger?.properties?.eventType || '',
    condition_json: firstCondition?.properties?.expression || { logic: 'and', rules: [] },
    action_json: { actions: evaluated.actions.map((action) => ({ ...action, nodeId: undefined })) },
  };
}
