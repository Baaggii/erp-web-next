import React from 'react';

export default function PolicyEventSelector({ form, eventTypes, onChange }) {
  return (
    <div>
      <h3>Event Trigger</h3>
      <div className="grid grid-2">
        <label>Event Type<select value={form.event_type} onChange={(e) => onChange('event_type', e.target.value)}>{eventTypes.map((entry) => <option key={entry} value={entry}>{entry}</option>)}</select></label>
        <label>Module Key<input value={form.module_key} onChange={(e) => onChange('module_key', e.target.value)} /></label>
        <label>Policy Name<input value={form.policy_name} onChange={(e) => onChange('policy_name', e.target.value)} /></label>
        <label>Policy Key<input value={form.policy_key} onChange={(e) => onChange('policy_key', e.target.value)} /></label>
        <label>Priority<input type="number" value={form.priority} onChange={(e) => onChange('priority', Number(e.target.value || 100))} /></label>
        <label><input type="checkbox" checked={Boolean(form.is_active)} onChange={(e) => onChange('is_active', e.target.checked)} /> Enabled</label>
      </div>
    </div>
  );
}
