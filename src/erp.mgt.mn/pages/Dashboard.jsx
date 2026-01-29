import React, { useEffect, useContext } from 'react';
import MosaicLayout from '../components/MosaicLayout.jsx';
import I18nContext from '../context/I18nContext.jsx';

const initialLayout = {
  direction: 'row',
  first: 'dashboard',
  second: {
    direction: 'row',
    first: 'inventory',
    second: {
      direction: 'column',
      first: 'orders',
      second: 'acct',
      splitPercentage: 60,
    },
    splitPercentage: 60,
  },
  splitPercentage: 25,
};

export default function Dashboard() {
  const { t } = useContext(I18nContext);
  useEffect(() => {
    if (window.erpDebug) console.warn('Mounted: Dashboard');
  }, []);
  return (
    <div>
      <h2>{t('dashboard', 'Dashboard')}</h2>
      <MosaicLayout initialLayout={initialLayout} />
    </div>
  );
}
