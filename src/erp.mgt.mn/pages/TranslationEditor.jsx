import React, { useContext } from 'react';
import I18nContext from '../context/I18nContext.jsx';
import ManualTranslationsTab from './ManualTranslationsTab.jsx';

export default function TranslationEditorPage() {
  const { t } = useContext(I18nContext);

  return (
    <div>
      <h2>{t('editTranslations', 'Edit Translations')}</h2>
      <ManualTranslationsTab />
    </div>
  );
}

