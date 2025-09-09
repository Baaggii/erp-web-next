import React, { useState, useContext } from 'react';
import I18nContext from '../context/I18nContext.jsx';
import { clearHeaderMappingsCache } from '../hooks/useHeaderMappings.js';
import GenerateTranslationsTab from './GenerateTranslationsTab.jsx';
import TextManagementTab from './TextManagementTab.jsx';

const LANGS = ['en', 'mn', 'ja', 'ko', 'zh', 'es', 'de', 'fr', 'ru'];

export default function TranslationEditorPage() {
  const { t } = useContext(I18nContext);
  const [activeTab, setActiveTab] = useState('manual');
  const [header, setHeader] = useState('');
  const [values, setValues] = useState({});
  const [message, setMessage] = useState('');

  async function loadExisting() {
    if (!header) return;
    const newVals = {};
    for (const lang of LANGS) {
      const params = new URLSearchParams();
      params.set('headers', header);
      params.set('lang', lang);
      try {
        const res = await fetch(`/api/header_mappings?${params.toString()}`, {
          credentials: 'include',
        });
        const data = res.ok ? await res.json() : {};
        newVals[lang] = data[header] || '';
      } catch {
        newVals[lang] = '';
      }
    }
    setValues(newVals);
  }

  function handleChange(lang, val) {
    setValues((v) => ({ ...v, [lang]: val }));
  }

  async function handleSave() {
    const body = {
      [header]: Object.fromEntries(
        LANGS.filter((l) => values[l]).map((l) => [l, values[l]])
      ),
    };
    await fetch('/api/header_mappings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body),
    });
    clearHeaderMappingsCache([header]);
    setMessage('Saved');
    await loadExisting();
  }

  return (
    <div>
      <h2>{t('editTranslations', 'Edit Translations')}</h2>
      <div style={{ marginBottom: '1rem' }}>
        <button
          onClick={() => setActiveTab('manual')}
          disabled={activeTab === 'manual'}
          style={{ marginRight: '0.5rem' }}
        >
          {t('manualTranslations', 'Manual')}
        </button>
        <button
          onClick={() => setActiveTab('generate')}
          disabled={activeTab === 'generate'}
        >
          {t('generateTranslations', 'Generate')}
        </button>
        <button
          onClick={() => setActiveTab('textManagement')}
          disabled={activeTab === 'textManagement'}
          style={{ marginLeft: '0.5rem' }}
        >
          {t('textManagement', 'Text Management')}
        </button>
      </div>

      {activeTab === 'manual' && (
        <div>
          <div style={{ marginBottom: '1rem' }}>
            <label>
              Header key:{' '}
              <input
                value={header}
                onChange={(e) => setHeader(e.target.value)}
              />
            </label>
            <button
              onClick={loadExisting}
              style={{ marginLeft: '0.5rem' }}
            >
              Load
            </button>
          </div>
          {header && (
            <div>
              {LANGS.map((l) => (
                <div key={l} style={{ marginBottom: '0.25rem' }}>
                  <label>
                    {l}:{' '}
                    <input
                      value={values[l] || ''}
                      onChange={(e) => handleChange(l, e.target.value)}
                    />
                  </label>
                </div>
              ))}
              <button onClick={handleSave} style={{ marginTop: '0.5rem' }}>
                Save
              </button>
              {message && (
                <span style={{ marginLeft: '0.5rem' }}>{message}</span>
              )}
            </div>
          )}
        </div>
      )}

      {activeTab === 'generate' && <GenerateTranslationsTab />}
      {activeTab === 'textManagement' && <TextManagementTab />}
    </div>
  );
}

