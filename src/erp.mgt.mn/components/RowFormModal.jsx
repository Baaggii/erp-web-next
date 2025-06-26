import React, { useState, useEffect, useRef } from 'react';
import AsyncSearchSelect from './AsyncSearchSelect.jsx';
import Modal from './Modal.jsx';

export default function RowFormModal({
  visible,
  onCancel,
  onSubmit,
  columns,
  row,
  relations = {},
  relationConfigs = {},
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
}) {
  const [formVals, setFormVals] = useState(() => {
    const init = {};
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
      const raw = row ? String(row[c] ?? '') : '';
      init[c] = placeholder ? normalizeDateInput(raw, placeholder) : raw;
    });
    return init;
  });
  const inputRefs = useRef({});
  const [errors, setErrors] = useState({});
  const [submitLocked, setSubmitLocked] = useState(false);
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
    let v = value.replace(/^(\d{4})\.(\d{2})\.(\d{2})/, '$1-$2-$3');
    const isoRe = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;
    if (isoRe.test(v)) {
      const d = new Date(v);
      if (format === 'YYYY-MM-DD') return d.toISOString().slice(0, 10);
      if (format === 'HH:MM:SS') return d.toISOString().slice(11, 19);
      return d.toISOString().slice(0, 19).replace('T', ' ');
    }
    return v;
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
      const raw = row ? String(row[c] ?? '') : '';
      vals[c] = placeholders[c] ? normalizeDateInput(raw, placeholders[c]) : raw;
    });
    setFormVals(vals);
    inputRefs.current = {};
    setErrors({});
  }, [row, columns, visible, placeholders]);

  if (!visible) return null;

  const headerSet = new Set(headerFields);
  const footerSet = new Set(footerFields);
  const mainSet = new Set(mainFields);
  const totalAmountSet = new Set(totalAmountFields);
  const totalCurrencySet = new Set(totalCurrencyFields);
  const headerCols = columns.filter((c) => headerSet.has(c));
  const footerCols = columns.filter((c) => footerSet.has(c));
  const mainCols =
    mainFields.length > 0
      ? columns.filter((c) => mainSet.has(c))
      : columns.filter((c) => !headerSet.has(c) && !footerSet.has(c));

  const formStyle = {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '0.75rem 1rem',
  };

  function handleKeyDown(e, col) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    let val = normalizeDateInput(e.target.value, placeholders[col]);
    if (formVals[col] !== val) {
      setFormVals((v) => ({ ...v, [col]: val }));
      onChange({ [col]: val });
      if (val !== e.target.value) e.target.value = val;
    }
    if (placeholders[col] && !isValidDate(val, placeholders[col])) {
      setErrors((er) => ({ ...er, [col]: 'Invalid date' }));
      return;
    }
    if (requiredFields.includes(col) && !val) {
      setErrors((er) => ({ ...er, [col]: 'Please enter value' }));
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
    const errs = {};
    requiredFields.forEach((f) => {
      if (columns.includes(f) && !formVals[f]) {
        errs[f] = 'Please enter value';
      }
    });
    setErrors(errs);
    if (Object.keys(errs).length === 0) {
      const ok = window.confirm(
        'Save this transaction? Have you checked all data and accept responsibility?',
      );
      if (ok) {
        const normalized = {};
        Object.entries(formVals).forEach(([k, v]) => {
          normalized[k] = placeholders[k]
            ? normalizeDateInput(v, placeholders[k])
            : v;
        });
        await Promise.resolve(onSubmit(normalized));
      } else {
        setSubmitLocked(false);
        return;
      }
    }
    setSubmitLocked(false);
  }
  function renderField(c, withLabel = true) {
    const err = errors[c];
    const inputStyle = {
      width: '100%',
      padding: '0.5rem',
      border: err ? '1px solid red' : '1px solid #ccc',
    };

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
          setFormVals((v) => ({ ...v, [c]: e.target.value }));
          setErrors((er) => ({ ...er, [c]: undefined }));
          onChange({ [c]: e.target.value });
        }}
        onKeyDown={(e) => handleKeyDown(e, c)}
        disabled={row && disabledFields.includes(c)}
        style={inputStyle}
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
          setFormVals((v) => ({ ...v, [c]: e.target.value }));
          setErrors((er) => ({ ...er, [c]: undefined }));
          onChange({ [c]: e.target.value });
        }}
        onKeyDown={(e) => handleKeyDown(e, c)}
        onFocus={(e) => e.target.select()}
        disabled={row && disabledFields.includes(c)}
        style={inputStyle}
      />
    );

    if (!withLabel) return <>{control}</>;

    return (
      <div key={c} style={{ marginBottom: '0.75rem' }}>
        <label style={{ display: 'block', marginBottom: '0.25rem' }}>
          {labels[c] || c}
          {requiredFields.includes(c) && <span style={{ color: 'red' }}>*</span>}
        </label>
        {control}
        {err && <div style={{ color: 'red', fontSize: '0.8rem' }}>{err}</div>}
      </div>
    );
  }

  function renderMainTable(cols) {
    if (cols.length === 0) return null;
    const totals = {};
    cols.forEach((c) => {
      if (totalAmountSet.has(c) || totalCurrencySet.has(c)) {
        totals[c] = Number(formVals[c] || 0);
      }
    });
    return (
      <div style={{ marginBottom: '1rem' }}>
        <h3 style={{ marginTop: 0 }}>Main</h3>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {cols.map((c) => (
                <th
                  key={c}
                  style={{ border: '1px solid #ccc', padding: '0.25rem' }}
                >
                  {labels[c] || c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              {cols.map((c) => (
                <td
                  key={c}
                  style={{ border: '1px solid #ccc', padding: '0.25rem' }}
                >
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
                      style={{
                        border: '1px solid #ccc',
                        padding: '0.25rem',
                        fontWeight: 'bold',
                      }}
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

  function renderSection(title, cols) {
    if (cols.length === 0) return null;
    return (
      <div style={{ marginBottom: '1rem' }}>
        <h3 style={{ marginTop: 0 }}>{title}</h3>
        <div style={formStyle}>{cols.map((c) => renderField(c))}</div>
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
          skipEmpty ? formVals[c] !== '' && formVals[c] !== null && formVals[c] !== 0 : true,
        )
        .map(
          (c) =>
            `<tr><th>${labels[c] || c}</th><td>${
              formVals[c] !== undefined ? formVals[c] : ''
            }</td></tr>`,
        )
        .join('');

    let html = '<html><head><title>Print</title>';
    html +=
      '<style>table{width:100%;border-collapse:collapse;margin-bottom:1rem;}th,td{border:1px solid #666;padding:4px;text-align:left;}h3{margin:0 0 4px 0;}</style>';
    html += '</head><body>';
    if (h.length) html += `<h3>Header</h3><table>${rowHtml(h)}</table>`;
    if (m.length) html += `<h3>Main</h3><table>${rowHtml(m, true)}</table>`;
    if (f.length) html += `<h3>Footer</h3><table>${rowHtml(f)}</table>`;
    html += '</body></html>';
    const w = window.open('', '_blank');
    w.document.write(html);
    w.document.close();
    w.focus();
    w.print();
  }

  return (
    <Modal visible={visible} title={row ? 'Edit Row' : 'Add Row'} onClose={onCancel} width="70vw">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submitForm();
        }}
      >
        {renderSection('Header', headerCols)}
        {renderMainTable(mainCols)}
        {renderSection('Footer', footerCols)}
        <div style={{ textAlign: 'right', marginTop: '0.5rem' }}>
          <button type="button" onClick={() => handlePrint('emp')} style={{ marginRight: '0.5rem' }}>
            Print Emp
          </button>
          <button type="button" onClick={() => handlePrint('cust')} style={{ marginRight: '0.5rem' }}>
            Print Cust
          </button>
          <button type="button" onClick={onCancel} style={{ marginRight: '0.5rem' }}>
            Cancel
          </button>
          <button type="submit">Save</button>
        </div>
        <div style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: '#555' }}>
          Press <strong>Enter</strong> to move to next field. The field will be automatically selected. Use arrow keys to navigate selections.
        </div>
      </form>
    </Modal>
  );
}
