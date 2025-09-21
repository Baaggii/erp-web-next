import { useContext } from 'react';
import I18nContext from '../context/I18nContext.jsx';

export default function GeneralLedger() {
  const { t } = useContext(I18nContext);

  return <div>{t('windows.generalLedger.placeholder', 'General Ledger Module')}</div>;
}
