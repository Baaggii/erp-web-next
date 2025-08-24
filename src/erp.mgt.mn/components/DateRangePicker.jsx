import React, { useState, useEffect } from 'react';
import CustomDatePicker from './CustomDatePicker.jsx';
import formatTimestamp from '../utils/formatTimestamp.js';

/**
 * Reusable date range picker with common presets.
 * Calls `onChange` with an object `{ start, end }` using YYYY-MM-DD strings.
 */
export default function DateRangePicker({ start, end, onChange, style }) {
  const [preset, setPreset] = useState('today');
  const [customStart, setCustomStart] = useState(start || '');
  const [customEnd, setCustomEnd] = useState(end || '');

  useEffect(() => {
    const fmt = (d) => formatTimestamp(d).slice(0, 10);
    let s;
    let e;
    if (preset === 'custom') {
      s = customStart;
      e = customEnd;
    } else {
      const now = new Date();
      switch (preset) {
        case 'today':
          s = e = fmt(now);
          break;
        case 'yesterday': {
          const y = new Date(now);
          y.setDate(now.getDate() - 1);
          s = e = fmt(y);
          break;
        }
        case 'last7': {
          const endDate = fmt(now);
          const startDate = new Date(now);
          startDate.setDate(now.getDate() - 6);
          s = fmt(startDate);
          e = endDate;
          break;
        }
        default:
          s = customStart;
          e = customEnd;
      }
    }
    onChange({ start: s, end: e });
  }, [preset, customStart, customEnd]);

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
        <option value="custom">Custom</option>
      </select>
      {preset === 'custom' && (
        <>
          <CustomDatePicker
            value={customStart}
            onChange={setCustomStart}
            style={{ marginRight: '0.25rem' }}
          />
          <CustomDatePicker
            value={customEnd}
            onChange={setCustomEnd}
            style={{ marginRight: '0.5rem' }}
          />
        </>
      )}
    </span>
  );
}
