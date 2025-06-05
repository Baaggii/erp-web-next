import { useState } from 'react';
import GLInquiry from '../windows/GLInquiry.jsx';
import PurchaseOrders from '../windows/PurchaseOrders.jsx';
import SalesDashboard from '../windows/SalesDashboard.jsx';

export default function TabbedWindows() {
  const tabs = [
    { id: 'dashboard', title: 'Dashboard', Component: SalesDashboard },
    { id: 'gl', title: 'General Ledger', Component: GLInquiry },
    { id: 'po', title: 'Purchase Orders', Component: PurchaseOrders },
  ];
  const [active, setActive] = useState('dashboard');

  const ActiveComponent = tabs.find(t => t.id === active)?.Component || null;

  return (
    <div>
      <div style={styles.tabBar}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActive(tab.id)}
            style={active === tab.id ? styles.activeTab : styles.tab}
          >
            {tab.title}
          </button>
        ))}
      </div>
      <div style={styles.tabContent}>{ActiveComponent && <ActiveComponent />}</div>
    </div>
  );
}

const styles = {
  tabBar: {
    display: 'flex',
    borderBottom: '1px solid #ccc',
    marginBottom: '0.5rem',
  },
  tab: {
    background: 'transparent',
    border: 'none',
    padding: '0.5rem 1rem',
    cursor: 'pointer',
  },
  activeTab: {
    background: '#e5e7eb',
    border: '1px solid #ccc',
    borderBottom: 'none',
    padding: '0.5rem 1rem',
    cursor: 'pointer',
  },
  tabContent: {
    border: '1px solid #ccc',
    padding: '1rem',
  },
};
