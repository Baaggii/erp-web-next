import React, { useContext } from 'react';
import I18nContext from '../context/I18nContext.jsx';

export default function TextManagementTab() {
  const { t } = useContext(I18nContext);

  async function handleExport() {
    try {
      const res = await fetch('/api/translations/export', {
        credentials: 'include',
      });
      if (!res.ok) return;
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'headerMappings.json';
      a.click();
      URL.revokeObjectURL(url);
    } catch {}
  }

  return (
    <div>
      <button onClick={handleExport}>
        {t('exportHardcodedTexts', 'Export hardcoded texts')}
      </button>
    </div>
  );
}
