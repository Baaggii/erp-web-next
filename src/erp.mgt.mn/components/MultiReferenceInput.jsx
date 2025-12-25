import React, { useEffect, useMemo, useState } from 'react';
import AsyncSearchSelect from './AsyncSearchSelect.jsx';

function toArray(value) {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined || value === '') return [];
  return [value];
}

export default function MultiReferenceInput({
  value,
  onChange,
  relationConfig,
  disabled = false,
  companyId,
  placeholder = 'Add value',
  labelMap = {},
}) {
  const [pending, setPending] = useState('');

  const selected = useMemo(
    () =>
      toArray(value)
        .map((item) => (typeof item === 'object' && item !== null ? item.value ?? item.id ?? item : item))
        .filter((item) => item !== null && item !== undefined && item !== ''),
    [value],
  );

  useEffect(() => {
    setPending('');
  }, [relationConfig?.table]);

  const addValue = (nextValue) => {
    if (nextValue === undefined || nextValue === null || nextValue === '') return;
    const normalized = Array.isArray(nextValue) ? nextValue : [nextValue];
    const deduped = [...selected];
    normalized.forEach((item) => {
      if (!deduped.some((existing) => String(existing) === String(item))) {
        deduped.push(item);
      }
    });
    onChange(deduped);
    setPending('');
  };

  const removeValue = (val) => {
    const filtered = selected.filter((item) => String(item) !== String(val));
    onChange(filtered);
  };

  const renderLabel = (val) => {
    const key = String(val);
    if (labelMap && Object.prototype.hasOwnProperty.call(labelMap, key)) {
      return labelMap[key];
    }
    return key;
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.35rem' }}>
        {selected.length === 0 && <span style={{ color: '#6b7280' }}>No values</span>}
        {selected.map((item) => (
          <span
            key={String(item)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.25rem',
              background: '#eef2ff',
              border: '1px solid #c7d2fe',
              borderRadius: '999px',
              padding: '0.25rem 0.5rem',
            }}
          >
            {renderLabel(item)}
            {!disabled && (
              <button
                type="button"
                onClick={() => removeValue(item)}
                style={{
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  lineHeight: 1,
                }}
                aria-label="Remove"
              >
                ×
              </button>
            )}
          </span>
        ))}
      </div>
      {relationConfig ? (
        <AsyncSearchSelect
          table={relationConfig.table}
          searchColumn={relationConfig.idField || relationConfig.column}
          searchColumns={[
            relationConfig.idField || relationConfig.column,
            ...(relationConfig.displayFields || []),
          ]}
          labelFields={relationConfig.displayFields || []}
          idField={relationConfig.idField || relationConfig.column}
          value={pending}
          onChange={(val) => setPending(val)}
          onSelect={(opt) => addValue(opt?.value ?? opt)}
          inputStyle={{ minWidth: '14rem' }}
          disabled={disabled}
          companyId={companyId}
        />
      ) : (
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <input
            value={pending}
            onChange={(e) => setPending(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addValue(pending.trim());
              }
            }}
            placeholder={placeholder}
            disabled={disabled}
            style={{ flex: 1, minWidth: '10rem' }}
          />
          <button type="button" onClick={() => addValue(pending.trim())} disabled={disabled}>
            Add
          </button>
        </div>
      )}
    </div>
  );
}
