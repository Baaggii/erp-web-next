import React, { useEffect, useState } from 'react';
import TableManager from '../components/TableManager.jsx';
import TableRelationsEditor from '../components/TableRelationsEditor.jsx';
import useButtonPerms from '../hooks/useButtonPerms.js';

export default function TablesManagement() {
  const [tables, setTables] = useState([]);
  const [selectedTable, setSelectedTable] = useState('');
  const [refreshId, setRefreshId] = useState(0);
  const [activeTab, setActiveTab] = useState('data');
  const buttonPerms = useButtonPerms();

  const loadTables = async () => {
    try {
      const res = await fetch('/api/tables', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setTables(data);
        if (!data.includes(selectedTable)) {
          setSelectedTable('');
        } else if (selectedTable) {
          // trigger refresh for currently selected table
          setRefreshId((r) => r + 1);
        }
      }
    } catch (err) {
      console.error('Failed to load tables', err);
    }
  };

  useEffect(() => {
    loadTables();
  }, []);

  const tabButtonStyle = {
    padding: '0.5rem 1rem',
    border: '1px solid #d1d5db',
    backgroundColor: '#f9fafb',
    cursor: 'pointer',
    marginRight: '0.5rem',
  };

  return (
    <div>
      <h2>Dynamic Tables</h2>
      <div style={{ marginBottom: '0.5rem' }}>
        <button
          type="button"
          onClick={() => setActiveTab('data')}
          style={{
            ...tabButtonStyle,
            backgroundColor: activeTab === 'data' ? '#e5e7eb' : tabButtonStyle.backgroundColor,
          }}
        >
          Data
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('relations')}
          style={{
            ...tabButtonStyle,
            backgroundColor:
              activeTab === 'relations' ? '#e5e7eb' : tabButtonStyle.backgroundColor,
          }}
        >
          Relations
        </button>
      </div>
      <div style={{ marginBottom: '0.5rem' }}>
        <select value={selectedTable} onChange={(e) => setSelectedTable(e.target.value)}>
          <option value="">-- select table --</option>
          {tables.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <button onClick={loadTables} style={{ marginLeft: '0.5rem' }}>
          Refresh List
        </button>
      </div>
      {activeTab === 'data' && selectedTable && (
        <TableManager
          table={selectedTable}
          refreshId={refreshId}
          buttonPerms={buttonPerms}
          autoFillSession={false}
        />
      )}
      {activeTab === 'data' && !selectedTable && (
        <p>Select a table to view data.</p>
      )}
      {activeTab === 'relations' && (
        <TableRelationsEditor table={selectedTable} tables={tables} />
      )}
    </div>
  );
}
