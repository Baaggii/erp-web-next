import React, { useContext, useMemo } from 'react';
import I18nContext from '../context/I18nContext.jsx';
import ManualTranslationsTab from './ManualTranslationsTab.jsx';
import { useTour } from '../components/ERPLayout.jsx';
import translationEditorSteps from '../tours/TranslationEditor.js';

export default function TranslationEditorPage() {
  const { t } = useContext(I18nContext);
  const steps = useMemo(() => translationEditorSteps(t), [t]);
  useTour('edit-translations', steps);

  return (
    <div>
      <h2>{t('editTranslations', 'Edit Translations')}</h2>
      <ManualTranslationsTab />
    </div>
  );
}

