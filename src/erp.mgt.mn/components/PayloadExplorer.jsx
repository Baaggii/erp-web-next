import React from 'react';

export default function PayloadExplorer({ fields = [], onSelectField, onStartDrag }) {
  return (
    <div style={{ marginBottom: 16, border: '1px solid #e5e7eb', borderRadius: 8, padding: 12 }}>
      <h3 style={{ marginTop: 0 }}>Event Payload Fields</h3>
      {fields.length === 0 ? (
        <div style={{ color: '#6b7280' }}>No payload fields discovered for this event type yet.</div>
      ) : (
        <ul style={{ margin: 0, paddingLeft: 20 }}>
          {fields.map((field) => (
            <li key={field.path} style={{ marginBottom: 4 }}>
              <button
                type="button"
                draggable
                onDragStart={(event) => {
                  event.dataTransfer.setData('text/plain', field.path);
                  onStartDrag?.(field.path);
                }}
                onClick={() => onSelectField?.(field.path)}
                style={{ border: 'none', background: 'transparent', color: '#2563eb', cursor: 'pointer', padding: 0 }}
              >
                {field.path}
              </button>
              <span style={{ marginLeft: 8, color: '#6b7280', fontSize: 12 }}>{field.type}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
