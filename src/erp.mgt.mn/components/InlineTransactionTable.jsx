import React, {
  useState,
  forwardRef,
  useImperativeHandle,
  useRef,
  useEffect,
} from 'react';
import AsyncSearchSelect from './AsyncSearchSelect.jsx';

const currencyFmt = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export default forwardRef(function InlineTransactionTable({
  fields = [],
  relations = {},
  relationConfigs = {},
  labels = {},
  totalAmountFields = [],
  totalCurrencyFields = [],
  collectRows = false,
  minRows = 1,
  onRowSubmit = () => {},
  onRowsChange = () => {},
}, ref) {
  const [rows, setRows] = useState(() =>
    collectRows ? Array.from({ length: minRows }, () => ({})) : [],
  );
  const inputRefs = useRef({});
  const focusRow = useRef(collectRows ? 0 : null);
  const addBtnRef = useRef(null);

  const totalAmountSet = new Set(totalAmountFields);
  const totalCurrencySet = new Set(totalCurrencyFields);

  useEffect(() => {
    if (!collectRows) return;
    if (rows.length < minRows) {
      setRows((r) => {
        const next = [...r];
        while (next.length < minRows) next.push({});
        return next;
      });
    }
    if (focusRow.current === null) return;
    const idx = focusRow.current;
    const el = inputRefs.current[`${idx}-0`];
    if (el) {
      el.focus();
      if (el.select) el.select();
    }
    focusRow.current = null;
  }, [rows, collectRows, minRows]);

  useImperativeHandle(ref, () => ({
    getRows: () => rows,
    clearRows: () =>
      setRows(() => {
        const next = collectRows
          ? Array.from({ length: minRows }, () => ({}))
          : [];
        onRowsChange(next);
        return next;
      }),
  }));

  function addRow() {
    setRows((r) => {
      const next = [...r, {}];
      focusRow.current = next.length - 1;
      onRowsChange(next);
      return next;
    });
  }

  function removeRow(idx) {
    setRows((r) => {
      const next = r.filter((_, i) => i !== idx);
      onRowsChange(next);
      return next;
    });
  }

  function handleChange(rowIdx, field, value) {
    setRows((r) => {
      const next = r.map((row, i) => (i === rowIdx ? { ...row, [field]: value } : row));
      onRowsChange(next);
      return next;
    });
  }

  async function saveRow(idx) {
    const row = rows[idx] || {};
    const cleaned = {};
    Object.entries(row).forEach(([k, v]) => {
      if (k === '_saved') return;
      cleaned[k] = typeof v === 'object' && v !== null && 'value' in v ? v.value : v;
    });
    const ok = await Promise.resolve(onRowSubmit(cleaned));
    if (ok !== false) {
      setRows((r) => {
        const next = r.map((row, i) => (i === idx ? { ...row, _saved: true } : row));
        onRowsChange(next);
        return next;
      });
    }
  }


  const totals = React.useMemo(() => {
    const sums = {};
    fields.forEach((f) => {
      if (
        totalAmountSet.has(f) ||
        totalCurrencySet.has(f) ||
        f === 'TotalCur' ||
        f === 'TotalAmt'
      ) {
        sums[f] = rows.reduce((sum, r) => sum + Number(r[f] || 0), 0);
      }
    });
    const count = rows.filter((r) =>
      totalAmountFields.some((col) => Number(r[col] || 0)),
    ).length;
    return { sums, count };
  }, [rows, fields, totalAmountSet, totalCurrencySet, totalAmountFields]);

  function handleKeyDown(e, rowIdx, colIdx) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const nextCol = colIdx + 1;
    if (nextCol < fields.length) {
      const el = inputRefs.current[`${rowIdx}-${nextCol}`];
      if (el) {
        el.focus();
        if (el.select) el.select();
      }
      return;
    }
    if (rowIdx < rows.length - 1) {
      const el = inputRefs.current[`${rowIdx + 1}-0`];
      if (el) {
        el.focus();
        if (el.select) el.select();
      }
      return;
    }
    addBtnRef.current?.focus();
  }

  function renderCell(idx, f, colIdx) {
    const val = rows[idx]?.[f] ?? '';
    const isRel = relationConfigs[f] || Array.isArray(relations[f]);
    if (rows[idx]?._saved && !collectRows) {
      return typeof val === 'object' ? val.label : val;
    }
    if (isRel) {
      if (relationConfigs[f]) {
        const conf = relationConfigs[f];
        const inputVal = typeof val === 'object' ? val.value : val;
        return (
          <AsyncSearchSelect
            table={conf.table}
            searchColumn={conf.column}
            labelFields={conf.displayFields || []}
            value={inputVal}
            onChange={(v, label) =>
              handleChange(idx, f, label ? { value: v, label } : v)
            }
            inputRef={(el) => (inputRefs.current[`${idx}-${colIdx}`] = el)}
            onKeyDown={(e) => handleKeyDown(e, idx, colIdx)}
          />
        );
      }
      if (Array.isArray(relations[f])) {
        const inputVal = typeof val === 'object' ? val.value : val;
        return (
          <select
            className="w-full border px-1"
            value={inputVal}
            onChange={(e) => handleChange(idx, f, e.target.value)}
            ref={(el) => (inputRefs.current[`${idx}-${colIdx}`] = el)}
            onKeyDown={(e) => handleKeyDown(e, idx, colIdx)}
          >
            <option value="">-- select --</option>
            {relations[f].map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        );
      }
    }
    return (
      <textarea
        rows={1}
        className="w-full border px-1 resize-none whitespace-pre-wrap"
        style={{ overflow: 'hidden' }}
        value={typeof val === 'object' ? val.value : val}
        onChange={(e) => handleChange(idx, f, e.target.value)}
        ref={(el) => (inputRefs.current[`${idx}-${colIdx}`] = el)}
        onKeyDown={(e) => handleKeyDown(e, idx, colIdx)}
        onInput={(e) => {
          e.target.style.height = 'auto';
          e.target.style.height = `${e.target.scrollHeight}px`;
        }}
      />
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-max border border-gray-300 text-xs">
        <thead className="bg-gray-50">
          <tr>
            {fields.map((f) => {
              const label = labels[f] || f;
              const vertical = label.length <= 8;
              return (
                <th
                  key={f}
                  className="border px-1 py-1"
                  style={{
                    whiteSpace: 'normal',
                    wordBreak: 'break-word',
                    lineHeight: '1.1',
                    fontSize: '0.75rem',
                    maxHeight: '3em',
                    ...(vertical
                      ? { writingMode: 'vertical-rl', transform: 'rotate(180deg)' }
                      : {}),
                  }}
                >
                  {label}
                </th>
              );
            })}
            <th className="border px-1 py-1" />
          </tr>
        </thead>
        <tbody>
          {rows.map((r, idx) => (
            <tr key={idx}>
              {fields.map((f, cIdx) => (
                <td key={f} className="border px-1 py-1 align-top">
                  {renderCell(idx, f, cIdx)}
                </td>
              ))}
              <td className="border px-1 py-1 text-right">
                {collectRows ? (
                  <button onClick={() => removeRow(idx)}>Delete</button>
                ) : r._saved ? (
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
              <td className="border px-1 py-1 font-semibold text-center">НИЙТ</td>
              {fields.map((f) => {
                let val = '';
                if (totalCurrencySet.has(f) || f === 'TotalCur') {
                  val = currencyFmt.format(totals.sums[f] || 0);
                } else if (totalAmountSet.has(f) || f === 'TotalAmt') {
                  val = totals.sums[f] !== undefined ? totals.sums[f] : '';
                } else if (totals.sums[f] !== undefined) {
                  val = totals.sums[f];
                }
                return (
                  <td key={f} className="border px-1 py-1 font-semibold">
                    {val}
                  </td>
                );
              })}
              <td className="border px-1 py-1" />
            </tr>
            <tr>
              <td className="border px-1 py-1 font-semibold text-center">
                мөрийн тоо
              </td>
              {fields.length > 0 && (
                <td className="border px-1 py-1 font-semibold">
                  {totals.count}
                </td>
              )}
              {fields.slice(1).map((f) => (
                <td key={f} className="border px-1 py-1"></td>
              ))}
              <td className="border px-1 py-1" />
            </tr>
          </tfoot>
        )}
      </table>
      <button
        onClick={addRow}
        ref={addBtnRef}
        className="mt-2 px-2 py-1 bg-gray-200 rounded"
      >
        + Add Row
      </button>
    </div>
  );
});
