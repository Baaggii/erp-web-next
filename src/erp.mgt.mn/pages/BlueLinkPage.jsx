import React from 'react';
import MosaicLayout from '../components/MosaicLayout.jsx';

const initialLayout = {
  direction: 'row',
  first: 'inventory',
  second: {
    direction: 'column',
    first: 'orders',
    second: 'acct',
    splitPercentage: 60,
  },
  splitPercentage: 33,
};

export default function BlueLinkPage() {
  return (
    <div>
      <h2>Blue Link Demo</h2>
      <MosaicLayout initialLayout={initialLayout} />
    </div>
  );
}
