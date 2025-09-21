import { useContext } from 'react';
import PendingRequestWidget from '../components/PendingRequestWidget.jsx';
import I18nContext from '../context/I18nContext.jsx';

export default function SalesDashboard() {
  const { t } = useContext(I18nContext);
  const dashboardLabel = t('windows.salesDashboard.label', 'Sales Dashboard');

  return (
    <div role="region" aria-label={dashboardLabel}>
      <PendingRequestWidget />
    </div>
  );
}
