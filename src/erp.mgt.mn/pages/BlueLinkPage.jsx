import MosaicLayout from '../components/MosaicLayout.jsx';

export default function BlueLinkPage() {
  const initial = {
    direction: 'row',
    first: 'inventory',
    second: {
      direction: 'column',
      first: 'orders',
      second: 'acct',
      splitPercentage: 60,
    },
    splitPercentage: 40,
  };
  return (
    <div>
      <h2>Blue Link ERP Demo</h2>
      <p>This page demonstrates a Blue Link style ERP dashboard using Mosaic.</p>
      <MosaicLayout initialLayout={initial} />
    </div>
  );
}
