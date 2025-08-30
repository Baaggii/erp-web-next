import React, { useEffect, useState, useContext } from 'react';
import useGeneralConfig, { updateCache } from '../hooks/useGeneralConfig.js';
import { useToast } from '../context/ToastContext.jsx';
import { AuthContext } from '../context/AuthContext.jsx';
import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import TooltipWrapper from '../components/TooltipWrapper.jsx';

export default function GeneralConfiguration() {
  const initial = useGeneralConfig();
  const [cfg, setCfg] = useState(null);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState('forms');
  const { addToast } = useToast();
  const { session, permissions } = useContext(AuthContext);
  const { t } = useTranslation(['translation', 'tooltip']);
  const hasAdmin =
    permissions?.permissions?.system_settings ||
    session?.permissions?.system_settings;
  if (!hasAdmin) {
    return <Navigate to="/" replace />;
  }

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
      addToast(t('saved', 'Saved'), 'success');
    } else {
      addToast(t('failedToSave', 'Failed to save'), 'error');
    }
    setSaving(false);
  }

  if (!cfg) return <p>{t('loading', 'Loading…')}</p>;

  const active = cfg?.[tab] || {};

  return (
    <div>
      <TooltipWrapper title={t('general_configuration', { ns: 'tooltip', defaultValue: 'Configure global settings' })}>
        <h2>{t('generalConfiguration', 'General Configuration')}</h2>
      </TooltipWrapper>
      <div className="tab-button-group" style={{ marginBottom: '0.5rem' }}>
        <TooltipWrapper title={t('tab_forms', { ns: 'tooltip', defaultValue: 'Form options' })}>
          <button
            className={`tab-button ${tab === 'forms' ? 'active' : ''}`}
            onClick={() => setTab('forms')}
          >
            Forms
          </button>
        </TooltipWrapper>
        <TooltipWrapper title={t('tab_pos', { ns: 'tooltip', defaultValue: 'Point of sale settings' })}>
          <button
            className={`tab-button ${tab === 'pos' ? 'active' : ''}`}
            onClick={() => setTab('pos')}
          >
            POS
          </button>
        </TooltipWrapper>
        <TooltipWrapper title={t('tab_general', { ns: 'tooltip', defaultValue: 'Miscellaneous settings' })}>
          <button
            className={`tab-button ${tab === 'general' ? 'active' : ''}`}
            onClick={() => setTab('general')}
          >
            General
          </button>
        </TooltipWrapper>
        <TooltipWrapper title={t('tab_images', { ns: 'tooltip', defaultValue: 'Image options' })}>
          <button
            className={`tab-button ${tab === 'images' ? 'active' : ''}`}
            onClick={() => setTab('images')}
          >
            Images
          </button>
        </TooltipWrapper>
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
            <TooltipWrapper title={t('label_font_size', { ns: 'tooltip', defaultValue: 'Font size for labels' })}>
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
            </TooltipWrapper>
          </div>
          <div style={{ marginBottom: '0.5rem' }}>
            <TooltipWrapper title={t('box_width', { ns: 'tooltip', defaultValue: 'Input box width' })}>
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
            </TooltipWrapper>
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
              Stored Procedure Prefix{' '}
              <input
                name="reportProcPrefix"
                type="text"
                value={active.reportProcPrefix ?? ''}
                onChange={handleChange}
                style={{ width: '8rem' }}
              />
            </label>
            <div style={{ fontSize: '0.8rem' }}>Prepended to report stored procedure names</div>
          </div>
          <div style={{ marginBottom: '0.5rem' }}>
            <label>
              View Prefix{' '}
              <input
                name="reportViewPrefix"
                type="text"
                value={active.reportViewPrefix ?? ''}
                onChange={handleChange}
                style={{ width: '8rem' }}
              />
            </label>
            <div style={{ fontSize: '0.8rem' }}>Prepended to report view names</div>
          </div>
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
          <div style={{ marginBottom: '0.5rem' }}>
            <label>
              Enable Request Polling{' '}
              <input
                name="requestPollingEnabled"
                type="checkbox"
                checked={active.requestPollingEnabled ?? false}
                onChange={handleChange}
              />
            </label>
          </div>
          <div style={{ marginBottom: '0.5rem' }}>
            <label>
              Request Polling Interval (seconds){' '}
              <input
                name="requestPollingIntervalSeconds"
                type="number"
                min={1}
                value={active.requestPollingIntervalSeconds ?? 30}
                onChange={handleChange}
                style={{ width: '4rem' }}
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
