import React, { useState } from 'react';
import GLInquiry from '../windows/GLInquiry.jsx';
import PurchaseOrders from '../windows/PurchaseOrders.jsx';
import SalesDashboard from '../windows/SalesDashboard.jsx';

export default function SidebarTabs() {
  const menuItems = [
    { id: 'dashboard', title: 'Dashboard', Component: SalesDashboard },
    { id: 'gl', title: 'General Ledger', Component: GLInquiry },
    { id: 'po', title: 'Purchase Orders', Component: PurchaseOrders },
  ];

  const [tabs, setTabs] = useState([]);
  const [active, setActive] = useState(null);

  function openTab(item) {
    setTabs((prev) => {
      // If tab already exists, just activate
      if (prev.find((t) => t.id === item.id)) return prev;
      return [...prev, item];
    });
    setActive(item.id);
  }

  const ActiveComponent = tabs.find((t) => t.id === active)?.Component || null;

  return (
    <div style={styles.container}>
      <aside style={styles.sidebar}>
        {menuItems.map((item) => (
          <button
            key={item.id}
            style={styles.menuBtn}
            onClick={() => openTab(item)}
          >
            {item.title}
          </button>
        ))}
      </aside>
      <div style={styles.main}>
        <div style={styles.tabBar}>
          {tabs.map((tab) => (
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
    </div>
  );
}

const styles = {
  container: { display: 'flex', height: '100%' },
  sidebar: {
    width: '200px',
    background: '#374151',
    color: '#fff',
    padding: '1rem',
    boxSizing: 'border-box',
  },
  menuBtn: {
    display: 'block',
    width: '100%',
    background: 'transparent',
    border: 'none',
    color: '#fff',
    textAlign: 'left',
    padding: '0.5rem',
    cursor: 'pointer',
  },
  main: { flex: 1, display: 'flex', flexDirection: 'column' },
  tabBar: {
    display: 'flex',
    borderBottom: '1px solid #ccc',
    background: '#f3f4f6',
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
  tabContent: { flex: 1, padding: '1rem', overflow: 'auto' },
};
