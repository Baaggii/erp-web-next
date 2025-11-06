import React, { forwardRef, useEffect, useMemo, useRef, useState } from 'react';
import normalizeDateInput from '../utils/normalizeDateInput.js';
import formatDateForDisplay from '../utils/formatDateForDisplay.js';

const DEFAULT_ERROR = 'Invalid date';

const scheduleFrame =
  typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function'
    ? window.requestAnimationFrame.bind(window)
    : (cb) => {
        setTimeout(cb, 0);
      };

const sanitizeInput = (input) => input.replace(/[.,]/g, '-').replace(/[^0-9-]/g, '');

const formatInitialValue = (value) => {
  if (value === null || value === undefined) return '';
  const str = String(value).trim();
  if (!str) return '';
  return normalizeDateInput(str, 'YYYY-MM-DD');
};

const assignRef = (target, node) => {
  if (!target) return;
  if (typeof target === 'function') {
    target(node);
    return;
  }
  target.current = node;
};

function getValidationForValue(value) {
  if (!value) {
    return { isComplete: false, isValid: true, normalized: '', message: '' };
  }

  const sanitized = sanitizeInput(value);
  const parts = sanitized.split('-');
  const isComplete = parts.length === 3 && parts.every((part) => part.length > 0);

  if (!isComplete) {
    return { isComplete, isValid: true, normalized: sanitized, message: '' };
  }

  const [yearPart, monthPart, dayPart] = parts;
  if (yearPart.length !== 4) {
    return { isComplete, isValid: false, normalized: sanitized, message: DEFAULT_ERROR };
  }

  const year = Number(yearPart);
  const month = Number(monthPart);
  const day = Number(dayPart);

  if (
    Number.isNaN(year) ||
    Number.isNaN(month) ||
    Number.isNaN(day) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return { isComplete, isValid: false, normalized: sanitized, message: DEFAULT_ERROR };
  }

  const normalized = `${yearPart}-${monthPart.padStart(2, '0')}-${dayPart.padStart(2, '0')}`;
  const candidate = new Date(year, month - 1, day);
  const isValid =
    candidate.getFullYear() === year &&
    candidate.getMonth() === month - 1 &&
    candidate.getDate() === day;

  return {
    isComplete,
    isValid,
    normalized,
    message: isValid ? '' : DEFAULT_ERROR,
  };
}

function CustomDatePicker(
  { value, onChange, inputRef, style, onValidityChange, disabled, ...rest },
  forwardedRef,
) {
  const textInputRef = useRef(null);
  const pickerRef = useRef(null);
  const [pickerValue, setPickerValue] = useState(() => formatInitialValue(value));
  const [rawValue, setRawValue] = useState(() => formatInitialValue(value));
  const [{ invalid, message }, setValidity] = useState({ invalid: false, message: '' });
  const displayValue = useMemo(() => formatDateForDisplay(rawValue), [rawValue]);

  const {
    className,
    onFocus: restOnFocus,
    onBlur: restOnBlur,
    onInput: restOnInput,
    onKeyDown: restOnKeyDown,
    ...otherProps
  } = rest;

  const updateValidity = (isValid, validationMessage) => {
    const appliedMessage = isValid ? '' : validationMessage || DEFAULT_ERROR;
    setValidity((prev) => {
      if (prev.invalid === !isValid && prev.message === appliedMessage) {
        if (textInputRef.current) {
          textInputRef.current.setCustomValidity(appliedMessage);
        }
        return prev;
      }
      if (textInputRef.current) {
        textInputRef.current.setCustomValidity(appliedMessage);
      }
      if (typeof onValidityChange === 'function') {
        onValidityChange(isValid, appliedMessage);
      }
      return { invalid: !isValid, message: appliedMessage };
    });
  };

  useEffect(() => {
    const normalized = formatInitialValue(value);
    setRawValue(normalized);
    setPickerValue(normalized);
    updateValidity(true, '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const handleManualChange = (event) => {
    const node = event.target;
    const raw = node.value;
    const sanitized = sanitizeInput(raw);

    if (sanitized !== raw) {
      const { selectionStart } = node;
      const delta = sanitized.length - raw.length;
      node.value = formatDateForDisplay(sanitized);
      scheduleFrame(() => {
        if (selectionStart !== null && selectionStart !== undefined) {
          const next = Math.max(0, selectionStart + delta);
          node.setSelectionRange(next, next);
        }
      });
    }

    setRawValue(sanitized);
    restOnInput?.(event);

    if (sanitized === '') {
      updateValidity(true, '');
      setPickerValue('');
      setRawValue('');
      onChange('');
      return;
    }

    const validation = getValidationForValue(sanitized);
    if (!validation.isComplete) {
      updateValidity(true, '');
      return;
    }

    if (!validation.isValid) {
      updateValidity(false, validation.message);
      return;
    }

    const normalized = normalizeDateInput(validation.normalized, 'YYYY-MM-DD');
    setRawValue(normalized);
    setPickerValue(normalized);
    updateValidity(true, '');
    if (normalized !== value) {
      onChange(normalized);
    }
  };

  const handlePickerChange = (event) => {
    const nextValue = normalizeDateInput(event.target.value, 'YYYY-MM-DD');
    setPickerValue(nextValue);
    setRawValue(nextValue);
    updateValidity(true, '');
    onChange(nextValue);
  };

  const openPicker = () => {
    if (disabled) return;
    if (pickerRef.current?.showPicker) {
      pickerRef.current.showPicker();
    } else if (pickerRef.current) {
      pickerRef.current.click();
    }
  };

  const handleFocus = (event) => {
    restOnFocus?.(event);
  };

  const handleBlur = (event) => {
    restOnBlur?.(event);
  };

  const handleKeyDown = (event) => {
    if (!event.ctrlKey && !event.metaKey && !event.altKey && event.key.length === 1) {
      if (!/[0-9.,-]/.test(event.key)) {
        event.preventDefault();
        return;
      }
    }
    if ((event.altKey || event.metaKey) && event.key === 'ArrowDown') {
      event.preventDefault();
      openPicker();
      return;
    }
    restOnKeyDown?.(event);
  };

  const handleRef = (node) => {
    textInputRef.current = node;
    assignRef(forwardedRef, node);
    assignRef(inputRef, node);
  };

  const wrapperStyle = useMemo(
    () => ({ display: 'flex', alignItems: 'center', gap: '0.25rem', width: '100%' }),
    [],
  );

  const buttonStyle = useMemo(
    () => ({
      border: '1px solid #d1d5db',
      background: '#f9fafb',
      color: '#111827',
      padding: '0.25em 0.5em',
      borderRadius: '0.25rem',
      cursor: disabled ? 'not-allowed' : 'pointer',
    }),
    [disabled],
  );

  return (
    <div className="custom-date-picker" style={wrapperStyle}>
      <input
        type="text"
        inputMode="numeric"
        ref={handleRef}
        value={displayValue}
        onInput={handleManualChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        className={className}
        aria-invalid={invalid || undefined}
        style={{ flex: '1 1 auto', minWidth: 0, padding: '0.25em', ...(style || {}) }}
        {...otherProps}
      />
      <button
        type="button"
        onClick={openPicker}
        disabled={disabled}
        aria-label="Open date picker"
        style={buttonStyle}
      >
        📅
      </button>
      <input
        type="date"
        value={pickerValue}
        onChange={handlePickerChange}
        ref={pickerRef}
        disabled={disabled}
        aria-hidden="true"
        tabIndex={-1}
        style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', width: 0, height: 0 }}
      />
    </div>
  );
}

export default forwardRef(CustomDatePicker);
