import React from 'react';
import MosaicLayout from '../components/MosaicLayout.jsx';

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
  return (
    <div>
      <h2>Dashboard</h2>
      <MosaicLayout initialLayout={initialLayout} />
    </div>
  );
}
