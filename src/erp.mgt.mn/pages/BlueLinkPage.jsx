import React from 'react';
import MosaicLayout from '../components/MosaicLayout.jsx';

const blLayout = {
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

export default function BlueLinkPage() {
  return (
    <div>
      <h2>Blue Link Demo</h2>
      <MosaicLayout initialLayout={blLayout} />
    </div>
  );
}
