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

function normalizeNumberInput(value) {
  if (typeof value !== 'string') return value;
  return value.replace(',', '.');
}

function normalizeDateInput(value, format) {
  if (typeof value !== 'string') return value;
  let v = value.replace(/^(\d{4})[.,](\d{2})[.,](\d{2})/, '$1-$2-$3');
  const isoRe = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;
  if (isoRe.test(v)) {
    const d = new Date(v);
    if (format === 'YYYY-MM-DD') return d.toISOString().slice(0, 10);
    if (format === 'HH:MM:SS') return d.toISOString().slice(11, 19);
    return d.toISOString().slice(0, 19).replace('T', ' ');
  }
  return v;
}

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
  requiredFields = [],
}, ref) {
  const [rows, setRows] = useState(() =>
    collectRows ? Array.from({ length: minRows }, () => ({})) : [],
  );
  const inputRefs = useRef({});
  const focusRow = useRef(collectRows ? 0 : null);
  const addBtnRef = useRef(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [invalidCell, setInvalidCell] = useState(null);

  const totalAmountSet = new Set(totalAmountFields);
  const totalCurrencySet = new Set(totalCurrencyFields);

  const placeholders = React.useMemo(() => {
    const map = {};
    fields.forEach((f) => {
      const lower = f.toLowerCase();
      if (lower.includes('timestamp') || (lower.includes('date') && lower.includes('time'))) {
        map[f] = 'YYYY-MM-DD HH:MM:SS';
      } else if (lower.includes('date')) {
        map[f] = 'YYYY-MM-DD';
      } else if (lower.includes('time')) {
        map[f] = 'HH:MM:SS';
      }
    });
    return map;
  }, [fields]);

  function isValidDate(value, format) {
    if (!value) return true;
    const isoRe = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;
    let v = normalizeDateInput(String(value), format);
    if (isoRe.test(v)) {
      const d = new Date(v);
      if (format === 'YYYY-MM-DD') v = d.toISOString().slice(0, 10);
      else if (format === 'HH:MM:SS') v = d.toISOString().slice(11, 19);
      else v = d.toISOString().slice(0, 19).replace('T', ' ');
    }
    const map = {
      'YYYY-MM-DD': /^\d{4}-\d{2}-\d{2}$/,
      'HH:MM:SS': /^\d{2}:\d{2}:\d{2}$/,
      'YYYY-MM-DD HH:MM:SS': /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/,
    };
    const re = map[format];
    if (!re) return true;
    if (!re.test(v)) return false;
    if (format !== 'HH:MM:SS') {
      const d = new Date(v.replace(' ', 'T'));
      return !isNaN(d.getTime());
    }
    return true;
  }

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
    hasInvalid: () => invalidCell !== null,
  }));

  function addRow() {
    if (requiredFields.length > 0 && rows.length > 0) {
      const prev = rows[rows.length - 1];
      for (const f of requiredFields) {
        let val = prev[f];
        if (placeholders[f]) {
          val = normalizeDateInput(val, placeholders[f]);
        }
        if (totalAmountSet.has(f) || totalCurrencySet.has(f)) {
          val = normalizeNumberInput(val);
        }
        if (!val) {
          setErrorMsg('Please fill required fields before adding new row.');
          setInvalidCell({ row: rows.length - 1, field: f });
          const el = inputRefs.current[`${rows.length - 1}-${fields.indexOf(f)}`];
          if (el) {
            el.focus();
            if (el.select) el.select();
          }
          return;
        }
        if (
          (totalAmountSet.has(f) || totalCurrencySet.has(f)) &&
          val !== '' &&
          isNaN(Number(normalizeNumberInput(val)))
        ) {
          setErrorMsg('Invalid number in ' + (labels[f] || f));
          setInvalidCell({ row: rows.length - 1, field: f });
          const el = inputRefs.current[`${rows.length - 1}-${fields.indexOf(f)}`];
          if (el) {
            el.focus();
            if (el.select) el.select();
          }
          return;
        }
        const ph = placeholders[f];
        if (ph && !isValidDate(val, ph)) {
          setErrorMsg('Invalid date in ' + (labels[f] || f));
          setInvalidCell({ row: rows.length - 1, field: f });
          const el = inputRefs.current[`${rows.length - 1}-${fields.indexOf(f)}`];
          if (el) {
            el.focus();
            if (el.select) el.select();
          }
          return;
        }
      }
    }
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
    if (invalidCell && invalidCell.row === rowIdx && invalidCell.field === field) {
      setInvalidCell(null);
      setErrorMsg('');
    }
  }

  async function saveRow(idx) {
    const row = rows[idx] || {};
    for (const f of requiredFields) {
      let val = row[f];
      if (placeholders[f]) {
        val = normalizeDateInput(val, placeholders[f]);
      }
      if (totalAmountSet.has(f) || totalCurrencySet.has(f)) {
        val = normalizeNumberInput(val);
      }
      if (!val) {
        setErrorMsg('Please fill required fields.');
        setInvalidCell({ row: idx, field: f });
        const el = inputRefs.current[`${idx}-${fields.indexOf(f)}`];
        if (el) {
          el.focus();
          if (el.select) el.select();
        }
        return;
      }
      if (
        (totalAmountSet.has(f) || totalCurrencySet.has(f)) &&
        val !== '' &&
        isNaN(Number(normalizeNumberInput(val)))
      ) {
        setErrorMsg('Invalid number in ' + (labels[f] || f));
        setInvalidCell({ row: idx, field: f });
        const el = inputRefs.current[`${idx}-${fields.indexOf(f)}`];
        if (el) {
          el.focus();
          if (el.select) el.select();
        }
        return;
      }
      const ph = placeholders[f];
      if (ph && !isValidDate(val, ph)) {
        setErrorMsg('Invalid date in ' + (labels[f] || f));
        setInvalidCell({ row: idx, field: f });
        const el = inputRefs.current[`${idx}-${fields.indexOf(f)}`];
        if (el) {
          el.focus();
          if (el.select) el.select();
        }
        return;
      }
    }
    const cleaned = {};
    Object.entries(row).forEach(([k, v]) => {
      if (k === '_saved') return;
      let val = typeof v === 'object' && v !== null && 'value' in v ? v.value : v;
      if (placeholders[k]) val = normalizeDateInput(val, placeholders[k]);
      if (totalAmountSet.has(k) || totalCurrencySet.has(k)) {
        val = normalizeNumberInput(val);
      }
      cleaned[k] = val;
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
        sums[f] = rows.reduce(
          (sum, r) => sum + Number(normalizeNumberInput(r[f] || 0)),
          0,
        );
      }
    });
    const count = rows.filter((r) =>
      totalAmountFields.some((col) => Number(normalizeNumberInput(r[col] || 0))),
    ).length;
    return { sums, count };
  }, [rows, fields, totalAmountSet, totalCurrencySet, totalAmountFields]);

  function handleKeyDown(e, rowIdx, colIdx) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const field = fields[colIdx];
    let val = e.target.value;
    if (placeholders[field]) {
      val = val.replace(/^(\d{4})[.,](\d{2})[.,](\d{2})/, '$1-$2-$3');
    }
    if (totalAmountSet.has(field) || totalCurrencySet.has(field)) {
      val = normalizeNumberInput(val);
    }
    if (rows[rowIdx]?.[field] !== val) {
      handleChange(rowIdx, field, val);
      if (val !== e.target.value) e.target.value = val;
    }
    if (
      requiredFields.includes(field) &&
      (val === '' || val === undefined)
    ) {
      setErrorMsg('Please fill required fields.');
      setInvalidCell({ row: rowIdx, field });
      e.target.focus();
      if (e.target.select) e.target.select();
      return;
    }
    if (
      (totalAmountSet.has(field) || totalCurrencySet.has(field)) &&
      val !== '' &&
      isNaN(Number(normalizeNumberInput(val)))
    ) {
      setErrorMsg('Invalid number in ' + (labels[field] || field));
      setInvalidCell({ row: rowIdx, field });
      e.target.focus();
      if (e.target.select) e.target.select();
      return;
    }
    if (placeholders[field] && !isValidDate(val, placeholders[field])) {
      setErrorMsg('Invalid date in ' + (labels[field] || field));
      setInvalidCell({ row: rowIdx, field });
      e.target.focus();
      if (e.target.select) e.target.select();
      return;
    }
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
    const invalid = invalidCell && invalidCell.row === idx && invalidCell.field === f;
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
            className={invalid ? 'border-red-500 bg-red-100' : ''}
          />
        );
      }
      if (Array.isArray(relations[f])) {
        const inputVal = typeof val === 'object' ? val.value : val;
        return (
          <select
            className={`w-full border px-1 ${invalid ? 'border-red-500 bg-red-100' : ''}`}
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
        className={`w-full border px-1 resize-none whitespace-pre-wrap ${invalid ? 'border-red-500 bg-red-100' : ''}`}
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
              <td className="border px-1 py-1 font-semibold text-center">НИЙТ</td>
            </tr>
            <tr>
              {fields.map((f, idx) => (
                <td key={f} className="border px-1 py-1 font-semibold">
                  {idx === 0 ? totals.count : ''}
                </td>
              ))}
              <td className="border px-1 py-1 font-semibold text-center">
                мөрийн тоо
              </td>
            </tr>
          </tfoot>
        )}
      </table>
      {errorMsg && (
        <div className="text-red-600 text-sm mt-1">{errorMsg}</div>
      )}
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
