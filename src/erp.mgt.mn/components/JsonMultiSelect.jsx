import React, { useMemo, useState } from 'react';

export default function JsonMultiSelect({
  value = [],
  onChange = () => {},
  options = [],
  placeholder = 'Add value',
  disabled = false,
  allowCustomValues = true,
  resolveLabel,
  inputId,
}) {
  const [input, setInput] = useState('');
  const normalized = Array.isArray(value)
    ? value
    : value === undefined || value === null || value === ''
    ? []
    : [value];

  const optionLookup = useMemo(() => {
    const map = new Map();
    options.forEach((opt) => {
      if (!opt || opt.value === undefined || opt.value === null) return;
      const key = String(opt.value);
      if (!map.has(key)) {
        map.set(key, opt.label ?? String(opt.value));
      }
    });
    return map;
  }, [options]);

  const removeAt = (idx) => {
    const next = normalized.filter((_, i) => i !== idx);
    onChange(next);
  };

  const coerceValue = (raw) => {
    const match = options.find((opt) => String(opt?.value) === String(raw));
    return match ? match.value : raw;
  };

  const addValue = (raw) => {
    if (raw === undefined || raw === null || raw === '') return;
    const candidate = coerceValue(raw);
    const exists = normalized.some((entry) => String(entry) === String(candidate));
    if (exists) return;
    onChange([...normalized, candidate]);
    setInput('');
  };

  const handleSelectChange = (e) => {
    const val = e.target.value;
    if (!val) return;
    addValue(val);
    e.target.value = '';
  };

  const handleKeyDown = (e) => {
    if (!allowCustomValues) return;
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const next = input.trim();
      if (next) addValue(next);
    }
  };

  const renderLabel = (val) => {
    const resolved = resolveLabel ? resolveLabel(val) : undefined;
    if (resolved !== undefined && resolved !== null && resolved !== '') return resolved;
    const lookup = optionLookup.get(String(val));
    if (lookup !== undefined) return lookup;
    if (val === null || val === undefined) return '';
    return typeof val === 'string' ? val : String(val);
  };

  return (
    <div className="flex flex-wrap items-center gap-1">
      {normalized.map((val, idx) => (
        <span
          key={`${String(val)}-${idx}`}
          className="flex items-center gap-1 bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full text-xs"
        >
          <span>{renderLabel(val)}</span>
          {!disabled && (
            <button
              type="button"
              onClick={() => removeAt(idx)}
              aria-label="Remove"
              className="text-blue-700"
            >
              &times;
            </button>
          )}
        </span>
      ))}
      {!disabled && options.length > 0 && (
        <select
          value=""
          onChange={handleSelectChange}
          className="border rounded px-2 py-1 text-sm"
        >
          <option value="">{placeholder}</option>
          {options.map((opt) => (
            <option key={String(opt.value)} value={String(opt.value)}>
              {opt.label ?? opt.value}
            </option>
          ))}
        </select>
      )}
      {!disabled && allowCustomValues && (
        <input
          id={inputId}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="border rounded px-2 py-1 text-sm"
          style={{ minWidth: '8rem' }}
        />
      )}
    </div>
  );
}
