import React, { useState, useEffect, useRef, useContext, memo } from 'react';
import AsyncSearchSelect from './AsyncSearchSelect.jsx';
import Modal from './Modal.jsx';
import InlineTransactionTable from './InlineTransactionTable.jsx';
import { AuthContext } from '../context/AuthContext.jsx';
import formatTimestamp from '../utils/formatTimestamp.js';

const RowFormModal = function RowFormModal({
  visible,
  onCancel,
  onSubmit,
  columns,
  row,
  relations = {},
  relationConfigs = {},
  relationData = {},
  disabledFields = [],
  labels = {},
  requiredFields = [],
  onChange = () => {},
  headerFields = [],
  footerFields = [],
  mainFields = [],
  printEmpField = [],
  printCustField = [],
  totalAmountFields = [],
  totalCurrencyFields = [],
  defaultValues = {},
  dateField = [],
  inline = false,
  useGrid = false,
  hideAddButton = false,
  formView = 'cells',
}) {
  const mounted = useRef(false);
  const renderCount = useRef(0);
  const warned = useRef(false);

  renderCount.current++;
  if (renderCount.current > 10 && !warned.current) {
    console.warn(`⚠️ Excessive renders: RowFormModal ${renderCount.current}`);
    warned.current = true;
  }

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      if (window.erpDebug) {
        console.warn('✅ Mounted: RowFormModal');
      }
    }
  }, []);
  const headerSet = new Set(headerFields);
  const footerSet = new Set(footerFields);
  const { user, company } = useContext(AuthContext);
  const [formVals, setFormVals] = useState(() => {
    const init = {};
    const now = new Date();
    columns.forEach((c) => {
      const lower = c.toLowerCase();
      let placeholder = '';
      if (lower.includes('timestamp') || (lower.includes('date') && lower.includes('time'))) {
        placeholder = 'YYYY-MM-DD HH:MM:SS';
      } else if (lower.includes('date')) {
        placeholder = 'YYYY-MM-DD';
      } else if (lower.includes('time')) {
        placeholder = 'HH:MM:SS';
      }
      const raw = row ? String(row[c] ?? '') : String(defaultValues[c] ?? '');
      let val = placeholder ? normalizeDateInput(raw, placeholder) : raw;
      if (!row && !val && dateField.includes(c)) {
        if (placeholder === 'YYYY-MM-DD') val = formatTimestamp(now).slice(0, 10);
        else if (placeholder === 'HH:MM:SS') val = formatTimestamp(now).slice(11, 19);
        else val = formatTimestamp(now);
      }
      if (!row && !val && headerSet.has(c)) {
        if (
          ['created_by', 'employee_id', 'emp_id', 'empid', 'user_id'].includes(c) &&
          user?.empid
        ) {
          val = user.empid;
        } else if (c === 'branch_id' && company?.branch_id !== undefined) {
          val = company.branch_id;
        } else if (c === 'company_id' && company?.company_id !== undefined) {
          val = company.company_id;
        }
      }
      init[c] = val;
    });
    return init;
  });
  const inputRefs = useRef({});
  const [errors, setErrors] = useState({});
  const [submitLocked, setSubmitLocked] = useState(false);
  const tableRef = useRef(null);
  const [gridRows, setGridRows] = useState([]);
  const placeholders = React.useMemo(() => {
    const map = {};
    columns.forEach((c) => {
      const lower = c.toLowerCase();
      if (lower.includes('timestamp') || (lower.includes('date') && lower.includes('time'))) {
        map[c] = 'YYYY-MM-DD HH:MM:SS';
      } else if (lower.includes('date')) {
        map[c] = 'YYYY-MM-DD';
      } else if (lower.includes('time')) {
        map[c] = 'HH:MM:SS';
      }
    });
    return map;
  }, [columns]);

  function normalizeDateInput(value, format) {
    if (typeof value !== 'string') return value;
    let v = value.replace(/^(\d{4})[.,](\d{2})[.,](\d{2})/, '$1-$2-$3');
    const isoRe = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;
  if (isoRe.test(v)) {
      const local = formatTimestamp(new Date(v));
      if (format === 'YYYY-MM-DD') return local.slice(0, 10);
      if (format === 'HH:MM:SS') return local.slice(11, 19);
      return local;
  }
  return v;
}

  function normalizeNumberInput(value) {
    if (typeof value !== 'string') return value;
    return value.replace(',', '.');
  }

  function isValidDate(value, format) {
    if (!value) return true;
    const normalized = normalizeDateInput(value, format);
    const map = {
      'YYYY-MM-DD': /^\d{4}-\d{2}-\d{2}$/,
      'HH:MM:SS': /^\d{2}:\d{2}:\d{2}$/,
      'YYYY-MM-DD HH:MM:SS': /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/,
    };
    const re = map[format];
    if (!re) return true;
    if (!re.test(normalized)) return false;
    if (format !== 'HH:MM:SS') {
      const d = new Date(normalized.replace(' ', 'T'));
      return !isNaN(d.getTime());
    }
    return true;
  }

  useEffect(() => {
    if (!visible) return;
    const vals = {};
    columns.forEach((c) => {
      const raw = row ? String(row[c] ?? '') : String(defaultValues[c] ?? '');
      let v = placeholders[c] ? normalizeDateInput(raw, placeholders[c]) : raw;
        if (!row && !v && dateField.includes(c)) {
          const now = new Date();
          if (placeholders[c] === 'YYYY-MM-DD') v = formatTimestamp(now).slice(0, 10);
          else if (placeholders[c] === 'HH:MM:SS') v = formatTimestamp(now).slice(11, 19);
          else v = formatTimestamp(now);
        }
      if (!row && !v && headerSet.has(c)) {
        if (
          ['created_by', 'employee_id', 'emp_id', 'empid', 'user_id'].includes(c) &&
          user?.empid
        ) {
          v = user.empid;
        } else if (c === 'branch_id' && company?.branch_id !== undefined) {
          v = company.branch_id;
        } else if (c === 'company_id' && company?.company_id !== undefined) {
          v = company.company_id;
        }
      }
      vals[c] = v;
    });
    // Avoid triggering a state update if the values haven't actually changed.
    const same = Object.keys(vals).every((k) => formVals[k] === vals[k]);
    if (!same) setFormVals(vals);
    inputRefs.current = {};
    setErrors({});
  }, [row, visible, user, company]);

  if (!visible) return null;

  const mainSet = new Set(mainFields);
  const totalAmountSet = new Set(totalAmountFields);
  const totalCurrencySet = new Set(totalCurrencyFields);
  const headerCols = columns.filter((c) => headerSet.has(c));
  const footerCols = columns.filter((c) => footerSet.has(c));
  const mainCols =
    mainFields.length > 0
      ? columns.filter((c) => mainSet.has(c))
      : columns.filter((c) => !headerSet.has(c) && !footerSet.has(c));

  const formGrid = React.useMemo(() => {
    if (formView === 'row') return 'flex flex-row flex-wrap items-end gap-2';
    if (formView === 'column') return 'flex flex-col gap-2';
    return 'grid grid-cols-1 md:grid-cols-2 gap-0';
  }, [formView]);

  function handleKeyDown(e, col) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    let val = normalizeDateInput(e.target.value, placeholders[col]);
    if (totalAmountSet.has(col) || totalCurrencySet.has(col)) {
      val = normalizeNumberInput(val);
    }
    if (formVals[col] !== val) {
      setFormVals((v) => ({ ...v, [col]: val }));
      onChange({ [col]: val });
      if (val !== e.target.value) e.target.value = val;
    }
    if (placeholders[col] && !isValidDate(val, placeholders[col])) {
      setErrors((er) => ({ ...er, [col]: 'Хугацааны формат буруу' }));
      return;
    }
    if (requiredFields.includes(col) && (val === '' || val === null || val === undefined)) {
      setErrors((er) => ({ ...er, [col]: 'Утга оруулна уу' }));
      return;
    }
    if (
      (totalAmountSet.has(col) || totalCurrencySet.has(col)) &&
      val !== '' &&
      isNaN(Number(normalizeNumberInput(val)))
    ) {
      setErrors((er) => ({ ...er, [col]: 'Буруу тоон утга' }));
      return;
    }
    const enabled = columns.filter((c) => !disabledFields.includes(c));
    const idx = enabled.indexOf(col);
    const next = enabled[idx + 1];
    if (next && inputRefs.current[next]) {
      const el = inputRefs.current[next];
      el.focus();
      if (el.select) el.select();
      return;
    }
    if (!next) {
      submitForm();
    }
  }

  async function submitForm() {
    if (submitLocked) return;
    setSubmitLocked(true);
    if (useGrid && tableRef.current) {
      if (tableRef.current.hasInvalid && tableRef.current.hasInvalid()) {
        alert('Тэмдэглэсэн талбаруудыг засна уу.');
        setSubmitLocked(false);
        return;
      }
      const rows = tableRef.current.getRows();
      const cleanedRows = [];
      const rowIndices = [];
      let hasMissing = false;
      let hasInvalid = false;
      rows.forEach((r, idx) => {
        const hasValue = Object.values(r).some((v) => {
          if (v === null || v === undefined || v === '') return false;
          if (typeof v === 'object' && 'value' in v) return v.value !== '';
          return true;
        });
        if (!hasValue) return;
        const normalized = {};
        Object.entries(r).forEach(([k, v]) => {
          const raw = typeof v === 'object' && v !== null && 'value' in v ? v.value : v;
          let val = placeholders[k] ? normalizeDateInput(raw, placeholders[k]) : raw;
          if (totalAmountSet.has(k) || totalCurrencySet.has(k)) {
            val = normalizeNumberInput(val);
          }
          normalized[k] = val;
        });
        requiredFields.forEach((f) => {
          if (
            normalized[f] === '' ||
            normalized[f] === null ||
            normalized[f] === undefined
          )
            hasMissing = true;
          if (
            (totalAmountSet.has(f) || totalCurrencySet.has(f)) &&
            normalized[f] !== '' &&
            isNaN(Number(normalizeNumberInput(normalized[f])))
          )
            hasInvalid = true;
          const ph = placeholders[f];
          if (ph && !isValidDate(normalized[f], ph)) hasInvalid = true;
        });
        cleanedRows.push(normalized);
        rowIndices.push(idx);
      });

      if (hasMissing) {
        alert('Шаардлагатай талбаруудыг бөглөнө үү.');
        setSubmitLocked(false);
        return;
      }
      if (hasInvalid) {
        alert('Буруу утгуудыг засна уу.');
        setSubmitLocked(false);
        return;
      }

      if (cleanedRows.length === 0) {
        setSubmitLocked(false);
        return;
      }

      {
        const failedRows = [];
        for (let i = 0; i < cleanedRows.length; i++) {
          const r = cleanedRows[i];
          try {
            const res = await Promise.resolve(onSubmit(r));
            if (res === false) failedRows.push(rows[rowIndices[i]]);
          } catch (err) {
            console.error('Submit failed', err);
            failedRows.push(rows[rowIndices[i]]);
          }
        }
        if (failedRows.length === 0) {
          tableRef.current.clearRows();
        } else if (tableRef.current.replaceRows) {
          tableRef.current.replaceRows(failedRows);
        }
      }
      setSubmitLocked(false);
      return;
    }
    const errs = {};
    requiredFields.forEach((f) => {
      if (
        columns.includes(f) &&
        (formVals[f] === '' || formVals[f] === null || formVals[f] === undefined)
      ) {
        errs[f] = 'Утга оруулна уу';
      }
    });
    setErrors(errs);
    if (Object.keys(errs).length === 0) {
      const normalized = {};
      Object.entries(formVals).forEach(([k, v]) => {
        let val = placeholders[k] ? normalizeDateInput(v, placeholders[k]) : v;
        if (totalAmountSet.has(k) || totalCurrencySet.has(k)) {
          val = normalizeNumberInput(val);
        }
        normalized[k] = val;
      });
      try {
        const res = await Promise.resolve(onSubmit(normalized));
        if (res === false) {
          setSubmitLocked(false);
          return;
        }
      } catch (err) {
        console.error('Submit failed', err);
        setSubmitLocked(false);
        return;
      }
    }
    setSubmitLocked(false);
  }
  function renderField(c, withLabel = true) {
    const err = errors[c];
    const inputClass = `w-full p-2 border rounded ${err ? 'border-red-500' : 'border-gray-300'}`;

    const control = relationConfigs[c] ? (
      <AsyncSearchSelect
        title={labels[c] || c}
        table={relationConfigs[c].table}
        searchColumn={relationConfigs[c].column}
        labelFields={relationConfigs[c].displayFields || []}
        value={formVals[c]}
        onChange={(val) => {
          setFormVals((v) => ({ ...v, [c]: val }));
          setErrors((er) => ({ ...er, [c]: undefined }));
          onChange({ [c]: val });
        }}
        disabled={row && disabledFields.includes(c)}
        onKeyDown={(e) => handleKeyDown(e, c)}
        onFocus={(e) => e.target.select()}
        inputRef={(el) => (inputRefs.current[c] = el)}
      />
    ) : Array.isArray(relations[c]) ? (
      <select
        title={labels[c] || c}
        ref={(el) => (inputRefs.current[c] = el)}
        value={formVals[c]}
        onChange={(e) => {
          setFormVals((prev) => {
            if (prev[c] === e.target.value) return prev;
            const updated = { ...prev, [c]: e.target.value };
            onChange({ [c]: e.target.value });
            return updated;
          });
          setErrors((er) => ({ ...er, [c]: undefined }));
          onChange({ [c]: e.target.value });
        }}
        onKeyDown={(e) => handleKeyDown(e, c)}
        disabled={row && disabledFields.includes(c)}
        className={inputClass}
      >
        <option value="">-- select --</option>
        {relations[c].map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    ) : (
      <input
        title={labels[c] || c}
        ref={(el) => (inputRefs.current[c] = el)}
        type="text"
        placeholder={placeholders[c] || ''}
        value={formVals[c]}
        onChange={(e) => {
          setFormVals((prev) => {
            if (prev[c] === e.target.value) return prev;
            const updated = { ...prev, [c]: e.target.value };
            onChange({ [c]: e.target.value });
            return updated;
          });
          setErrors((er) => ({ ...er, [c]: undefined }));
          onChange({ [c]: e.target.value });
        }}
        onKeyDown={(e) => handleKeyDown(e, c)}
        onFocus={(e) => e.target.select()}
        disabled={row && disabledFields.includes(c)}
        className={inputClass}
      />
    );

    if (!withLabel) return <>{control}</>;

    return (
      <div key={c} className="mb-3">
        <label className="block mb-1 font-medium">
          {labels[c] || c}
          {requiredFields.includes(c) && (
            <span className="text-red-500">*</span>
          )}
        </label>
        {control}
        {err && <div className="text-red-500 text-sm">{err}</div>}
      </div>
    );
  }

  function renderMainTable(cols) {
    if (cols.length === 0) return null;
    if (inline || useGrid) {
      return (
        <div className="mb-4">
          <h3 className="mt-0 mb-1 font-semibold">Main</h3>
          <InlineTransactionTable
            ref={useGrid ? tableRef : undefined}
            fields={cols}
            relations={relations}
            relationConfigs={relationConfigs}
            relationData={relationData}
            labels={labels}
            totalAmountFields={totalAmountFields}
          totalCurrencyFields={totalCurrencyFields}
          collectRows={useGrid}
          minRows={1}
          onRowSubmit={onSubmit}
          onRowsChange={setGridRows}
          requiredFields={requiredFields}
          defaultValues={defaultValues}
          hideAddButton={inline}
        />
        </div>
      );
    }
    const totals = {};
    cols.forEach((c) => {
      if (totalAmountSet.has(c) || totalCurrencySet.has(c)) {
        totals[c] = Number(formVals[c] || 0);
      }
    });
    return (
      <div className="mb-4">
        <h3 className="mt-0 mb-1 font-semibold">Main</h3>
        <table className="min-w-full border border-gray-300 text-sm">
          <thead className="bg-gray-50">
            <tr>
              {cols.map((c) => (
                <th key={c} className="border px-2 py-1">
                  {labels[c] || c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              {cols.map((c) => (
                <td key={c} className="border px-2 py-1">
                  {renderField(c, false)}
                </td>
              ))}
            </tr>
          </tbody>
          {(totalAmountFields.length > 0 || totalCurrencyFields.length > 0) && (
            <tfoot>
              <tr>
                {cols.map((c, idx) => {
                  let val = '';
                  if (idx === 0) val = 'НИЙТ';
                  if (totalAmountSet.has(c)) val = totals[c];
                  if (totalCurrencySet.has(c)) val = totals[c];
                  return (
                    <td
                      key={c}
                      className="border px-2 py-1 font-semibold"
                    >
                      {val !== '' ? val : ''}
                    </td>
                  );
                })}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    );
  }

  function renderHeaderTable(cols) {
    if (cols.length === 0) return null;
    return (
      <div className="mb-4">
        <h3 className="mt-0 mb-1 font-semibold">Header</h3>
        <table className="min-w-full border border-gray-300 text-sm">
          <tbody>
            {cols.map((c) => {
              let val = formVals[c];
              if ((val === '' || val === undefined) && headerSet.has(c)) {
                if (
                  ['created_by', 'employee_id', 'emp_id', 'empid', 'user_id'].includes(c) &&
                  user?.empid
                ) {
                  val = user.empid;
                } else if (c === 'branch_id' && company?.branch_id !== undefined) {
                  val = company.branch_id;
                } else if (c === 'company_id' && company?.company_id !== undefined) {
                  val = company.company_id;
                }
              }
              return (
                <tr key={c}>
                  <th className="border px-2 py-1 text-left">{labels[c] || c}</th>
                  <td className="border px-2 py-1">{val}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  function renderSection(title, cols) {
    if (cols.length === 0) return null;
    return (
      <div className="mb-2">
        <h3 className="mt-0 mb-1 font-semibold">{title}</h3>
        <div className={formGrid}>{cols.map((c) => renderField(c))}</div>
      </div>
    );
  }

  function handlePrint(mode) {
    const all = [...headerCols, ...mainCols, ...footerCols];
    const list = mode === 'emp' ? printEmpField : printCustField;
    const allowed = new Set(list.length > 0 ? list : all);
    const h = headerCols.filter((c) => allowed.has(c));
    const m = mainCols.filter((c) => allowed.has(c));
    const f = footerCols.filter((c) => allowed.has(c));

    const rowHtml = (cols, skipEmpty = false) =>
      cols
        .filter((c) =>
          skipEmpty
            ? formVals[c] !== '' &&
              formVals[c] !== null &&
              formVals[c] !== 0 &&
              formVals[c] !== undefined
            : true,
        )
        .map(
          (c) =>
            `<tr><th>${labels[c] || c}</th><td>${
              formVals[c] !== undefined ? formVals[c] : ''
            }</td></tr>`,
        )
        .join('');

    const mainTableHtml = () => {
      if (!useGrid) return rowHtml(m, true);
      if (gridRows.length === 0) return '';
      const used = m.filter((c) =>
        gridRows.some(
          (r) => r[c] !== '' && r[c] !== null && r[c] !== 0 && r[c] !== undefined,
        ),
      );
      if (used.length === 0) return '';
      const header = used.map((c) => `<th>${labels[c] || c}</th>`).join('');
      const body = gridRows
        .map(
          (r) =>
            '<tr>' +
            used.map((c) => `<td>${r[c] !== undefined ? r[c] : ''}</td>`).join('') +
            '</tr>',
        )
        .join('');
      return `<table><thead><tr>${header}</tr></thead><tbody>${body}</tbody></table>`;
    };

    let html = '<html><head><title>Print</title>';
    html +=
      '<style>@media print{body{margin:1rem;font-size:12px}}table{width:100%;border-collapse:collapse;margin-bottom:1rem;}th,td{border:1px solid #666;padding:4px;text-align:left;}h3{margin:0 0 4px 0;font-weight:600;}</style>';
    html +=
      '<link href="https://cdn.jsdelivr.net/npm/tailwindcss@3.4.1/dist/tailwind.min.css" rel="stylesheet">';
    html += '</head><body>';
    if (h.length) html += `<h3>Header</h3><table>${rowHtml(h, true)}</table>`;
    if (m.length) html += `<h3>Main</h3>${mainTableHtml()}`;
    if (f.length) html += `<h3>Footer</h3><table>${rowHtml(f, true)}</table>`;
    html += '</body></html>';
    const w = window.open('', '_blank');
    w.document.write(html);
    w.document.close();
    w.focus();
    w.print();
  }

  if (inline) {
    return (
      <div className="p-4 space-y-4">
        {renderHeaderTable(headerCols)}
        {renderMainTable(mainCols)}
        {renderSection('Footer', footerCols)}
      </div>
    );
  }
  return (
    <Modal
      visible={visible}
      title={row ? 'Мөр засах' : 'Мөр нэмэх'}
      onClose={onCancel}
      width="70vw"
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submitForm();
        }}
        className="p-4 space-y-4"
      >
        {renderHeaderTable(headerCols)}
        {renderMainTable(mainCols)}
        {renderSection('Footer', footerCols)}
        <div className="mt-2 text-right space-x-2">
          <button
            type="button"
            onClick={() => handlePrint('emp')}
            className="px-3 py-1 bg-gray-200 rounded"
          >
            Print Emp
          </button>
          <button
            type="button"
            onClick={() => handlePrint('cust')}
            className="px-3 py-1 bg-gray-200 rounded"
          >
            Print Cust
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1 bg-gray-200 rounded"
          >
            Cancel
          </button>
          <button type="submit" className="px-3 py-1 bg-blue-600 text-white rounded">
            Post
          </button>
        </div>
        <div className="text-sm text-gray-600">
          Press <strong>Enter</strong> to move to next field. The field will be automatically selected. Use arrow keys to navigate selections.
        </div>
      </form>
    </Modal>
  );
}

export default memo(RowFormModal);
