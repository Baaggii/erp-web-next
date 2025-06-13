import React, { useEffect, useState } from 'react';
import TableManager from '../components/TableManager.jsx';

export default function TablesManagement() {
  const [tables, setTables] = useState([]);
  const [selectedTable, setSelectedTable] = useState('');

  useEffect(() => {
    fetch('/api/tables', { credentials: 'include' })
      .then((res) => res.json())
      .then(setTables)
      .catch((err) => console.error('Failed to load tables', err));
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
      {selectedTable && <TableManager table={selectedTable} />}
    </div>
  );
}
