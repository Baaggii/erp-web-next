import React, { useState } from 'react';
import AsyncSearchSelect from './AsyncSearchSelect.jsx';
import Modal from './Modal.jsx';

export default function InlineTransactionTable({
  fields = [],
  relations = {},
  relationConfigs = {},
  labels = {},
  totalAmountFields = [],
  totalCurrencyFields = [],
  onRowSubmit = () => {},
}) {
  const [rows, setRows] = useState([]);
  const [picker, setPicker] = useState(null); // { row, field }

  const totalAmountSet = new Set(totalAmountFields);
  const totalCurrencySet = new Set(totalCurrencyFields);

  function addRow() {
    setRows((r) => [...r, {}]);
  }

  function handleChange(rowIdx, field, value) {
    setRows((r) =>
      r.map((row, i) => (i === rowIdx ? { ...row, [field]: value } : row)),
    );
  }

  async function saveRow(idx) {
    const row = rows[idx] || {};
    const ok = await Promise.resolve(onRowSubmit(row));
    if (ok !== false) {
      setRows((r) => r.map((row, i) => (i === idx ? { ...row, _saved: true } : row)));
    }
  }

  function openPicker(row, field) {
    setPicker({ row, field });
  }

  function handlePickerSelect(value) {
    if (picker) {
      handleChange(picker.row, picker.field, value);
    }
    setPicker(null);
  }

  const totals = {};
  fields.forEach((f) => {
    if (totalAmountSet.has(f) || totalCurrencySet.has(f)) {
      totals[f] = rows.reduce((sum, r) => sum + Number(r[f] || 0), 0);
    }
  });
  const count = rows.filter((r) =>
    totalAmountFields.some((f) => Number(r[f] || 0)),
  ).length;

  function renderCell(idx, f) {
    const val = rows[idx]?.[f] ?? '';
    const isRel = relationConfigs[f] || Array.isArray(relations[f]);
    if (rows[idx]?._saved) {
      return typeof val === 'object' ? val.label : val;
    }
    if (isRel) {
      const label = typeof val === 'object' ? val.label : val;
      return (
        <div className="cursor-pointer" onClick={() => openPicker(idx, f)}>
          {label || 'Select'}
        </div>
      );
    }
    return (
      <input
        className="w-full border px-1"
        value={val}
        onChange={(e) => handleChange(idx, f, e.target.value)}
      />
    );
  }

  return (
    <div>
      <table className="min-w-full border border-gray-300 text-sm">
        <thead className="bg-gray-50">
          <tr>
            {fields.map((f) => (
              <th key={f} className="border px-2 py-1">
                {labels[f] || f}
              </th>
            ))}
            <th className="border px-2 py-1" />
          </tr>
        </thead>
        <tbody>
          {rows.map((r, idx) => (
            <tr key={idx}>
              {fields.map((f) => (
                <td key={f} className="border px-2 py-1">
                  {renderCell(idx, f)}
                </td>
              ))}
              <td className="border px-2 py-1 text-right">
                {r._saved ? (
                  <button onClick={() => handleChange(idx, '_saved', false)}>
                    Edit
                  </button>
                ) : (
                  <button onClick={() => saveRow(idx)}>Save</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
        {(totalAmountFields.length > 0 || totalCurrencyFields.length > 0) && (
          <tfoot>
            <tr>
              {fields.map((f, i) => (
                <td key={f} className="border px-2 py-1 font-semibold">
                  {i === 0 ? 'НИЙТ' : ''}
                </td>
              ))}
              <td className="border px-2 py-1">{count}</td>
            </tr>
            <tr>
              {fields.map((f) => (
                <td key={f} className="border px-2 py-1 font-semibold">
                  {totals[f] !== undefined ? totals[f] : ''}
                </td>
              ))}
              <td className="border px-2 py-1" />
            </tr>
          </tfoot>
        )}
      </table>
      <button onClick={addRow} className="mt-2 px-2 py-1 bg-gray-200 rounded">
        + Add Row
      </button>
      {picker && (
        <Modal
          visible={true}
          title={labels[picker.field] || picker.field}
          onClose={() => setPicker(null)}
        >
          <AsyncSearchSelect
            table={relationConfigs[picker.field]?.table}
            searchColumn={relationConfigs[picker.field]?.column}
            labelFields={relationConfigs[picker.field]?.displayFields || []}
            value={rows[picker.row]?.[picker.field] || ''}
            onChange={handlePickerSelect}
          />
        </Modal>
      )}
    </div>
  );
}
