import React, { useContext } from 'react';
import MosaicLayout from '../components/MosaicLayout.jsx';
import { AuthContext } from '../context/AuthContext.jsx';

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
  const { user, company } = useContext(AuthContext);

  const cardStyle = {
    background: '#f0f4ff',
    padding: '1rem',
    borderRadius: '4px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
    minWidth: '140px',
  };

  return (
    <div style={{ padding: '1rem' }}>
      <h2 style={{ marginTop: 0 }}>Blue Link демо</h2>
      <p>
        Welcome, {user?.full_name || user?.username}
        {company && ` (${company.company_name})`}
      </p>
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        <div style={cardStyle}>
          <div style={{ fontSize: '0.9rem', color: '#555' }}>Today&apos;s Income</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>$0</div>
        </div>
        <div style={cardStyle}>
          <div style={{ fontSize: '0.9rem', color: '#555' }}>Low Stock</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>0 items</div>
        </div>
        <div style={cardStyle}>
          <div style={{ fontSize: '0.9rem', color: '#555' }}>New Orders</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>0</div>
        </div>
      </div>
      <MosaicLayout initialLayout={initialLayout} />
    </div>
  );
}
