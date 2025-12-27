import React, { useId, useMemo, useState, useCallback } from 'react';

function makeKey(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export default function TagMultiSelect({
  value = [],
  options = [],
  placeholder = '',
  disabled = false,
  onChange = () => {},
  inputRef = null,
  onFocus = () => {},
  onKeyDown = () => {},
  inputStyle = {},
}) {
  const listId = useId();
  const [input, setInput] = useState('');
  const normalizedValue = useMemo(
    () =>
      Array.isArray(value)
        ? value.filter((v) => v !== undefined && v !== null && v !== '')
        : [],
    [value],
  );
  const optionMap = useMemo(() => {
    const map = new Map();
    options.forEach((opt) => {
      if (!opt) return;
      const key = makeKey(opt.value);
      if (!key) return;
      map.set(key, opt);
      map.set(makeKey(String(opt.value)), opt);
    });
    return map;
  }, [options]);

  const labelFor = useCallback(
    (val) => {
      const key = makeKey(val);
      const opt = optionMap.get(key) || optionMap.get(makeKey(String(val)));
      if (opt && opt.label !== undefined && opt.label !== null) return opt.label;
      if (val === undefined || val === null) return '';
      return String(val);
    },
    [optionMap],
  );

  const emit = useCallback(
    (next) => {
      const keys = new Set();
      const unique = [];
      next.forEach((val) => {
        const key = makeKey(val);
        if (!key || keys.has(key)) return;
        keys.add(key);
        unique.push(val);
      });
      onChange(unique);
    },
    [onChange],
  );

  const addValue = useCallback(
    (rawInput) => {
      const trimmed = String(rawInput || '').trim();
      if (!trimmed) return;
      const entries = trimmed.split(',').map((part) => part.trim()).filter(Boolean);
      if (entries.length === 0) return;

      const nextValues = [...normalizedValue];
      entries.forEach((entry) => {
        const normalized = entry.toLowerCase();
        const match =
          options.find(
            (opt) =>
              String(opt.value ?? '').toLowerCase() === normalized ||
              String(opt.label ?? '').toLowerCase() === normalized,
          ) || optionMap.get(makeKey(entry)) || optionMap.get(makeKey(String(entry)));
        const val = match ? match.value : entry;
        const key = makeKey(val);
        if (!key) return;
        const exists = nextValues.some((existing) => makeKey(existing) === key);
        if (!exists) nextValues.push(val);
      });
      emit(nextValues);
      setInput('');
    },
    [emit, normalizedValue, optionMap, options],
  );

  const removeValue = useCallback(
    (target) => {
      const key = makeKey(target);
      emit(normalizedValue.filter((val) => makeKey(val) !== key));
    },
    [emit, normalizedValue],
  );

  const handleKeyDown = useCallback(
    (e) => {
      onKeyDown(e);
      if (disabled) return;
      if (e.key === 'Enter') {
        e.preventDefault();
        addValue(input);
      } else if (e.key === 'Backspace' && !input) {
        removeValue(normalizedValue[normalizedValue.length - 1]);
      }
    },
    [addValue, disabled, input, normalizedValue, onKeyDown, removeValue],
  );

  const filteredOptions = useMemo(() => {
    const query = input.trim().toLowerCase();
    if (!Array.isArray(options)) return [];
    return options.filter((opt) => {
      if (!opt) return false;
      const valueKey = makeKey(opt.value);
      if (normalizedValue.some((val) => makeKey(val) === valueKey)) return false;
      if (!query) return true;
      return (
        String(opt.value ?? '').toLowerCase().includes(query) ||
        String(opt.label ?? '').toLowerCase().includes(query)
      );
    });
  }, [input, normalizedValue, options]);

  return (
    <div
      className="border rounded px-1 py-1 bg-white"
      style={{ minHeight: '2.25rem', display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}
      onClick={(e) => {
        const el = e.currentTarget.querySelector('input');
        if (el) el.focus();
      }}
    >
      {normalizedValue.map((val) => (
        <span
          key={makeKey(val)}
          className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-full px-2 py-0.5"
        >
          <span style={{ maxWidth: '12ch', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {labelFor(val)}
          </span>
          {!disabled && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                removeValue(val);
              }}
              aria-label="Remove"
              style={{
                border: 'none',
                background: 'transparent',
                color: 'inherit',
                cursor: 'pointer',
              }}
            >
              ×
            </button>
          )}
        </span>
      ))}
      <input
        ref={inputRef}
        list={listId}
        disabled={disabled}
        value={input}
        placeholder={normalizedValue.length === 0 ? placeholder : ''}
        onChange={(e) => setInput(e.target.value)}
        onBlur={() => addValue(input)}
        onFocus={onFocus}
        onKeyDown={handleKeyDown}
        style={{ flex: 1, minWidth: '6ch', border: 'none', outline: 'none', ...inputStyle }}
      />
      <datalist id={listId}>
        {filteredOptions.map((opt) => (
          <option key={makeKey(opt.value)} value={String(opt.value)}>
            {opt.label}
          </option>
        ))}
      </datalist>
    </div>
  );
}
