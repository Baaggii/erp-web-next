import React, { useContext } from 'react';
import I18nContext from '../context/I18nContext.jsx';
import { useToast } from '../context/ToastContext.jsx';

export default function TextManagementTab() {
  const { t } = useContext(I18nContext);
  const { addToast } = useToast();

  async function handleExport() {
    try {
      const res = await fetch('/api/translations/export', {
        credentials: 'include',
      });
      if (!res.ok) {
        addToast(
          t('exportTextsFailed', 'Failed to export hardcoded texts'),
          'error'
        );
        return;
      }
      addToast(
        t('exportTextsSuccess', 'Hardcoded texts export started'),
        'success'
      );
    } catch {
      addToast(
        t('exportTextsFailed', 'Failed to export hardcoded texts'),
        'error'
      );
    }
  }

  return (
    <div>
      <button onClick={handleExport}>
        {t('exportHardcodedTexts', 'Export hardcoded texts')}
      </button>
    </div>
  );
}
