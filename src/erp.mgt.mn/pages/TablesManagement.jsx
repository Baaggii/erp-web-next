import React, { useEffect, useState } from 'react';
import TableManager from '../components/TableManager.jsx';
import HeaderMapEditor from '../components/HeaderMapEditor.jsx';

export default function TablesManagement() {
  const [tables, setTables] = useState([]);
  const [selectedTable, setSelectedTable] = useState('');
  const [refreshId, setRefreshId] = useState(0);

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
          <TableManager table={selectedTable} refreshId={refreshId} />
          <HeaderMapEditor table={selectedTable} />
        </>
      )}
    </div>
  );
}
