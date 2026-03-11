import React from 'react';

const ACTION_TYPES = ['create_transaction', 'notify', 'update_twin', 'call_procedure', 'enqueue_ai_review', 'reserve_budget', 'reserve_resource'];

export default function ActionListBuilder({ actionJson, onChange }) {
  const actions = Array.isArray(actionJson.actions) ? actionJson.actions : [];
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
          <select value={action.type || ''} onChange={(e) => patchAction(idx, 'type', e.target.value)}>
            <option value="">Select action</option>
            {ACTION_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
          </select>
          <input placeholder="transactionType / twin / procedure" value={action.transactionType || action.twin || action.procedure || ''}
            onChange={(e) => {
              const value = e.target.value;
              if (action.type === 'create_transaction') patchAction(idx, 'transactionType', value);
              else if (action.type === 'update_twin') patchAction(idx, 'twin', value);
              else if (action.type === 'call_procedure') patchAction(idx, 'procedure', value);
            }} />
          <textarea placeholder='Mapping JSON, e.g. {"linked_record_id":"source.recordId"}' value={JSON.stringify(action.mapping || {}, null, 0)}
            onChange={(e) => {
              try { patchAction(idx, 'mapping', JSON.parse(e.target.value || '{}')); } catch {}
            }} />
        </div>
      ))}
      <button type="button" onClick={() => onChange({ actions: [...actions, { type: '', mapping: {} }] })}>Add Action</button>
    </div>
  );
}
