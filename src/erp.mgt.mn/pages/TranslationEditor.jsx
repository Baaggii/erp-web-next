import React, { useState, useContext } from 'react';
import I18nContext from '../context/I18nContext.jsx';
import GenerateTranslationsTab from './GenerateTranslationsTab.jsx';
import TextManagementTab from './TextManagementTab.jsx';
import ManualTranslationsTab from './ManualTranslationsTab.jsx';

export default function TranslationEditorPage() {
  const { t } = useContext(I18nContext);
  const [activeTab, setActiveTab] = useState('manual');

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

      {activeTab === 'manual' && <ManualTranslationsTab />}
      {activeTab === 'generate' && <GenerateTranslationsTab />}
      {activeTab === 'textManagement' && <TextManagementTab />}
    </div>
  );
}

