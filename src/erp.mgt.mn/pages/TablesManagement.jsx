import React, { useEffect, useState } from 'react';
import TableManager from '../components/TableManager.jsx';
import TableRelationsEditor from '../components/TableRelationsEditor.jsx';
import useButtonPerms from '../hooks/useButtonPerms.js';
import { useTranslation } from 'react-i18next';

export default function TablesManagement() {
  const [tables, setTables] = useState([]);
  const [selectedTable, setSelectedTable] = useState('');
  const [refreshId, setRefreshId] = useState(0);
  const [activeTab, setActiveTab] = useState('data');
  const buttonPerms = useButtonPerms();
  const { t } = useTranslation();

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
      <h2>{t('tables_management_title', 'Dynamic Tables')}</h2>
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
        <div style={{ marginTop: '1rem' }}>
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
            <button
              type="button"
              onClick={() => setActiveTab('data')}
              style={{
                padding: '0.5rem 1rem',
                border: '1px solid #d1d5db',
                backgroundColor: activeTab === 'data' ? '#e5e7eb' : '#f9fafb',
                fontWeight: activeTab === 'data' ? 600 : 400,
              }}
            >
              {t('tables_management_tab_data', 'Data')}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('relations')}
              style={{
                padding: '0.5rem 1rem',
                border: '1px solid #d1d5db',
                backgroundColor: activeTab === 'relations' ? '#e5e7eb' : '#f9fafb',
                fontWeight: activeTab === 'relations' ? 600 : 400,
              }}
            >
              {t('tables_management_tab_relations', 'Relations')}
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
            <TableRelationsEditor table={selectedTable} tables={tables} />
          )}
        </div>
      )}
    </div>
  );
}
