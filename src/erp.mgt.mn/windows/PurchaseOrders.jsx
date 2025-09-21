import { useContext } from 'react';
import I18nContext from '../context/I18nContext.jsx';

export default function PurchaseOrders() {
  const { t } = useContext(I18nContext);

  return <div>{t('windows.purchaseOrders.placeholder', 'Purchase Orders Module')}</div>;
}
