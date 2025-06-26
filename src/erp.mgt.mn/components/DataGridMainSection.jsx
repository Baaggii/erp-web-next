import React, { useState, useEffect } from 'react';
import AsyncSearchSelect from './AsyncSearchSelect.jsx';
import Modal from './Modal.jsx';

export default function DataGridMainSection({
  columns = [],
  labels = {},
  relations = {},
  relationConfigs = {},
  totalAmountFields = [],
  totalCurrencyFields = [],
  initialRows = [],
  onChange = () => {},
}) {
  const [rows, setRows] = useState(initialRows);

  useEffect(() => {
    setRows(initialRows);
  }, [initialRows]);
  const [selector, setSelector] = useState(null); // { row, column }

  function addRow() {
    setRows((r) => {
      const newRows = [...r, {}];
      onChange(newRows);
      return newRows;
    });
  }

  function updateCell(idx, col, val) {
    setRows((r) => {
      const copy = r.map((row, i) => (i === idx ? { ...row, [col]: val } : row));
      onChange(copy);
      return copy;
    });
  }

  function removeRow(idx) {
    setRows((r) => {
      const copy = r.filter((_, i) => i !== idx);
      onChange(copy);
      return copy;
    });
  }

  const totalAmountSet = new Set(totalAmountFields);
  const totalCurrencySet = new Set(totalCurrencyFields);
  const totals = {};
  rows.forEach((row) => {
    columns.forEach((c) => {
      if (totalAmountSet.has(c) || totalCurrencySet.has(c)) {
        const num = Number(row[c] || 0);
        if (!totals[c]) totals[c] = 0;
        totals[c] += num;
      }
    });
  });

  return (
    <div className="mb-4">
      <h3 className="mt-0 mb-1 font-semibold">Main</h3>
      <table className="min-w-full border border-gray-300 text-sm">
        <thead className="bg-gray-50">
          <tr>
            {columns.map((c) => (
              <th key={c} className="border px-2 py-1">
                {labels[c] || c}
              </th>
            ))}
            <th className="border px-2 py-1" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr key={idx}>
              {columns.map((c) => (
                <td key={c} className="border px-2 py-1">
                  {relationConfigs[c] ? (
                    <>
                      <button
                        type="button"
                        onClick={() => setSelector({ row: idx, column: c })}
                        className="px-1 border rounded"
                      >
                        {row[c] || 'Select'}
                      </button>
                      {selector && selector.row === idx && selector.column === c && (
                        <Modal
                          visible={true}
                          onClose={() => setSelector(null)}
                          title={labels[c] || c}
                        >
                          <AsyncSearchSelect
                            table={relationConfigs[c].table}
                            searchColumn={relationConfigs[c].column}
                            labelFields={relationConfigs[c].displayFields || []}
                            value={row[c] || ''}
                            onChange={(val) => {
                              updateCell(idx, c, val);
                              setSelector(null);
                            }}
                          />
                        </Modal>
                      )}
                    </>
                  ) : Array.isArray(relations[c]) ? (
                    <select
                      value={row[c] || ''}
                      onChange={(e) => updateCell(idx, c, e.target.value)}
                      className="w-full"
                    >
                      <option value="" />
                      {relations[c].map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={row[c] || ''}
                      onChange={(e) => updateCell(idx, c, e.target.value)}
                      className="w-full border px-1"
                    />
                  )}
                </td>
              ))}
              <td className="border px-2 py-1 whitespace-nowrap">
                <button
                  type="button"
                  onClick={() => updateCell(idx, '__save', true)}
                  className="mr-1"
                >
                  ✔
                </button>
                <button type="button" onClick={() => removeRow(idx)}>✖</button>
              </td>
            </tr>
          ))}
        </tbody>
        {(totalAmountFields.length > 0 || totalCurrencyFields.length > 0) && (
          <tfoot>
            <tr>
              {columns.map((c, i) => {
                let val = '';
                if (i === 0) val = 'НИЙТ';
                if (totalAmountSet.has(c)) val = totals[c] || 0;
                if (totalCurrencySet.has(c)) val = totals[c] || 0;
                return (
                  <td key={c} className="border px-2 py-1 font-semibold">
                    {val !== '' ? val : ''}
                  </td>
                );
              })}
              <td className="border px-2 py-1" />
            </tr>
          </tfoot>
        )}
      </table>
      <button
        type="button"
        onClick={addRow}
        className="mt-2 px-2 py-1 border rounded"
      >
        New Row
      </button>
    </div>
  );
}
