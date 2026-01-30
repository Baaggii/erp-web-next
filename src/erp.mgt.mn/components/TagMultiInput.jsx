import React, { useMemo, useState } from 'react';

export default function TagMultiInput({
  value = [],
  onChange,
  placeholder = '',
  inputStyle = {},
  disabled = false,
  onFocus,
  onKeyDown,
}) {
  const [input, setInput] = useState('');
  const tags = useMemo(() => {
    if (!Array.isArray(value)) return [];
    return value.filter((v) => v !== undefined && v !== null);
  }, [value]);

  const commitToken = (token) => {
    if (token === undefined || token === null) return;
    const trimmed = String(token).trim();
    if (!trimmed) return;
    const exists = tags.some((t) => String(t) === trimmed);
    if (exists) return;
    if (onChange) onChange([...tags, trimmed]);
    setInput('');
  };

  const removeToken = (token) => {
    if (onChange) {
      onChange(tags.filter((t) => String(t) !== String(token)));
    }
  };

  return (
    <div
      style={{
        border: '1px solid #d1d5db',
        borderRadius: '4px',
        padding: '0.25rem',
        minHeight: '38px',
        background: disabled ? '#f3f4f6' : 'white',
      }}
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
        {tags.map((tag) => (
          <span
            key={String(tag)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.25rem',
              padding: '0.1rem 0.4rem',
              background: '#e5e7eb',
              borderRadius: '9999px',
              fontSize: '0.85rem',
            }}
          >
            {tag}
            {!disabled && (
              <button
                type="button"
                onClick={() => removeToken(tag)}
                style={{
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  padding: 0,
                  lineHeight: 1,
                }}
                aria-label="Remove"
              >
                ×
              </button>
            )}
          </span>
        ))}
        {!disabled && (
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ',' || e.key === 'Tab') {
                e.preventDefault();
                commitToken(input);
              }
              if (onKeyDown) onKeyDown(e);
            }}
            onBlur={() => commitToken(input)}
            placeholder={tags.length === 0 ? placeholder : ''}
            style={{
              border: 'none',
              outline: 'none',
              minWidth: '80px',
              flex: 1,
              ...inputStyle,
            }}
            onFocus={onFocus}
          />
        )}
      </div>
    </div>
  );
}
