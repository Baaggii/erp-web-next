import React, { useState } from 'react';
import CodingTablesPage from './CodingTables.jsx';
import CodingTablesJsonConverter from './CodingTablesJsonConverter.jsx';

const TABS = [
  { key: 'coding', label: 'Coding Tables' },
  { key: 'json', label: 'JSON Converter' },
];

export default function CodingTablesWithJson() {
  const [activeTab, setActiveTab] = useState('coding');

  return (
    <div className="coding-tables-tabs" style={{ padding: '1rem' }}>
      <div
        style={{
          display: 'inline-flex',
          border: '1px solid #e5e7eb',
          borderRadius: '8px',
          marginBottom: '1rem',
          overflow: 'hidden',
        }}
      >
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              padding: '0.6rem 1rem',
              border: 'none',
              borderRight: '1px solid #e5e7eb',
              background: activeTab === tab.key ? '#0ea5e9' : '#fff',
              color: activeTab === tab.key ? '#fff' : '#111827',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div
        style={{
          border: '1px solid #e5e7eb',
          borderRadius: '10px',
          padding: '1rem',
          background: '#fff',
        }}
      >
        {activeTab === 'coding' ? <CodingTablesPage /> : <CodingTablesJsonConverter />}
      </div>
    </div>
  );
}
