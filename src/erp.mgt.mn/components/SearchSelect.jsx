import React, { useState } from 'react';

export default function SearchSelect({ value, onChange, options = [], disabled, inputRef, onKeyDown }) {
  const [filter, setFilter] = useState('');
  const id = React.useId();

  const filtered = options.filter((o) => {
    const txt = (o.label || '').toLowerCase();
    const val = String(o.value).toLowerCase();
    const f = filter.toLowerCase();
    return txt.includes(f) || val.includes(f);
  });

  const match = options.find((o) => String(o.value) === String(value));

  return (
    <div>
      <input
        list={id}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setFilter(e.target.value);
        }}
        disabled={disabled}
        style={{ width: '100%', padding: '0.5rem' }}
        ref={inputRef}
        onKeyDown={onKeyDown}
      />
      <datalist id={id}>
        {filtered.slice(0, 50).map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </datalist>
      {match && (
        <div style={{ fontSize: '0.8rem', color: '#555' }}>{match.label}</div>
      )}
    </div>
  );
}
