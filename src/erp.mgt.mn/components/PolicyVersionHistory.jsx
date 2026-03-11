import React from 'react';

export default function PolicyVersionHistory({ versions }) {
  return (
    <div>
      <h3>Policy Version History</h3>
      <ul>
        {versions.map((v) => (
          <li key={v.version_id}>v{v.version_number} · {v.created_by || 'unknown'} · {new Date(v.created_at).toLocaleString()}</li>
        ))}
      </ul>
    </div>
  );
}
