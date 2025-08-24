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
      const y = now.getFullYear();
      const m = now.getMonth();
      switch (preset) {
        case 'today':
          s = e = fmt(now);
          break;
        case 'yesterday': {
          const d = new Date(now);
          d.setDate(now.getDate() - 1);
          s = e = fmt(d);
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
        case 'month': {
          const startDate = new Date(y, m, 1);
          const endDate = new Date(y, m + 1, 0);
          s = fmt(startDate);
          e = fmt(endDate);
          break;
        }
        case 'q1':
          s = fmt(new Date(y, 0, 1));
          e = fmt(new Date(y, 3, 0));
          break;
        case 'q2':
          s = fmt(new Date(y, 3, 1));
          e = fmt(new Date(y, 6, 0));
          break;
        case 'q3':
          s = fmt(new Date(y, 6, 1));
          e = fmt(new Date(y, 9, 0));
          break;
        case 'q4':
          s = fmt(new Date(y, 9, 1));
          e = fmt(new Date(y, 12, 0));
          break;
        case 'year':
          s = fmt(new Date(y, 0, 1));
          e = fmt(new Date(y, 12, 0));
          break;
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
