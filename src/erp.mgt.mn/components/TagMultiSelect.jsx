import React, { useMemo, useState, useCallback } from 'react';

function serializeKey(value) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'object') {
    if (Object.prototype.hasOwnProperty.call(value, 'value')) {
      return serializeKey(value.value);
    }
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

function getLabelForValue(value, optionMap) {
  const key = serializeKey(value);
  const opt = optionMap.get(key);
  if (opt && opt.label !== undefined && opt.label !== null && opt.label !== '') {
    return opt.label;
  }
  if (typeof value === 'object') {
    if (Object.prototype.hasOwnProperty.call(value, 'label')) {
      return value.label;
    }
    if (Object.prototype.hasOwnProperty.call(value, 'name')) {
      return value.name;
    }
    if (Object.prototype.hasOwnProperty.call(value, 'title')) {
      return value.title;
    }
  }
  return value === undefined || value === null ? '' : String(value);
}

export default function TagMultiSelect({
  value = [],
  options = [],
  onChange,
  placeholder = '',
  disabled = false,
  inputRef = null,
  onKeyDown = null,
  inputStyle = {},
  allowCustom = true,
}) {
  const normalized = useMemo(() => {
    if (Array.isArray(value)) return value.filter((v) => v !== undefined && v !== null);
    if (value === undefined || value === null || value === '') return [];
    return [value];
  }, [value]);

  const optionMap = useMemo(() => {
    const map = new Map();
    (options || []).forEach((opt) => {
      if (!opt) return;
      const key = serializeKey(opt.value);
      if (!map.has(key)) map.set(key, opt);
    });
    return map;
  }, [options]);

  const selectedKeys = useMemo(
    () => new Set(normalized.map((item) => serializeKey(item))),
    [normalized],
  );

  const [draft, setDraft] = useState('');

  const addValue = useCallback(
    (val) => {
      if (!onChange) return;
      const key = serializeKey(val);
      if (!key && key !== '0') return;
      if (selectedKeys.has(key)) {
        setDraft('');
        return;
      }
      onChange([...normalized, val]);
      setDraft('');
    },
    [normalized, onChange, selectedKeys],
  );

  const handleRemove = useCallback(
    (key) => {
      if (!onChange) return;
      const next = normalized.filter((item) => serializeKey(item) !== key);
      onChange(next);
    },
    [normalized, onChange],
  );

  const availableOptions = useMemo(
    () =>
      (options || []).filter(
        (opt) => !selectedKeys.has(serializeKey(opt?.value)),
      ),
    [options, selectedKeys],
  );

  const handleDraftSubmit = useCallback(
    (e) => {
      if (e) e.preventDefault();
      if (!allowCustom) return;
      const trimmed = draft.trim();
      if (!trimmed) return;
      addValue(trimmed);
    },
    [allowCustom, addValue, draft],
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
        {normalized.map((item, idx) => {
          const key = serializeKey(item) || `item-${idx}`;
          const label = getLabelForValue(item, optionMap);
          return (
            <span
              key={key}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                padding: '0.2rem 0.45rem',
                backgroundColor: '#e5e7eb',
                borderRadius: '9999px',
                fontSize: '0.8rem',
              }}
              title={label}
            >
              <span>{label}</span>
              {!disabled && (
                <button
                  type="button"
                  onClick={() => handleRemove(key)}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    cursor: 'pointer',
                    fontWeight: 700,
                    lineHeight: 1,
                  }}
                  aria-label="Remove"
                >
                  ×
                </button>
              )}
            </span>
          );
        })}
      </div>
      {!disabled && (
        <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
          {availableOptions.length > 0 && (
            <select
              value=""
              onChange={(e) => {
                const key = e.target.value;
                if (!key) return;
                const opt = optionMap.get(key);
                if (opt) addValue(opt.value);
              }}
              style={{ minWidth: '8rem', ...inputStyle }}
            >
              <option value="">-- select --</option>
              {availableOptions.map((opt) => (
                <option key={serializeKey(opt.value)} value={serializeKey(opt.value)}>
                  {opt.label ?? opt.value}
                </option>
              ))}
            </select>
          )}
          {allowCustom && (
            <form onSubmit={handleDraftSubmit} style={{ display: 'flex', gap: '0.25rem' }}>
              <input
                ref={inputRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (onKeyDown) onKeyDown(e);
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleDraftSubmit();
                  }
                }}
                placeholder={placeholder}
                style={{ minWidth: '8rem', ...inputStyle }}
              />
              <button type="submit" style={{ padding: '0.25rem 0.5rem' }}>
                Add
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
