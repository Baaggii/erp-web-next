import { useContext } from 'react';
import I18nContext from '../context/I18nContext.jsx';

export default function GLInquiry() {
  const { t } = useContext(I18nContext);

  return <div>{t('windows.glInquiry.placeholder', 'General Ledger Inquiry Module')}</div>;
}
