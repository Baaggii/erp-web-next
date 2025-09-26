import React, { useState, useEffect, useContext, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useTour } from '../components/ERPLayout.jsx';
import userSettingsSteps from '../tours/UserSettings.js';
import { useAuth } from '../context/AuthContext.jsx';
import LangContext from '../context/I18nContext.jsx';
import TooltipWrapper from '../components/TooltipWrapper.jsx';
import { API_BASE } from '../utils/apiBase.js';

export default function UserSettingsPage() {
  const { t } = useTranslation(['translation', 'tooltip']);
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
  const { t } = useTranslation(['translation', 'tooltip']);
  const { userSettings, updateUserSettings } = useAuth();
  const tooltipsEnabled = userSettings.tooltipsEnabled ?? true;
  return (
    <div>
      <TooltipWrapper title={t('enable_tooltips', { ns: 'tooltip' })}>
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
  const { t } = useTranslation(['translation', 'tooltip']);
  const { userSettings, updateUserSettings } = useAuth();
  const toursEnabled = userSettings.settings_enable_tours ?? false;
  const showTourButtons = userSettings.showTourButtons ?? true;
  return (
    <div>
      <TooltipWrapper
        title={t('settings_enable_tours', {
          ns: 'tooltip',
          defaultValue: 'Show page guide',
        })}
      >
        <label>
          <input
            id="show-page-guide-toggle"
            type="checkbox"
            checked={toursEnabled}
            onChange={(e) =>
              updateUserSettings({ settings_enable_tours: e.target.checked })
            }
          />{' '}
          {t('settings_enable_tours', 'Show page guide')}
        </label>
      </TooltipWrapper>
      <TooltipWrapper
        title={t('settings_show_tour_buttons', {
          ns: 'tooltip',
          defaultValue: 'Show tour buttons in the header',
        })}
      >
        <label htmlFor="show-tour-buttons-toggle">
          <input
            id="show-tour-buttons-toggle"
            type="checkbox"
            checked={showTourButtons}
            onChange={(e) =>
              updateUserSettings({ showTourButtons: e.target.checked })
            }
          />{' '}
          {t('settings_show_tour_buttons', 'Show tour buttons')}
        </label>
      </TooltipWrapper>
    </div>
  );
}

function PrinterSettingsTab() {
  const { t } = useTranslation(['translation', 'tooltip']);
  const { userSettings, updateUserSettings } = useAuth();
  const [printers, setPrinters] = useState([]);
  useEffect(() => {
    fetch(`${API_BASE}/printers`, { credentials: 'include', skipErrorToast: true })
      .then((r) => r.json())
      .then(setPrinters)
      .catch(() => setPrinters([]));
  }, []);
  return (
    <div>
      <TooltipWrapper
        title={t('select_printer', {
          ns: 'tooltip',
          defaultValue: 'Select printer',
        })}
      >
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
      </TooltipWrapper>
    </div>
  );
}

function ProfileSettingsTab() {
  const { t } = useTranslation(['translation', 'tooltip']);
  const { lang, setLang } = useContext(LangContext);
  const languageOptions = [
    { value: 'en', labelKey: 'language_option_en', defaultLabel: 'English' },
    { value: 'mn', labelKey: 'language_option_mn', defaultLabel: 'Mongolian' },
    { value: 'ja', labelKey: 'language_option_ja', defaultLabel: 'Japanese' },
    { value: 'ko', labelKey: 'language_option_ko', defaultLabel: 'Korean' },
    { value: 'zh', labelKey: 'language_option_zh', defaultLabel: 'Chinese' },
    { value: 'es', labelKey: 'language_option_es', defaultLabel: 'Spanish' },
    { value: 'de', labelKey: 'language_option_de', defaultLabel: 'German' },
    { value: 'fr', labelKey: 'language_option_fr', defaultLabel: 'French' },
    { value: 'ru', labelKey: 'language_option_ru', defaultLabel: 'Russian' },
  ];
  return (
    <div>
      <TooltipWrapper
        title={t('language', {
          ns: 'tooltip',
          defaultValue: 'Select language',
        })}
      >
        <label>
          {t('language', 'Language')}: {' '}
          <select value={lang} onChange={(e) => setLang(e.target.value)}>
            {languageOptions.map(({ value, labelKey, defaultLabel }) => (
              <option key={value} value={value}>
                {t(labelKey, defaultLabel)}
              </option>
            ))}
          </select>
        </label>
      </TooltipWrapper>
    </div>
  );
}
