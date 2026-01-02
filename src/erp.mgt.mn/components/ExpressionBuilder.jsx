import React, { useMemo, useRef, useState } from 'react';

export const EXPRESSION_FUNCTIONS = ['sum', 'count', 'min', 'max', 'avg'];
const EXPRESSION_OPERATOR_BUTTONS = ['+', '-', '*', '/', '(', ')'];

const defaultStyles = {
  textarea: {
    width: '100%',
    minHeight: '72px',
    padding: '0.5rem 0.65rem',
    borderRadius: '8px',
    border: '1px solid #e5e7eb',
    fontSize: '0.95rem',
  },
  miniToggleButton: {
    padding: '0.3rem 0.55rem',
    borderRadius: '6px',
    border: '1px solid #e5e7eb',
    background: '#f8fafc',
    cursor: 'pointer',
  },
  smallButton: {
    padding: '0.45rem 0.8rem',
    borderRadius: '6px',
    border: '1px solid #d9e2ec',
    background: '#f1f5f9',
    cursor: 'pointer',
  },
  hintDescription: {
    color: '#475569',
    margin: 0,
  },
  input: {
    padding: '0.45rem 0.55rem',
    borderRadius: '6px',
    border: '1px solid #e5e7eb',
    width: '100%',
  },
};

export function validateExpressionSyntax(expression = '') {
  const trimmed = (expression || '').trim();
  if (!trimmed) {
    return {
      status: 'empty',
      message: 'Enter a formula using field paths, functions, or arithmetic operators.',
      numericLikely: false,
    };
  }
  let balance = 0;
  for (const char of trimmed) {
    if (char === '(') balance += 1;
    if (char === ')') balance -= 1;
    if (balance < 0) break;
  }
  if (balance !== 0) {
    return {
      status: 'error',
      message: 'Parentheses are unbalanced. Add or remove brackets until they match.',
      numericLikely: false,
    };
  }
  const invalidChar = trimmed.match(/[^a-zA-Z0-9_$.\[\]\s()+\-*/%,]/);
  if (invalidChar) {
    return {
      status: 'error',
      message: `Unsupported character "${invalidChar[0]}". Use field paths, numbers, functions, and arithmetic symbols only.`,
      numericLikely: false,
    };
  }
  const hasFunction = /(sum|count|min|max|avg)\s*\(/i.test(trimmed);
  const hasOperator = /[+\-*/]/.test(trimmed);
  const hasNumericLiteral = /\b\d+(\.\d+)?\b/.test(trimmed);
  const numericLikely = hasFunction || hasOperator || hasNumericLiteral;
  return {
    status: 'ok',
    message: numericLikely
      ? 'Expression looks valid and should return a number when inputs are numeric.'
      : 'Expression looks valid; result type depends on referenced fields.',
    numericLikely,
  };
}

export default function ExpressionBuilder({
  value,
  onChange,
  fieldOptions = [],
  datalistId,
  functionOptions = EXPRESSION_FUNCTIONS,
  helperLabel = 'Quick aggregate helper',
  placeholder = 'sum(receipts[].items[].unitPrice * receipts[].items[].qty)',
  styles = {},
}) {
  const inputRef = useRef(null);
  const [selectedField, setSelectedField] = useState('');
  const [selectedFunction, setSelectedFunction] = useState(functionOptions[0] || 'sum');
  const mergedStyles = {
    textarea: { ...defaultStyles.textarea, ...(styles.textarea || {}) },
    miniToggleButton: { ...defaultStyles.miniToggleButton, ...(styles.miniToggleButton || {}) },
    smallButton: { ...defaultStyles.smallButton, ...(styles.smallButton || {}) },
    hintDescription: { ...defaultStyles.hintDescription, ...(styles.hintDescription || {}) },
    input: { ...defaultStyles.input, ...(styles.input || {}) },
  };
  const validation = useMemo(() => validateExpressionSyntax(value), [value]);

  const insertToken = (token, cursorOffset = 0) => {
    const control = inputRef.current;
    const currentValue = value || '';
    if (!control) {
      const nextValue = `${currentValue}${token}`;
      onChange(nextValue);
      return;
    }
    const start = control.selectionStart ?? currentValue.length;
    const end = control.selectionEnd ?? currentValue.length;
    const before = currentValue.slice(0, start);
    const after = currentValue.slice(end);
    const nextValue = `${before}${token}${after}`;
    const nextCursor = start + token.length + cursorOffset;
    onChange(nextValue);
    requestAnimationFrame(() => {
      control.focus();
      control.setSelectionRange(nextCursor, nextCursor);
    });
  };

  const handleInsertFunction = (fn) => {
    const token = `${fn}()`;
    insertToken(token, -1);
  };

  const handleInsertOperator = (op) => {
    const spaced = ` ${op} `;
    insertToken(spaced, 0);
  };

  const handleInsertField = () => {
    if (!selectedField || !selectedField.trim()) return;
    insertToken(selectedField.trim(), 0);
  };

  const handleQuickAggregate = () => {
    if (!selectedField || !selectedFunction) return;
    const expression = `${selectedFunction}(${selectedField})`;
    onChange(expression);
  };

  const validationColor =
    validation.status === 'error' ? '#b91c1c' : validation.numericLikely ? '#065f46' : '#0f172a';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
      <textarea
        ref={inputRef}
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={mergedStyles.textarea}
      />
      <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
        {functionOptions.map((fn) => (
          <button
            type="button"
            key={`expr-fn-${fn}`}
            onClick={() => handleInsertFunction(fn)}
            style={mergedStyles.miniToggleButton}
          >
            {fn}()
          </button>
        ))}
        {EXPRESSION_OPERATOR_BUTTONS.map((op) => (
          <button
            type="button"
            key={`expr-op-${op}`}
            onClick={() => handleInsertOperator(op)}
            style={mergedStyles.miniToggleButton}
          >
            {op}
          </button>
        ))}
      </div>
      {fieldOptions.length > 0 && (
        <div
          style={{
            display: 'grid',
            gap: '0.35rem',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          }}
        >
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <span style={{ fontWeight: 600 }}>{helperLabel}</span>
            <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
              <select
                value={selectedFunction}
                onChange={(e) => setSelectedFunction(e.target.value)}
                style={{ minWidth: '120px' }}
              >
                {functionOptions.map((fn) => (
                  <option key={`quick-fn-${fn}`} value={fn}>
                    {fn}
                  </option>
                ))}
              </select>
              <div style={{ display: 'flex', gap: '0.35rem', flex: '1 1 220px' }}>
                <input
                  type="text"
                  list={datalistId}
                  value={selectedField}
                  onChange={(e) => setSelectedField(e.target.value)}
                  placeholder="receipts[].items[].unitPrice"
                  style={{ ...mergedStyles.input, flex: '1 1 220px' }}
                />
                <button type="button" onClick={handleQuickAggregate} style={mergedStyles.smallButton}>
                  Build
                </button>
              </div>
            </div>
            <p style={mergedStyles.hintDescription}>
              The quick helper converts your selection into an expression (e.g., sum(path)). You can
              further edit the formula above to add arithmetic or additional fields.
            </p>
            <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
              <button type="button" onClick={handleInsertField} style={mergedStyles.miniToggleButton}>
                Insert field
              </button>
              <button type="button" onClick={() => setSelectedField('')} style={mergedStyles.miniToggleButton}>
                Clear field
              </button>
            </div>
            <datalist id={datalistId}>
              {fieldOptions.map((opt) => (
                <option key={`${datalistId}-${opt}`} value={opt} />
              ))}
            </datalist>
          </label>
        </div>
      )}
      <p style={{ ...mergedStyles.hintDescription, color: validationColor }}>{validation.message}</p>
    </div>
  );
}
