import React, { useState, useEffect, useRef } from 'react';

export default function AsyncSearchSelect({
  table,
  searchColumn,
  labelFields = [],
  value,
  onChange,
  disabled,
  onKeyDown,
  inputRef,
  onFocus,
  inputStyle = {},
  ...rest
}) {
  const [input, setInput] = useState(value || '');
  const [options, setOptions] = useState([]);
  const [show, setShow] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const containerRef = useRef(null);
  const match = options.find((o) => String(o.value) === String(input));

  useEffect(() => {
    setInput(value || '');
  }, [value]);

  useEffect(() => {
    if (!table || !searchColumn) return;
    const controller = new AbortController();
    async function load() {
      try {
        const params = new URLSearchParams({ perPage: 1000 });
        if (input) params.set(searchColumn, input);
        const res = await fetch(
          `/api/tables/${encodeURIComponent(table)}?${params.toString()}`,
          { credentials: 'include', signal: controller.signal },
        );
        const json = await res.json();
        if (Array.isArray(json.rows)) {
          const opts = json.rows.map((r) => {
            const parts = [];
            if (labelFields.length === 0) {
              parts.push(
                ...Object.values(r).filter((v) => v !== undefined).slice(0, 2),
              );
            } else {
              labelFields.forEach((f) => {
                if (r[f] !== undefined) parts.push(r[f]);
              });
            }
            return { value: r[searchColumn], label: parts.join(' - ') };
          });
          setOptions(opts);
        } else {
          setOptions([]);
        }
      } catch (err) {
        if (err.name !== 'AbortError') setOptions([]);
      }
    }
    load();
    return () => controller.abort();
  }, [table, searchColumn, labelFields, input]);

  function handleSelectKeyDown(e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, options.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      let idx = highlight;
      if (idx < 0 && options.length > 0) idx = 0;
      if (idx >= 0 && idx < options.length) {
        e.preventDefault();
        const opt = options[idx];
        onChange(opt.value, opt.label);
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
        onFocus={(e) => {
          setShow(true);
          if (onFocus) onFocus(e);
        }}
        onBlur={handleBlur}
        onKeyDown={(e) => {
          handleSelectKeyDown(e);
          if (onKeyDown) onKeyDown(e);
        }}
        disabled={disabled}
        style={{ width: '100%', padding: '0.5rem', ...inputStyle }}
        {...rest}
      />
      {show && options.length > 0 && (
        <ul
          style={{
            position: 'absolute',
            zIndex: 1100,
            listStyle: 'none',
            margin: 0,
            padding: 0,
            background: '#fff',
            border: '1px solid #ccc',
            width: '100%',
            maxHeight: '150px',
            overflowY: 'auto',
          }}
        >
          {options.map((opt, idx) => (
            <li
              key={opt.value}
              onMouseDown={() => {
                onChange(opt.value, opt.label);
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
