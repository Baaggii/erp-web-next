import React, { useEffect, useMemo, useState } from 'react';
import AsyncSearchSelect from './AsyncSearchSelect.jsx';
import TooltipWrapper from './TooltipWrapper.jsx';

function normalizeArrayValue(value) {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null) return [];
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      /* ignore */
    }
    return trimmed.split(',').map((v) => v.trim()).filter(Boolean);
  }
  return [value];
}

export default function MultiReferenceInput({
  value = [],
  onChange = () => {},
  relationConfig = null,
  labelFields = [],
  companyId = null,
  disabled = false,
  inputStyle = {},
  title = '',
}) {
  const [items, setItems] = useState(() => normalizeArrayValue(value));
  const [pending, setPending] = useState('');

  useEffect(() => {
    setItems(normalizeArrayValue(value));
  }, [value]);

  const normalizedLabelFields = useMemo(() => labelFields || [], [labelFields]);

  const addItem = (item) => {
    if (item === undefined || item === null || item === '') return;
    const normalized = Array.isArray(item) ? item : [item];
    setItems((prev) => {
      const merged = [...prev];
      normalized.forEach((entry) => {
        const key = typeof entry === 'object' ? entry.value ?? entry.id ?? entry : entry;
        const strKey = key === undefined || key === null ? '' : String(key);
        if (!strKey) return;
        if (!merged.some((m) => String(m) === strKey)) merged.push(entry);
      });
      const next = merged;
      onChange(next);
      return next;
    });
  };

  const removeItem = (item) => {
    setItems((prev) => {
      const next = prev.filter((entry) => String(entry) !== String(item));
      onChange(next);
      return next;
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
      {relationConfig && (
        <AsyncSearchSelect
          title={title}
          table={relationConfig.table}
          searchColumn={relationConfig.idField || relationConfig.column}
          searchColumns={[
            relationConfig.idField || relationConfig.column,
            ...(relationConfig.displayFields || []),
          ]}
          labelFields={relationConfig.displayFields || normalizedLabelFields}
          value=""
          onChange={() => {}}
          onSelect={(opt) => {
            if (opt && opt.value !== undefined) addItem(opt.value);
          }}
          disabled={disabled}
          inputStyle={inputStyle}
          companyId={companyId}
        />
      )}
      <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
        <input
          type="text"
          value={pending}
          onChange={(e) => setPending(e.target.value)}
          disabled={disabled}
          style={{ flex: 1, ...inputStyle }}
          placeholder="Add value and press +"
        />
        <button
          type="button"
          onClick={() => {
            addItem(pending);
            setPending('');
          }}
          disabled={disabled}
        >
          +
        </button>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
        {items.length === 0 && (
          <TooltipWrapper title={title}>
            <span style={{ color: '#6b7280', fontSize: '0.85rem' }}>
              No values selected
            </span>
          </TooltipWrapper>
        )}
        {items.map((item) => (
          <span
            key={String(item)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.25rem',
              padding: '0.2rem 0.45rem',
              background: '#eef2ff',
              borderRadius: '9999px',
              fontSize: '0.85rem',
              border: '1px solid #c7d2fe',
            }}
          >
            {String(item)}
            {!disabled && (
              <button
                type="button"
                onClick={() => removeItem(item)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#4b5563',
                }}
              >
                ×
              </button>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}
