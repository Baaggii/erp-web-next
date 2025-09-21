import { useContext } from 'react';
import I18nContext from '../context/I18nContext.jsx';

export default function Accounting() {
  const { t } = useContext(I18nContext);

  return <div>{t('windows.accounting.placeholder', 'Accounting Module')}</div>;
}

