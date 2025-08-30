import React, { useState, useEffect, useContext, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useTour } from '../components/ERPLayout.jsx';
import userSettingsSteps from '../tours/UserSettings.js';
import { useAuth } from '../context/AuthContext.jsx';
import LangContext from '../context/I18nContext.jsx';
import TooltipWrapper from '../components/TooltipWrapper.jsx';

export default function UserSettingsPage() {
  const { t } = useTranslation();
  const steps = useMemo(() => userSettingsSteps(t), [t]);
  useTour('user-settings', steps);
  const tabs = [
    { key: 'general', label: t('general', 'General') },
    { key: 'printer', label: t('printer', 'Printer') },
    { key: 'manual', label: t('user_manual', 'User manual') },
    { key: 'profile', label: t('profile', 'Profile') },
  ];
  const [active, setActive] = useState('general');
  return (
    <div style={{ padding: '1rem' }}>
      <div style={{ display: 'flex', borderBottom: '1px solid #ddd', marginBottom: '1rem' }}>
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActive(tab.key)}
            style={{
              padding: '0.5rem 1rem',
              border: 'none',
              borderBottom:
                active === tab.key ? '2px solid #2563eb' : '2px solid transparent',
              background: 'none',
              cursor: 'pointer',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {active === 'general' && <GeneralSettingsTab />}
      {active === 'printer' && <PrinterSettingsTab />}
      {active === 'manual' && <UserManualTab />}
      {active === 'profile' && <ProfileSettingsTab />}
    </div>
  );
}

function GeneralSettingsTab() {
  const { t } = useTranslation();
  const { userSettings, updateUserSettings } = useAuth();
  const tooltipsEnabled = userSettings.tooltipsEnabled ?? true;
  return (
    <div>
      <TooltipWrapper title={t('tooltip.enable_tooltips')}>
        <label>
          <input
            type="checkbox"
            checked={tooltipsEnabled}
            onChange={(e) => updateUserSettings({ tooltipsEnabled: e.target.checked })}
          />{' '}
          {t('settings_enable_tooltips', 'Enable tooltips')}
        </label>
      </TooltipWrapper>
    </div>
  );
}

function UserManualTab() {
  const { t } = useTranslation();
  const { userSettings, updateUserSettings } = useAuth();
  const toursEnabled = userSettings.settings_enable_tours ?? false;
  return (
    <div>
      <label>
        <input
          id="show-page-guide-toggle"
          type="checkbox"
          checked={toursEnabled}
          onChange={(e) => updateUserSettings({ settings_enable_tours: e.target.checked })}
        />{' '}
        {t('settings_enable_tours', 'Show page guide')}
      </label>
    </div>
  );
}

function PrinterSettingsTab() {
  const { t } = useTranslation();
  const { userSettings, updateUserSettings } = useAuth();
  const [printers, setPrinters] = useState([]);
  useEffect(() => {
    fetch(`${API_BASE}/printers`, { credentials: 'include' })
      .then((r) => r.json())
      .then(setPrinters)
      .catch(() => setPrinters([]));
  }, []);
  return (
    <div>
      <label>
        {t('printer', 'Printer')}: {' '}
        <select
          value={userSettings.printerId || ''}
          onChange={(e) => updateUserSettings({ printerId: e.target.value })}
        >
          <option value="">{t('select_printer', 'Select printer')}</option>
          {printers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

function ProfileSettingsTab() {
  const { t } = useTranslation();
  const { lang, setLang } = useContext(LangContext);
  return (
    <div>
      <label>
        {t('language', 'Language')}: {' '}
        <select value={lang} onChange={(e) => setLang(e.target.value)}>
          <option value="en">English</option>
          <option value="mn">Mongolian</option>
          <option value="ja">Japanese</option>
          <option value="ko">Korean</option>
          <option value="zh">Chinese</option>
          <option value="es">Spanish</option>
          <option value="de">German</option>
          <option value="fr">French</option>
          <option value="ru">Russian</option>
        </select>
      </label>
    </div>
  );
}
