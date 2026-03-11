import React, { useMemo, useState } from 'react';

const NODE_TYPES = [
  { type: 'trigger', label: 'Event Trigger', help: 'Starts the flow for an event type.' },
  { type: 'condition', label: 'Condition', help: 'Checks an expression and branches true/false.' },
  { type: 'action', label: 'Action', help: 'Performs work such as notify or update twin.' },
  { type: 'delay', label: 'Delay/Timer', help: 'Waits before continuing to the next node.' },
  { type: 'merge', label: 'Merge', help: 'Converges multiple branches.' },
];

function makeNode(type) {
  const id = `node_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  const defaults = {
    trigger: { eventType: '' },
    condition: { expression: { logic: 'and', rules: [] }, branches: { true: '', false: '' } },
    action: { type: 'notify', message: '' },
    delay: { duration: '2 days' },
    merge: {},
  };
  return { id, type, properties: defaults[type] || {}, nextIds: [] };
}

export default function GraphEditor({ graphJson, eventType, onChange, transactionTypes = [], procedureNames = [] }) {
  const nodes = useMemo(() => (Array.isArray(graphJson?.nodes) ? graphJson.nodes : []), [graphJson]);
  const [selectedNodeId, setSelectedNodeId] = useState(nodes[0]?.id || '');
  const [zoom, setZoom] = useState(1);

  const selectedNode = nodes.find((node) => node.id === selectedNodeId) || null;

  const validationErrors = useMemo(() => {
    const errors = [];
    if (!nodes.some((node) => node.type === 'trigger')) errors.push('Graph must include a trigger node.');
    if (!nodes.some((node) => node.type === 'action')) errors.push('Graph must include at least one action node.');
    nodes.forEach((node) => {
      if ((node.nextIds || []).some((id) => !nodes.find((entry) => entry.id === id))) {
        errors.push(`Node ${node.id} has invalid connections.`);
      }
    });
    return errors;
  }, [nodes]);

  const updateNode = (nodeId, updater) => {
    const next = nodes.map((node) => (node.id === nodeId ? updater(node) : node));
    onChange({ version: 1, nodes: next });
  };

  const addNode = (type) => {
    const nextNode = makeNode(type);
    onChange({ version: 1, nodes: [...nodes, nextNode] });
    setSelectedNodeId(nextNode.id);
  };

  const removeSelected = () => {
    if (!selectedNodeId) return;
    const next = nodes
      .filter((node) => node.id !== selectedNodeId)
      .map((node) => ({ ...node, nextIds: (node.nextIds || []).filter((id) => id !== selectedNodeId) }));
    onChange({ version: 1, nodes: next });
    setSelectedNodeId(next[0]?.id || '');
  };

  const cloneSelected = () => {
    if (!selectedNode) return;
    const clone = { ...selectedNode, id: `${selectedNode.id}_copy_${Math.floor(Math.random() * 1000)}`, nextIds: [] };
    onChange({ version: 1, nodes: [...nodes, clone] });
  };

  return (
    <div style={{ border: '1px solid #d1d5db', borderRadius: 8, padding: 12 }}>
      <h3 style={{ marginTop: 0 }}>Visual Workflow Editor</h3>
      <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr 320px', gap: 12 }}>
        <div aria-label="Node palette">
          <strong>Palette</strong>
          {NODE_TYPES.map((entry) => (
            <button
              key={entry.type}
              type="button"
              title={entry.help}
              style={{ display: 'block', width: '100%', marginTop: 8 }}
              onClick={() => addNode(entry.type)}
            >
              + {entry.label}
            </button>
          ))}
          <div style={{ marginTop: 12, fontSize: 12, color: '#4b5563' }}>
            Shortcuts: Del=delete, Ctrl/Cmd+C=copy selected node.
          </div>
        </div>

        <div
          role="listbox"
          tabIndex={0}
          aria-label="Workflow canvas"
          onKeyDown={(e) => {
            if (e.key === 'Delete') removeSelected();
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') cloneSelected();
          }}
          style={{ border: '1px dashed #9ca3af', borderRadius: 8, padding: 12, minHeight: 260, overflow: 'auto' }}
        >
          <div style={{ marginBottom: 8 }}>
            <button type="button" onClick={() => setZoom((z) => Math.max(0.5, Number((z - 0.1).toFixed(1))))}>-</button>
            <span style={{ margin: '0 8px' }}>Zoom: {Math.round(zoom * 100)}%</span>
            <button type="button" onClick={() => setZoom((z) => Math.min(2, Number((z + 0.1).toFixed(1))))}>+</button>
          </div>
          <div style={{ transform: `scale(${zoom})`, transformOrigin: 'top left' }}>
            {nodes.map((node) => (
              <button
                key={node.id}
                type="button"
                title={`Node ${node.type}`}
                onClick={() => setSelectedNodeId(node.id)}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  marginBottom: 8,
                  padding: 8,
                  borderRadius: 6,
                  border: node.id === selectedNodeId ? '2px solid #2563eb' : '1px solid #cbd5e1',
                  background: '#fff',
                }}
              >
                <div><strong>{node.type}</strong> <code>{node.id}</code></div>
                <div style={{ fontSize: 12, color: '#475569' }}>next: {(node.nextIds || []).join(', ') || 'none'}</div>
              </button>
            ))}
          </div>
        </div>

        <div>
          <strong>Properties</strong>
          {!selectedNode ? <div style={{ color: '#6b7280' }}>Select a node.</div> : (
            <div>
              <div style={{ marginTop: 8 }}>Type: <code>{selectedNode.type}</code></div>
              {selectedNode.type === 'trigger' ? (
                <label style={{ display: 'block', marginTop: 8 }}>
                  Event Type
                  <input
                    value={selectedNode.properties?.eventType ?? eventType ?? ''}
                    onChange={(e) => updateNode(selectedNode.id, (node) => ({ ...node, properties: { ...node.properties, eventType: e.target.value } }))}
                  />
                </label>
              ) : null}
              {selectedNode.type === 'condition' ? (
                <label style={{ display: 'block', marginTop: 8 }}>
                  Expression JSON
                  <textarea
                    rows={4}
                    value={JSON.stringify(selectedNode.properties?.expression || { logic: 'and', rules: [] }, null, 2)}
                    onChange={(e) => {
                      try {
                        const expression = JSON.parse(e.target.value || '{}');
                        updateNode(selectedNode.id, (node) => ({ ...node, properties: { ...node.properties, expression } }));
                      } catch {}
                    }}
                  />
                </label>
              ) : null}
              {selectedNode.type === 'action' ? (
                <>
                  <label style={{ display: 'block', marginTop: 8 }}>
                    Action Type
                    <select value={selectedNode.properties?.type || 'notify'} onChange={(e) => updateNode(selectedNode.id, (node) => ({ ...node, properties: { ...node.properties, type: e.target.value } }))}>
                      <option value="notify">notify</option>
                      <option value="transaction">transaction</option>
                      <option value="update_twin">update twin</option>
                      <option value="call_procedure">call procedure</option>
                      <option value="enqueue_ai_review">enqueue AI review</option>
                    </select>
                  </label>
                  <label style={{ display: 'block', marginTop: 8 }}>
                    Transaction Type
                    <input list="transaction-types" value={selectedNode.properties?.transactionType || ''} onChange={(e) => updateNode(selectedNode.id, (node) => ({ ...node, properties: { ...node.properties, transactionType: e.target.value } }))} />
                    <datalist id="transaction-types">{transactionTypes.map((name) => <option key={name} value={name} />)}</datalist>
                  </label>
                  <label style={{ display: 'block', marginTop: 8 }}>
                    Procedure
                    <input list="procedure-names" value={selectedNode.properties?.procedure || ''} onChange={(e) => updateNode(selectedNode.id, (node) => ({ ...node, properties: { ...node.properties, procedure: e.target.value } }))} />
                    <datalist id="procedure-names">{procedureNames.map((name) => <option key={name} value={name} />)}</datalist>
                  </label>
                </>
              ) : null}
              {selectedNode.type === 'delay' ? (
                <label style={{ display: 'block', marginTop: 8 }}>
                  Duration
                  <input value={selectedNode.properties?.duration || ''} onChange={(e) => updateNode(selectedNode.id, (node) => ({ ...node, properties: { ...node.properties, duration: e.target.value } }))} />
                </label>
              ) : null}
              <label style={{ display: 'block', marginTop: 8 }}>
                Next Node IDs (comma separated)
                <input
                  value={(selectedNode.nextIds || []).join(',')}
                  onChange={(e) => updateNode(selectedNode.id, (node) => ({ ...node, nextIds: e.target.value.split(',').map((id) => id.trim()).filter(Boolean) }))}
                />
              </label>
              <button type="button" onClick={removeSelected} style={{ marginTop: 8 }}>Delete node</button>
            </div>
          )}
        </div>
      </div>

      {validationErrors.length > 0 ? (
        <div style={{ color: '#b45309', marginTop: 10 }}>
          <strong>Graph validation:</strong>
          <ul>{validationErrors.map((msg) => <li key={msg}>{msg}</li>)}</ul>
        </div>
      ) : <div style={{ color: '#166534', marginTop: 10 }}>Graph validation passed.</div>}

      <details style={{ marginTop: 8 }}>
        <summary>Preview JSON</summary>
        <pre>{JSON.stringify({ version: 1, nodes }, null, 2)}</pre>
      </details>
    </div>
  );
}
