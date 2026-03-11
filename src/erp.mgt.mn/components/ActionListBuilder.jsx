import React from 'react';

const ACTION_TYPES = ['create_transaction', 'notify', 'update_twin', 'call_procedure', 'enqueue_ai_review', 'reserve_budget', 'reserve_resource'];

const ACTION_TEMPLATES = {
  'Create Investigation Plan': { type: 'create_transaction', transactionType: 'investigation_plan', mapping: {} },
  'Notify Supervisor': { type: 'notify', mapping: {} },
  'Update Risk Twin': { type: 'update_twin', twin: 'risk_state', mapping: {} },
  'Block Transaction': { type: 'call_procedure', procedure: 'block_transaction', mapping: {} },
};

function mappingToRows(mapping = {}) {
  return Object.entries(mapping || {}).map(([target, source]) => ({ target, source }));
}

function rowsToMapping(rows = []) {
  const next = {};
  rows.forEach((row) => {
    if (row.target) next[row.target] = row.source || '';
  });
  return next;
}

export default function ActionListBuilder({ actionJson, transactionTypes = [], procedureNames = [], payloadFields = [], onChange, highlightedField, onFieldHighlight }) {
  const actions = Array.isArray(actionJson.actions) ? actionJson.actions : [];
  const mappingSources = ['source.recordId', 'system.now', ...payloadFields];

  const patchAction = (index, key, value) => {
    const next = [...actions];
    next[index] = { ...next[index], [key]: value };
    onChange({ actions: next });
  };

  return (
    <div>
      <h3>Action Builder</h3>
      {actions.map((action, idx) => (
        <div key={idx} className="action-box">
          <div style={{ marginBottom: 8 }}>
            <label>Template{' '}
              <select
                defaultValue=""
                onChange={(e) => {
                  const template = ACTION_TEMPLATES[e.target.value];
                  if (!template) return;
                  const next = [...actions];
                  next[idx] = { ...template };
                  onChange({ actions: next });
                }}
              >
                <option value="">Select template</option>
                {Object.keys(ACTION_TEMPLATES).map((name) => <option key={name} value={name}>{name}</option>)}
              </select>
            </label>
          </div>

          <select value={action.type || ''} onChange={(e) => patchAction(idx, 'type', e.target.value)}>
            <option value="">Select action</option>
            {ACTION_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
          </select>
          {action.type === 'create_transaction' ? (
            <label>Transaction Type
              <select value={action.transactionType || ''} onChange={(e) => patchAction(idx, 'transactionType', e.target.value)}>
                <option value="">Select transaction type</option>
                {transactionTypes.map((type) => <option key={type} value={type}>{type}</option>)}
              </select>
            </label>
          ) : null}
          {action.type === 'call_procedure' ? (
            <label>Procedure
              <select value={action.procedure || ''} onChange={(e) => patchAction(idx, 'procedure', e.target.value)}>
                <option value="">Select procedure</option>
                {procedureNames.map((name) => <option key={name} value={name}>{name}</option>)}
              </select>
            </label>
          ) : null}

          <div>
            <strong>Field Mapping</strong>
            {mappingToRows(action.mapping).map((row, mapIdx) => {
              const rows = mappingToRows(action.mapping);
              return (
                <div key={`${idx}-${mapIdx}`} className="row">
                  <input
                    placeholder="target field"
                    value={row.target}
                    onChange={(e) => {
                      const nextRows = [...rows];
                      nextRows[mapIdx] = { ...nextRows[mapIdx], target: e.target.value };
                      patchAction(idx, 'mapping', rowsToMapping(nextRows));
                    }}
                  />
                  <select
                    value={row.source || ''}
                    onFocus={() => onFieldHighlight?.(row.source || '')}
                    onChange={(e) => {
                      const nextRows = [...rows];
                      nextRows[mapIdx] = { ...nextRows[mapIdx], source: e.target.value };
                      patchAction(idx, 'mapping', rowsToMapping(nextRows));
                      onFieldHighlight?.(e.target.value);
                    }}
                  >
                    <option value="">Select source field</option>
                    {mappingSources.map((field) => <option key={field} value={field}>{field}</option>)}
                  </select>
                  {row.source && row.source === highlightedField ? <small style={{ color: '#1d4ed8' }}>selected in payload preview</small> : null}
                </div>
              );
            })}
            <button
              type="button"
              onClick={() => {
                const nextRows = [...mappingToRows(action.mapping), { target: '', source: highlightedField || '' }];
                patchAction(idx, 'mapping', rowsToMapping(nextRows));
              }}
            >
              Add Mapping Field
            </button>
          </div>
          <button type="button" onClick={() => onChange({ actions: actions.filter((_, actionIdx) => actionIdx !== idx) })}>Remove Action</button>
        </div>
      ))}
      <button type="button" onClick={() => onChange({ actions: [...actions, { type: '', mapping: {} }] })}>Add Action</button>
    </div>
  );
}
