import React from 'react';
import Modal from './Modal.jsx';

export default function RowDetailModal({ visible, onClose, row = {}, columns = [], relations = {}, references = [], labels = {} }) {
  if (!visible) return null;

  const labelMap = {};
  Object.entries(relations).forEach(([col, opts]) => {
    labelMap[col] = {};
    opts.forEach((o) => {
      labelMap[col][o.value] = o.label;
    });
  });

  const cols = columns.length > 0 ? columns : Object.keys(row);

  return (
    <Modal visible={visible} title="Row Details" onClose={onClose}>
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '1rem' }}>
          <tbody>
            {cols.map((c) => (
              <tr key={c}>
                <th
                  style={{
                    textAlign: 'left',
                    padding: '0.25rem',
                    border: '1px solid #d1d5db',
                    width: '15ch',
                  }}
                >
                  {labels[c] || c}
                </th>
                <td
                  style={{
                    padding: '0.25rem',
                    border: '1px solid #d1d5db',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}
                >
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
    </Modal>
  );
}
