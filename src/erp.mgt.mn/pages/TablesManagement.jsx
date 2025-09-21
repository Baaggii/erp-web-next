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

  useEffect(() => {
    if (!selectedTable) {
      setActiveTab('data');
    }
  }, [selectedTable]);

  return (
    <div>
      <h2>Dynamic Tables</h2>
      <select value={selectedTable} onChange={(e) => setSelectedTable(e.target.value)}>
        <option value="">-- select table --</option>
        {tables.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
      <button onClick={loadTables} style={{ marginLeft: '0.5rem' }}>Refresh List</button>
      {selectedTable && (
        <>
          <div style={{ marginTop: '1rem', marginBottom: '1rem' }}>
            <button
              type="button"
              onClick={() => setActiveTab('data')}
              style={{
                marginRight: '0.5rem',
                padding: '0.5rem 1rem',
                backgroundColor: activeTab === 'data' ? '#2563eb' : '#e5e7eb',
                color: activeTab === 'data' ? '#fff' : '#111827',
                border: '1px solid #d1d5db',
                borderRadius: '4px',
                cursor: 'pointer',
              }}
            >
              Data
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('relations')}
              style={{
                padding: '0.5rem 1rem',
                backgroundColor: activeTab === 'relations' ? '#2563eb' : '#e5e7eb',
                color: activeTab === 'relations' ? '#fff' : '#111827',
                border: '1px solid #d1d5db',
                borderRadius: '4px',
                cursor: 'pointer',
              }}
            >
              Relations
            </button>
          </div>
          {activeTab === 'data' ? (
            <TableManager
              table={selectedTable}
              refreshId={refreshId}
              buttonPerms={buttonPerms}
              autoFillSession={false}
            />
          ) : (
            <TableRelationsEditor table={selectedTable} />
          )}
        </>
      )}
    </div>
  );
}
