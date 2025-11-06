import React, { forwardRef } from 'react';
import normalizeDateInput from '../utils/normalizeDateInput.js';

/**
 * Simple wrapper around the native date input so we can swap in a
 * custom date picker implementation later without touching callers.
 */
function CustomDatePicker({ value, onChange, inputRef, style, ...rest }, forwardedRef) {
  const handleChange = (e) => {
    const v = normalizeDateInput(e.target.value, 'YYYY-MM-DD');
    onChange(v);
  };

  const assignRef = (target, node) => {
    if (!target) return;
    if (typeof target === 'function') {
      target(node);
      return;
    }
    target.current = node;
  };

  const handleRef = (node) => {
    assignRef(forwardedRef, node);
    assignRef(inputRef, node);
  };

  return (
    <input
      type="date"
      value={normalizeDateInput(value, 'YYYY-MM-DD')}
      onChange={handleChange}
      style={{ padding: '0.25em', ...(style || {}) }}
      ref={handleRef}
      {...rest}
    />
  );
}

export default forwardRef(CustomDatePicker);
