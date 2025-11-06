import React, { useState, useEffect } from 'react';
import CustomDatePicker from './CustomDatePicker.jsx';
import formatTimestamp from '../utils/formatTimestamp.js';
import normalizeDateInput from '../utils/normalizeDateInput.js';

/**
 * Reusable date range picker with common presets.
 * Calls `onChange` with an object `{ start, end }` using YYYY-MM-DD strings.
 */
const PRESET_KEYS = [
  'today',
  'yesterday',
  'last7',
  'month',
  'q1',
  'q2',
  'q3',
  'q4',
  'year',
];

function getPresetRange(preset, customStart, customEnd) {
  const fmt = (d) => normalizeDateInput(formatTimestamp(d), 'YYYY-MM-DD');
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  switch (preset) {
    case 'custom':
      return { start: customStart, end: customEnd };
    case 'today': {
      const value = fmt(now);
      return { start: value, end: value };
    }
    case 'yesterday': {
      const d = new Date(now);
      d.setDate(now.getDate() - 1);
      const value = fmt(d);
      return { start: value, end: value };
    }
    case 'last7': {
      const endDate = fmt(now);
      const startDate = new Date(now);
      startDate.setDate(now.getDate() - 6);
      return { start: fmt(startDate), end: endDate };
    }
    case 'month': {
      const startDate = new Date(y, m, 1);
      const endDate = new Date(y, m + 1, 0);
      return { start: fmt(startDate), end: fmt(endDate) };
    }
    case 'q1':
      return { start: fmt(new Date(y, 0, 1)), end: fmt(new Date(y, 3, 0)) };
    case 'q2':
      return { start: fmt(new Date(y, 3, 1)), end: fmt(new Date(y, 6, 0)) };
    case 'q3':
      return { start: fmt(new Date(y, 6, 1)), end: fmt(new Date(y, 9, 0)) };
    case 'q4':
      return { start: fmt(new Date(y, 9, 1)), end: fmt(new Date(y, 12, 0)) };
    case 'year':
      return { start: fmt(new Date(y, 0, 1)), end: fmt(new Date(y, 12, 0)) };
    default:
      return { start: customStart, end: customEnd };
  }
}

export default function DateRangePicker({ start, end, onChange, style }) {
  const [preset, setPreset] = useState('today');
  const [customStart, setCustomStart] = useState(() =>
    normalizeDateInput(start || '', 'YYYY-MM-DD'),
  );
  const [customEnd, setCustomEnd] = useState(() =>
    normalizeDateInput(end || '', 'YYYY-MM-DD'),
  );

  useEffect(() => {
    const { start: s, end: e } = getPresetRange(preset, customStart, customEnd);
    onChange({ start: s, end: e });
  }, [preset, customStart, customEnd, onChange]);

  useEffect(() => {
    const normalizedStart = normalizeDateInput(start || '', 'YYYY-MM-DD');
    const normalizedEnd = normalizeDateInput(end || '', 'YYYY-MM-DD');

    if (normalizedStart !== customStart) {
      setCustomStart(normalizedStart);
    }
    if (normalizedEnd !== customEnd) {
      setCustomEnd(normalizedEnd);
    }

    const matchedPreset = PRESET_KEYS.find((key) => {
      const range = getPresetRange(key, normalizedStart, normalizedEnd);
      return range.start === normalizedStart && range.end === normalizedEnd;
    });

    if (matchedPreset) {
      if (matchedPreset !== preset) {
        setPreset(matchedPreset);
      }
      return;
    }

    if (normalizedStart || normalizedEnd) {
      if (preset !== 'custom') {
        setPreset('custom');
      }
    } else if (preset !== 'today') {
      setPreset('today');
    }
  }, [start, end, customStart, customEnd, preset]);

  return (
    <span style={style}>
      <select
        value={preset}
        onChange={(e) => setPreset(e.target.value)}
        style={{ marginRight: '0.5rem' }}
      >
        <option value="today">Today</option>
        <option value="yesterday">Yesterday</option>
        <option value="last7">Last 7 Days</option>
        <option value="month">This Month</option>
        <option value="q1">Quarter #1</option>
        <option value="q2">Quarter #2</option>
        <option value="q3">Quarter #3</option>
        <option value="q4">Quarter #4</option>
        <option value="year">This Year</option>
        <option value="custom">Custom</option>
      </select>
      {preset === 'custom' && (
        <>
          <CustomDatePicker
            value={customStart}
            onChange={(v) => setCustomStart(normalizeDateInput(v, 'YYYY-MM-DD'))}
            placeholder="YYYY.MM.DD"
            style={{ marginRight: '0.25rem' }}
          />
          <CustomDatePicker
            value={customEnd}
            onChange={(v) => setCustomEnd(normalizeDateInput(v, 'YYYY-MM-DD'))}
            placeholder="YYYY.MM.DD"
            style={{ marginRight: '0.5rem' }}
          />
        </>
      )}
    </span>
  );
}
