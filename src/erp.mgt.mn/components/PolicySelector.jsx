import React from 'react';

export default function PolicySelector({ policies = [], selectedPolicyId = '', onSelectPolicy, onLoadPolicy, loading = false, currentPolicy }) {
  return (
    <div style={{ marginBottom: 16, border: '1px solid #e5e7eb', borderRadius: 8, padding: 12 }}>
      <h3 style={{ marginTop: 0 }}>Existing Policies</h3>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
        <label style={{ minWidth: 280 }}>
          Select Policy
          <select value={selectedPolicyId} onChange={(e) => onSelectPolicy(e.target.value)} style={{ display: 'block', width: '100%' }}>
            <option value="">-- Select Policy --</option>
            {policies.map((policy) => (
              <option key={policy.policy_id} value={policy.policy_id}>
                {policy.policy_name} ({policy.policy_key})
              </option>
            ))}
          </select>
        </label>
        <button type="button" onClick={onLoadPolicy} disabled={!selectedPolicyId || loading}>
          {loading ? 'Loading...' : 'Load Policy'}
        </button>
      </div>

      {currentPolicy ? (
        <div className="grid grid-2">
          <div><strong>Policy Name:</strong> {currentPolicy.policy_name}</div>
          <div><strong>Event Type:</strong> {currentPolicy.event_type || '-'}</div>
          <div><strong>Module:</strong> {currentPolicy.module_key || '-'}</div>
          <div><strong>Priority:</strong> {currentPolicy.priority}</div>
          <div><strong>Status:</strong> {currentPolicy.is_active ? 'Enabled' : 'Disabled'}</div>
          <div><strong>Policy key:</strong> {currentPolicy.policy_key || '-'}</div>
        </div>
      ) : null}
    </div>
  );
}
