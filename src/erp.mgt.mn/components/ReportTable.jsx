import React from 'react';

export default function ReportTable({ rows }) {
  if (!rows || rows.length === 0) {
    return <p>No data</p>;
  }
  const columns = Object.keys(rows[0]);
  return (
    <div style={{ overflowX: 'auto' }}>
      <table
        style={{
          borderCollapse: 'collapse',
          tableLayout: 'fixed',
          minWidth: '1200px',
          maxWidth: '2000px',
        }}
      >
        <thead>
          <tr style={{ backgroundColor: '#e5e7eb' }}>
            {columns.map((col) => (
              <th
                key={col}
                style={{
                  padding: '0.5rem',
                  border: '1px solid #d1d5db',
                  textAlign: 'left',
                  whiteSpace: 'nowrap',
                }}
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr key={idx}>
              {columns.map((col) => (
                <td
                  key={col}
                  style={{
                    padding: '0.5rem',
                    border: '1px solid #d1d5db',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {row[col]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
