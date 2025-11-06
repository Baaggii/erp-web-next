import React, { forwardRef } from 'react';
import normalizeDateInput, {
  replaceDateSeparators,
} from '../utils/normalizeDateInput.js';

/**
 * Simple wrapper around the native date input so we can swap in a
 * custom date picker implementation later without touching callers.
 */
function CustomDatePicker({ value, onChange, inputRef, style, ...rest }, forwardedRef) {
  const handleChange = (e) => {
    const sanitized = replaceDateSeparators(e.target.value);
    if (sanitized !== e.target.value) {
      const { selectionStart, selectionEnd } = e.target;
      e.target.value = sanitized;
      if (
        typeof selectionStart === 'number' &&
        typeof selectionEnd === 'number' &&
        e.target.setSelectionRange
      ) {
        e.target.setSelectionRange(selectionStart, selectionEnd);
      }
    }
    const v = normalizeDateInput(sanitized, 'YYYY-MM-DD');
    if (v !== sanitized) e.target.value = v;
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
      onInput={(e) => {
        const sanitized = replaceDateSeparators(e.target.value);
        if (sanitized !== e.target.value) {
          const { selectionStart, selectionEnd } = e.target;
          e.target.value = sanitized;
          if (
            typeof selectionStart === 'number' &&
            typeof selectionEnd === 'number' &&
            e.target.setSelectionRange
          ) {
            e.target.setSelectionRange(selectionStart, selectionEnd);
          }
        }
      }}
      style={{ padding: '0.25em', ...(style || {}) }}
      ref={handleRef}
      {...rest}
    />
  );
}

export default forwardRef(CustomDatePicker);
