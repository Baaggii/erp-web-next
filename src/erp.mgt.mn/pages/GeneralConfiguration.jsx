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
    const { name, value, type, checked } = e.target;
    setCfg(c => ({
      ...c,
      [tab]: {
        ...(c?.[tab] || {}),
        [name]: type === 'number' ? Number(value) : type === 'checkbox' ? checked : value,
      },
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
        <button
          className={`tab-button ${tab === 'general' ? 'active' : ''}`}
          onClick={() => setTab('general')}
        >
          General
        </button>
        <button
          className={`tab-button ${tab === 'images' ? 'active' : ''}`}
          onClick={() => setTab('images')}
        >
          Images
        </button>
      </div>
      <div style={{ marginBottom: '0.5rem' }}>
        <button onClick={() => setTab('forms')} disabled={tab === 'forms'}>
          Forms
        </button>
        <button onClick={() => setTab('pos')} disabled={tab === 'pos'} style={{ marginLeft: '0.5rem' }}>
          POS
        </button>
        <button onClick={() => setTab('general')} disabled={tab === 'general'} style={{ marginLeft: '0.5rem' }}>
          General
        </button>
        <button onClick={() => setTab('images')} disabled={tab === 'images'} style={{ marginLeft: '0.5rem' }}>
          Images
        </button>
      </div>
      {tab === 'forms' || tab === 'pos' ? (
        <>
          <div style={{ marginBottom: '0.5rem' }}>
            <label>
              Label Font Size{' '}
              <input
                name="labelFontSize"
                type="number"
                inputMode="decimal"
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
                inputMode="decimal"
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
                inputMode="decimal"
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
                inputMode="decimal"
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
                inputMode="decimal"
                value={active.boxMaxHeight ?? ''}
                onChange={handleChange}
              />
            </label>
          </div>
        </>
      ) : tab === 'images' ? (
        <>
          <div style={{ marginBottom: '0.5rem' }}>
            <label>
              Base Path{' '}
              <input
                name="basePath"
                type="text"
                value={active.basePath ?? ''}
                onChange={handleChange}
              />
            </label>
          </div>
          <div style={{ marginBottom: '0.5rem' }}>
            <label>
              Cleanup Days{' '}
              <input
                name="cleanupDays"
                type="number"
                inputMode="decimal"
                value={active.cleanupDays ?? ''}
                onChange={handleChange}
                style={{ width: '4rem' }}
              />
            </label>
          </div>
          <div style={{ marginBottom: '0.5rem' }}>
            <label>
              Ignore on Search
              <textarea
                name="ignoreOnSearch"
                value={(active.ignoreOnSearch || []).join('\n')}
                onChange={(e) => {
                  const list = e.target.value
                    .split('\n')
                    .map((s) => s.trim())
                    .filter(Boolean);
                  setCfg((c) => ({
                    ...c,
                    images: { ...(c.images || {}), ignoreOnSearch: list },
                  }));
                }}
                rows={3}
                style={{ display: 'block', width: '100%', marginTop: '0.25rem' }}
              />
            </label>
          </div>
        </>
      ) : (
        <>
          <div style={{ marginBottom: '0.5rem' }}>
            <label>
              Enable AI API{' '}
              <input
                name="aiApiEnabled"
                type="checkbox"
                checked={active.aiApiEnabled ?? false}
                onChange={handleChange}
              />
            </label>
          </div>
          <div style={{ marginBottom: '0.5rem' }}>
            <label>
              Enable AI Inventory API{' '}
              <input
                name="aiInventoryApiEnabled"
                type="checkbox"
                checked={active.aiInventoryApiEnabled ?? false}
                onChange={handleChange}
              />
            </label>
          </div>
          <div style={{ marginBottom: '0.5rem' }}>
            <label>
              Show Trigger Toasts{' '}
              <input
                name="triggerToastEnabled"
                type="checkbox"
                checked={active.triggerToastEnabled ?? false}
                onChange={handleChange}
              />
            </label>
          </div>
          <div style={{ marginBottom: '0.5rem' }}>
            <label>
              Show Procedure Toasts{' '}
              <input
                name="procToastEnabled"
                type="checkbox"
                checked={active.procToastEnabled ?? false}
                onChange={handleChange}
              />
            </label>
          </div>
          <div style={{ marginBottom: '0.5rem' }}>
            <label>
              Show View Lookup Toasts{' '}
              <input
                name="viewToastEnabled"
                type="checkbox"
                checked={active.viewToastEnabled ?? false}
                onChange={handleChange}
              />
            </label>
          </div>
          <div style={{ marginBottom: '0.5rem' }}>
            <label>
              Show Report Row Toasts{' '}
              <input
                name="reportRowToastEnabled"
                type="checkbox"
                checked={active.reportRowToastEnabled ?? false}
                onChange={handleChange}
              />
            </label>
          </div>
          <div style={{ marginBottom: '0.5rem' }}>
            <label>
              Show Image Toasts{' '}
              <input
                name="imageToastEnabled"
                type="checkbox"
                checked={active.imageToastEnabled ?? false}
                onChange={handleChange}
              />
            </label>
          </div>
          <div style={{ marginBottom: '0.5rem' }}>
            <label>
              Enable Field Label Editing{' '}
              <input
                name="editLabelsEnabled"
                type="checkbox"
                checked={active.editLabelsEnabled ?? false}
                onChange={handleChange}
              />
            </label>
          </div>
          <div style={{ marginBottom: '0.5rem' }}>
            <label>
              Show Report Parameters{' '}
              <input
                name="showReportParams"
                type="checkbox"
                checked={active.showReportParams ?? false}
                onChange={handleChange}
              />
            </label>
          </div>
          <div style={{ marginBottom: '0.5rem' }}>
            <label>
              Enable Debug Logging{' '}
              <input
                name="debugLoggingEnabled"
                type="checkbox"
                checked={active.debugLoggingEnabled ?? false}
                onChange={handleChange}
              />
            </label>
          </div>
        </>
      )}
      <button onClick={handleSave} disabled={saving}>
        Save
      </button>
    </div>
  );
}
