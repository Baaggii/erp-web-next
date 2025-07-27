import React, { useState, useEffect, useRef } from 'react';

export default function AsyncSearchSelect({
  table,
  searchColumn,
  searchColumns,
  labelFields = [],
  idField,
  value,
  onChange,
  onSelect,
  disabled,
  onKeyDown,
  inputRef,
  onFocus,
  inputStyle = {},
  ...rest
}) {
  const initialVal =
    typeof value === 'object' && value !== null ? value.value : value || '';
  const initialLabel =
    typeof value === 'object' && value !== null ? value.label || '' : '';
  const [input, setInput] = useState(initialVal);
  const [label, setLabel] = useState(initialLabel);
  const [options, setOptions] = useState([]);
  const [show, setShow] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const [loading, setLoading] = useState(false);
  const timeoutRef = useRef(null);
  const containerRef = useRef(null);
  const match = options.find((o) => String(o.value) === String(input));
  const displayLabel = match ? match.label : label;
  const internalRef = useRef(null);
  const chosenRef = useRef(null);

  useEffect(() => {
    if (typeof value === 'object' && value !== null) {
      setInput(value.value || '');
      setLabel(value.label || '');
    } else {
      setInput(value || '');
      if (!value) setLabel('');
    }
  }, [value]);

  useEffect(() => {
    if (show && options.length > 0) setHighlight((h) => (h < 0 ? 0 : Math.min(h, options.length - 1)));
  }, [options, show]);

  useEffect(() => {
    const cols =
      searchColumns && searchColumns.length > 0
        ? searchColumns
        : searchColumn
        ? [searchColumn]
        : [];
    if (!table || cols.length === 0) return;
    if (!input) {
      setOptions([]);
      return;
    }
    const controller = new AbortController();
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ page: 1, perPage: 50 });
        cols.forEach((c) => params.append(c, input));
        const res = await fetch(
          `/api/tables/${encodeURIComponent(table)}?${params.toString()}`,
          { credentials: 'include', signal: controller.signal },
        );
        const json = await res.json();
        const rows = Array.isArray(json.rows) ? json.rows : [];
        const opts = rows.map((r) => {
          const val = r[idField || searchColumn];
          const parts = [];
          if (val !== undefined) parts.push(val);
          if (labelFields.length === 0) {
            Object.entries(r).forEach(([k, v]) => {
              if (k === idField || k === searchColumn) return;
              if (v !== undefined && parts.length < 3) parts.push(v);
            });
          } else {
            labelFields.forEach((f) => {
              if (r[f] !== undefined) parts.push(r[f]);
            });
          }
          return { value: val, label: parts.join(' - ') };
        });
        const q = String(input).toLowerCase();
        const filtered = opts.filter(
          (o) =>
            String(o.value).toLowerCase().includes(q) ||
            String(o.label).toLowerCase().includes(q),
        );
        setOptions(filtered);
      } catch (err) {
        if (err.name !== 'AbortError') setOptions([]);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => {
      clearTimeout(timeoutRef.current);
      controller.abort();
    };
  }, [table, searchColumn, searchColumns, labelFields, idField, input]);

  function handleSelectKeyDown(e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!show) setShow(true);
      setHighlight((h) => Math.min(h + 1, options.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!show) setShow(true);
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      let idx = highlight;
      if (idx < 0 && options.length > 0) idx = 0;
      if (idx >= 0 && idx < options.length) {
        e.preventDefault();
        const opt = options[idx];
        onChange(opt.value, opt.label);
        if (onSelect) onSelect(opt);
        setInput(String(opt.value));
        setLabel(opt.label || '');
        if (internalRef.current) internalRef.current.value = String(opt.value);
        e.target.value = String(opt.value);
        e.selectedOption = opt;
        chosenRef.current = opt;
        setShow(false);
      }
    }
  }

  function handleBlur() {
    setTimeout(() => setShow(false), 100);
  }

  return (
    <div
      ref={containerRef}
      style={{ position: 'relative', zIndex: show ? 21000 : 'auto' }}
    >
      <input
        ref={(el) => {
          internalRef.current = el;
          if (typeof inputRef === 'function') inputRef(el);
          else if (inputRef) inputRef.current = el;
        }}
        value={input}
        onChange={(e) => {
          setInput(e.target.value);
          setLabel('');
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
          if (chosenRef.current) e.selectedOption = chosenRef.current;
          if (onKeyDown) onKeyDown(e);
          chosenRef.current = null;
        }}
        disabled={disabled}
        style={{ width: '100%', padding: '0.5rem', ...inputStyle }}
        title={input}
        {...rest}
      />
      {show && (
        <ul
          style={{
            position: 'absolute',
            zIndex: 21000,
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
          {loading ? (
            <li style={{ padding: '0.25rem' }}>Loading...</li>
          ) : (
            options.map((opt, idx) => (
              <li
                key={opt.value}
                onMouseDown={() => {
                  onChange(opt.value, opt.label);
                  if (onSelect) onSelect(opt);
                  setInput(String(opt.value));
                  setLabel(opt.label || '');
                  if (internalRef.current) internalRef.current.value = String(opt.value);
                  chosenRef.current = opt;
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
            ))
          )}
        </ul>
      )}
      {displayLabel && (
        <div style={{ fontSize: '0.8rem', color: '#555' }}>{displayLabel}</div>
      )}
    </div>
  );
}
