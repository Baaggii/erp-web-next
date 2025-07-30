import React, { useEffect, useState } from 'react';
import useGeneralConfig, { updateCache } from '../hooks/useGeneralConfig.js';
import { useToast } from '../context/ToastContext.jsx';

export default function GeneralConfiguration() {
  const initial = useGeneralConfig();
  const [cfg, setCfg] = useState(null);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState('forms');
  const { addToast } = useToast();

  useEffect(() => {
    if (initial && Object.keys(initial).length) setCfg(initial);
    fetch('/api/general_config', { credentials: 'include' })
      .then(res => (res.ok ? res.json() : {}))
      .then(setCfg)
      .catch(() => setCfg({}));
  }, [initial]);

  function handleChange(e) {
    const { name, value } = e.target;
    setCfg(c => ({
      ...c,
      [tab]: { ...(c?.[tab] || {}), [name]: Number(value) },
    }));
  }

  async function handleSave() {
    setSaving(true);
    const res = await fetch('/api/general_config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(cfg),
    });
    if (res.ok) {
      const data = await res.json();
      setCfg(data);
      updateCache(data);
      addToast('Saved', 'success');
    } else {
      addToast('Failed to save', 'error');
    }
    setSaving(false);
  }

  if (!cfg) return <p>Loading…</p>;

  const active = cfg?.[tab] || {};

  return (
    <div>
      <h2>General Configuration</h2>
      <div className="tab-button-group" style={{ marginBottom: '0.5rem' }}>
        <button
          className={`tab-button ${tab === 'forms' ? 'active' : ''}`}
          onClick={() => setTab('forms')}
        >
          Forms
        </button>
        <button
          className={`tab-button ${tab === 'pos' ? 'active' : ''}`}
          onClick={() => setTab('pos')}
        >
          POS
        </button>
      </div>
      <div style={{ marginBottom: '0.5rem' }}>
        <button onClick={() => setTab('forms')} disabled={tab === 'forms'}>
          Forms
        </button>
        <button onClick={() => setTab('pos')} disabled={tab === 'pos'} style={{ marginLeft: '0.5rem' }}>
          POS
        </button>
      </div>
      <div style={{ marginBottom: '0.5rem' }}>
        <label>
          Label Font Size{' '}
          <input
            name="labelFontSize"
            type="number"
            value={active.labelFontSize ?? ''}
            onChange={handleChange}
          />
        </label>
      </div>
      <div style={{ marginBottom: '0.5rem' }}>
        <label>
          Box Width{' '}
          <input
            name="boxWidth"
            type="number"
            value={active.boxWidth ?? ''}
            onChange={handleChange}
          />
        </label>
      </div>
      <div style={{ marginBottom: '0.5rem' }}>
        <label>
          Box Height{' '}
          <input
            name="boxHeight"
            type="number"
            value={active.boxHeight ?? ''}
            onChange={handleChange}
          />
        </label>
      </div>
      <div style={{ marginBottom: '0.5rem' }}>
        <label>
          Box Max Width{' '}
          <input
            name="boxMaxWidth"
            type="number"
            value={active.boxMaxWidth ?? ''}
            onChange={handleChange}
          />
        </label>
      </div>
      <div style={{ marginBottom: '0.5rem' }}>
        <label>
          Box Max Height{' '}
          <input
            name="boxMaxHeight"
            type="number"
            value={active.boxMaxHeight ?? ''}
            onChange={handleChange}
          />
        </label>
      </div>
      <button onClick={handleSave} disabled={saving}>
        Save
      </button>
    </div>
  );
}
