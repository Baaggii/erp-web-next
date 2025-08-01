import React from 'react';
import Modal from './Modal.jsx';
import formatTimestamp from '../utils/formatTimestamp.js';

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
  const placeholders = React.useMemo(() => {
    const map = {};
    cols.forEach((c) => {
      const lower = c.toLowerCase();
      if (lower.includes('time') && !lower.includes('date')) {
        map[c] = 'HH:MM:SS';
      } else if (lower.includes('timestamp') || lower.includes('date')) {
        map[c] = 'YYYY-MM-DD';
      }
    });
    return map;
  }, [cols]);

  function normalizeDateInput(value, format) {
    if (typeof value !== 'string') return value;
    let v = value.trim().replace(/^(\d{4})[.,](\d{2})[.,](\d{2})/, '$1-$2-$3');
    if (/^\d{4}-\d{2}-\d{2}T/.test(v) && !isNaN(Date.parse(v))) {
      const local = formatTimestamp(new Date(v));
      return format === 'HH:MM:SS' ? local.slice(11, 19) : local.slice(0, 10);
    }
    return v;
  }

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
                  {(() => {
                    const raw = relations[c] ? labelMap[c][row[c]] || row[c] : row[c];
                    const str = String(raw ?? '');
                    const display = placeholders[c] ? normalizeDateInput(str, placeholders[c]) : str;
                    return display;
                  })()}
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
