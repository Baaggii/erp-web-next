import React from 'react';
import normalizeDateInput from '../utils/normalizeDateInput.js';

/**
 * Simple wrapper around the native date input so we can swap in a
 * custom date picker implementation later without touching callers.
 */
export default function CustomDatePicker({ value, onChange, ...rest }) {
  const handleChange = (e) => {
    const v = normalizeDateInput(e.target.value, 'YYYY-MM-DD');
    onChange(v);
  };
  return (
    <input
      type="date"
      value={normalizeDateInput(value, 'YYYY-MM-DD')}
      onChange={handleChange}
      style={{ padding: '0.25em', ...(rest.style || {}) }}
      {...rest}
    />
  );
}
