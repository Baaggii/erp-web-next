import React, { useMemo, useState } from 'react';

const NODE_TYPES = ['trigger', 'condition', 'action', 'timer', 'subflow'];
const ACTION_TYPES = ['create_transaction', 'notify', 'update_twin', 'call_procedure', 'enqueue_ai_review'];

function makeNode(type) {
  const id = `${type}_${Math.random().toString(36).slice(2, 9)}`;
  return { id, type, label: `${type.toUpperCase()} node`, config: {} };
}

function convertGraphToPolicy(graph) {
  const conditions = graph.nodes.filter((n) => n.type === 'condition');
  const actions = graph.nodes.filter((n) => n.type === 'action').map((node) => ({
    type: node.config.actionType || 'notify',
    ...(node.config.transactionType ? { transactionType: node.config.transactionType } : {}),
    ...(node.config.message ? { message: node.config.message } : {}),
    ...(node.config.twin ? { twin: node.config.twin } : {}),
    ...(node.config.mapping ? { mapping: node.config.mapping } : {}),
  }));

  return {
    condition_json: {
      logic: 'and',
      rules: conditions
        .filter((node) => node.config.field && node.config.operator)
        .map((node) => ({ field: node.config.field, operator: node.config.operator, value: node.config.value ?? '' })),
    },
    action_json: {
      actions,
      workflow_graph: graph,
    },
  };
}

function validateGraph(graph, payloadFields) {
  const problems = [];
  const hasTrigger = graph.nodes.some((n) => n.type === 'trigger');
  if (!hasTrigger) problems.push('Add at least one trigger node.');

  const outgoing = new Map();
  graph.edges.forEach((e) => outgoing.set(e.from, (outgoing.get(e.from) || 0) + 1));
  const terminalNodes = graph.nodes.filter((n) => !outgoing.get(n.id));
  if (terminalNodes.some((n) => !['action', 'subflow'].includes(n.type))) {
    problems.push('Each branch must end in an action or reusable subflow node.');
  }

  const fieldSet = new Set(payloadFields);
  graph.nodes.filter((n) => n.type === 'condition').forEach((node) => {
    if (node.config.field && !fieldSet.has(node.config.field)) {
      problems.push(`Condition field ${node.config.field} is not in discovered payload fields.`);
    }
  });

  return problems;
}

export default function WorkflowGraphEditor({ payloadFields = [], onPolicyJsonChange }) {
  const [graph, setGraph] = useState({ nodes: [], edges: [] });
  const [edgeDraft, setEdgeDraft] = useState({ from: '', to: '', label: '' });

  const validation = useMemo(() => validateGraph(graph, payloadFields), [graph, payloadFields]);

  const updateGraph = (next) => {
    setGraph(next);
    const converted = convertGraphToPolicy(next);
    onPolicyJsonChange(converted);
  };

  return (
    <div style={{ border: '1px solid #d1d5db', borderRadius: 8, padding: 12, marginBottom: 16 }}>
      <h3 style={{ marginTop: 0 }}>Workflow Graph Canvas</h3>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        {NODE_TYPES.map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => updateGraph({ ...graph, nodes: [...graph.nodes, makeNode(type)] })}
          >
            + {type}
          </button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          {graph.nodes.map((node) => (
            <div key={node.id} style={{ border: '1px solid #e5e7eb', padding: 8, borderRadius: 6, marginBottom: 8 }}>
              <div><strong>{node.type}</strong> <code>{node.id}</code></div>
              {node.type === 'condition' ? (
                <>
                  <input placeholder="field" value={node.config.field || ''} onChange={(e) => updateGraph({ ...graph, nodes: graph.nodes.map((n) => n.id === node.id ? { ...n, config: { ...n.config, field: e.target.value } } : n) })} />
                  <input placeholder="operator" value={node.config.operator || '='} onChange={(e) => updateGraph({ ...graph, nodes: graph.nodes.map((n) => n.id === node.id ? { ...n, config: { ...n.config, operator: e.target.value } } : n) })} />
                  <input placeholder="value" value={node.config.value || ''} onChange={(e) => updateGraph({ ...graph, nodes: graph.nodes.map((n) => n.id === node.id ? { ...n, config: { ...n.config, value: e.target.value } } : n) })} />
                </>
              ) : null}
              {node.type === 'action' ? (
                <>
                  <select value={node.config.actionType || 'notify'} onChange={(e) => updateGraph({ ...graph, nodes: graph.nodes.map((n) => n.id === node.id ? { ...n, config: { ...n.config, actionType: e.target.value } } : n) })}>
                    {ACTION_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
                  </select>
                  <input placeholder="message / transactionType / twin" value={node.config.message || ''} onChange={(e) => updateGraph({ ...graph, nodes: graph.nodes.map((n) => n.id === node.id ? { ...n, config: { ...n.config, message: e.target.value } } : n) })} />
                </>
              ) : null}
            </div>
          ))}
        </div>
        <div>
          <div style={{ border: '1px dashed #cbd5e1', borderRadius: 6, padding: 8, marginBottom: 8 }}>
            <div><strong>Connect nodes</strong></div>
            <select value={edgeDraft.from} onChange={(e) => setEdgeDraft((p) => ({ ...p, from: e.target.value }))}>
              <option value="">from</option>
              {graph.nodes.map((n) => <option key={n.id} value={n.id}>{n.id}</option>)}
            </select>
            <select value={edgeDraft.to} onChange={(e) => setEdgeDraft((p) => ({ ...p, to: e.target.value }))}>
              <option value="">to</option>
              {graph.nodes.map((n) => <option key={n.id} value={n.id}>{n.id}</option>)}
            </select>
            <input placeholder="label (optional)" value={edgeDraft.label} onChange={(e) => setEdgeDraft((p) => ({ ...p, label: e.target.value }))} />
            <button type="button" onClick={() => {
              if (!edgeDraft.from || !edgeDraft.to) return;
              updateGraph({ ...graph, edges: [...graph.edges, edgeDraft] });
              setEdgeDraft({ from: '', to: '', label: '' });
            }}>Add edge</button>
          </div>
          <pre style={{ maxHeight: 180, overflow: 'auto' }}>{JSON.stringify(graph.edges, null, 2)}</pre>
          {validation.length ? <ul style={{ color: '#b45309' }}>{validation.map((v) => <li key={v}>{v}</li>)}</ul> : <div style={{ color: '#166534' }}>Graph validation passed.</div>}
        </div>
      </div>
    </div>
  );
}
