import { useContext } from 'react';
import I18nContext from '../context/I18nContext.jsx';

export default function ReportsViewer() {
  const { t } = useContext(I18nContext);

  return (
    <div style={{ padding: 10 }}>
      <h2>{t('windows.reportsViewer.title', '📈 Reports Viewer')}</h2>
      <p>{t('windows.reportsViewer.description', 'Generate and view your reports here.')}</p>
    </div>
  );
}
