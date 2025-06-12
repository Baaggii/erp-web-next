import React, { useEffect, useState } from 'react';
import TableManager from '../components/TableManager.jsx';

export default function TablesManagement() {
  const [tables, setTables] = useState([]);
  const [selectedTable, setSelectedTable] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    setError('');
    fetch('/api/tables', { credentials: 'include' })
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load tables');
        return res.json();
      })
      .then(setTables)
      .catch((err) => {
        console.error('Failed to load tables', err);
        setError(err.message);
      });
  }, []);

  return (
    <div>
      <h2>Dynamic Tables</h2>
      {error && (
        <div style={{ color: 'red', marginBottom: '0.5rem' }}>{error}</div>
      )}
      <select value={selectedTable} onChange={(e) => setSelectedTable(e.target.value)}>
        <option value="">-- select table --</option>
        {tables.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
      {selectedTable && <TableManager table={selectedTable} />}
    </div>
  );
}
