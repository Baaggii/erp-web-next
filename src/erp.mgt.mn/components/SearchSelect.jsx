import React, { useState, useEffect, useRef } from 'react';

export default function SearchSelect({
  value,
  onChange,
  options = [],
  disabled,
  inputRef,
  placeholder,
  ...rest
}) {
  const [input, setInput] = useState(value || '');
  const [show, setShow] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const containerRef = useRef(null);

  useEffect(() => {
    setInput(value || '');
  }, [value]);

  const filtered = options.filter((o) => {
    const txt = (o.label || '').toLowerCase();
    const val = String(o.value).toLowerCase();
    const f = input.toLowerCase();
    return txt.includes(f) || val.includes(f);
  });

  const match = options.find((o) => String(o.value) === String(input));

  function handleKeyDown(e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      let idx = highlight;
      if (idx < 0 && filtered.length > 0) idx = 0;
      if (idx >= 0 && idx < filtered.length) {
        e.preventDefault();
        const opt = filtered[idx];
        onChange(opt.value);
        setInput(String(opt.value));
        setShow(false);
      }
    }
  }

  function handleBlur() {
    setTimeout(() => setShow(false), 100);
  }

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <input
        ref={inputRef}
        value={input}
        onChange={(e) => {
          setInput(e.target.value);
          onChange(e.target.value);
          setShow(true);
          setHighlight(-1);
        }}
        onFocus={() => setShow(true)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        style={{ width: '100%', padding: '0.5rem' }}
        {...rest}
      />
      {show && filtered.length > 0 && (
        <ul
          style={{
            position: 'absolute',
            zIndex: 10,
            listStyle: 'none',
            margin: 0,
            padding: 0,
            background: '#fff',
            border: '1px solid #ccc',
            boxSizing: 'border-box',
            width: '100%',
            maxHeight: '150px',
            overflowY: 'auto',
          }}
        >
          {filtered.slice(0, 50).map((opt, idx) => (
            <li
              key={opt.value}
              onMouseDown={() => {
                onChange(opt.value);
                setInput(String(opt.value));
                setShow(false);
              }}
              onMouseEnter={() => setHighlight(idx)}
              style={{
                padding: '0.25rem',
                background: highlight === idx ? '#eee' : '#fff',
                cursor: 'pointer',
              }}
            >
              {opt.label || opt.value}
            </li>
          ))}
        </ul>
      )}
      {match && (
        <div style={{ fontSize: '0.8rem', color: '#555' }}>{match.label}</div>
      )}
    </div>
  );
}
