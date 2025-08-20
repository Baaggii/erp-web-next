import React from 'react';

/**
 * Simple wrapper around the native date input so we can swap in a
 * custom date picker implementation later without touching callers.
 */
export default function CustomDatePicker({ value, onChange, ...rest }) {
  return (
    <input
      type="date"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{ padding: '0.25em', ...(rest.style || {}) }}
      {...rest}
    />
  );
}
