import React, { useEffect, useState } from 'react';
import useGeneralConfig, { updateCache } from '../hooks/useGeneralConfig.js';

export default function GeneralConfiguration() {
  const initial = useGeneralConfig();
  const [cfg, setCfg] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (initial && Object.keys(initial).length) setCfg(initial);
    fetch('/api/general_config', { credentials: 'include' })
      .then(res => (res.ok ? res.json() : {}))
      .then(setCfg)
      .catch(() => setCfg({}));
  }, [initial]);

  function handleChange(e) {
    const { name, value } = e.target;
    setCfg(c => ({ ...c, [name]: Number(value) }));
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
      alert('Saved');
    } else {
      alert('Failed to save');
    }
    setSaving(false);
  }

  if (!cfg) return <p>Loading…</p>;

  return (
    <div>
      <h2>General Configuration</h2>
      <div style={{ marginBottom: '0.5rem' }}>
        <label>
          Label Font Size{' '}
          <input
            name="labelFontSize"
            type="number"
            value={cfg.labelFontSize ?? ''}
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
            value={cfg.boxWidth ?? ''}
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
            value={cfg.boxHeight ?? ''}
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
            value={cfg.boxMaxWidth ?? ''}
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
