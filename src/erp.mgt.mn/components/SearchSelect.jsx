import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

export default function SearchSelect({
  value,
  onChange,
  options = [],
  disabled,
  inputRef,
  placeholder,
  usePortal = false,
  ...rest
}) {
  const [input, setInput] = useState(value || '');
  const [show, setShow] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const containerRef = useRef(null);
  const localInputRef = useRef(null);
  const dropdownPositionRef = useRef({ top: 0, left: 0, width: '100%' });

  useEffect(() => {
    setInput(value || '');
  }, [value]);

  const filtered = options.filter((o) => {
    const txt = (o.label || '').toLowerCase();
    const desc = (o.description || '').toLowerCase();
    const val = String(o.value).toLowerCase();
    const f = input.toLowerCase();
    return txt.includes(f) || val.includes(f) || desc.includes(f);
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

  useLayoutEffect(() => {
    if (!usePortal || !show) return undefined;
    const target = inputRef?.current || localInputRef.current || containerRef.current;
    if (!target) return undefined;

    function updatePosition() {
      const rect = target.getBoundingClientRect();
      dropdownPositionRef.current = {
        top: rect.bottom,
        left: rect.left,
        width: rect.width,
      };
    }

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [inputRef, show, usePortal]);

  const list =
    show && filtered.length > 0 ? (
      <ul
        style={{
          position: usePortal ? 'fixed' : 'absolute',
          zIndex: 2000,
          listStyle: 'none',
          margin: 0,
          padding: 0,
          background: '#fff',
          border: '1px solid #ccc',
          boxSizing: 'border-box',
          width: usePortal ? dropdownPositionRef.current.width : '100%',
          maxHeight: '150px',
          overflowY: 'auto',
          left: usePortal ? dropdownPositionRef.current.left : undefined,
          top: usePortal ? dropdownPositionRef.current.top : undefined,
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
    ) : null;

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <input
        ref={(el) => {
          if (inputRef) {
            if (typeof inputRef === 'function') inputRef(el);
            else inputRef.current = el;
          }
          localInputRef.current = el;
        }}
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
      {usePortal ? (list ? createPortal(list, document.body) : null) : list}
      {match && (
        <div style={{ fontSize: '0.8rem', color: '#555' }}>{match.label}</div>
      )}
    </div>
  );
}
