import React from 'react';

export default function RowDetailModal({ visible, onClose, row = {}, columns = [], relations = {}, references = [], translations = {} }) {
  if (!visible) return null;

  const overlay = {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.4)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  };

  const modal = {
    backgroundColor: '#fff',
    padding: '1rem',
    borderRadius: '4px',
    maxHeight: '90vh',
    overflowY: 'auto',
    minWidth: '300px',
  };

  const labelMap = {};
  Object.entries(relations).forEach(([col, opts]) => {
    labelMap[col] = {};
    opts.forEach((o) => {
      labelMap[col][o.value] = o.label;
    });
  });

  const cols = columns.length > 0 ? columns : Object.keys(row);

  return (
    <div style={overlay}>
      <div style={modal}>
        <h3 style={{ marginTop: 0 }}>Row Details</h3>
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '1rem' }}>
          <tbody>
            {cols.map((c) => (
              <tr key={c}>
                <th style={{ textAlign: 'left', padding: '0.25rem', border: '1px solid #d1d5db' }}>{translations[c] || c}</th>
                <td style={{ padding: '0.25rem', border: '1px solid #d1d5db' }}>
                  {relations[c] ? labelMap[c][row[c]] || String(row[c]) : String(row[c])}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {references.length > 0 && (
          <div style={{ marginBottom: '1rem' }}>
            <strong>References</strong>
            {references.map((r, idx) => (
              <div key={idx} style={{ marginTop: '0.25rem' }}>
                {r.table} ({r.count}) - {r.column} = {r.value}
              </div>
            ))}
          </div>
        )}
        <div style={{ textAlign: 'right' }}>
          <button type="button" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
