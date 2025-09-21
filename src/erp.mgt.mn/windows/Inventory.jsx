import { useContext } from 'react';
import I18nContext from '../context/I18nContext.jsx';

export default function Inventory() {
  const { t } = useContext(I18nContext);

  return <div>{t('windows.inventory.placeholder', 'Inventory Management Module')}</div>;
}

