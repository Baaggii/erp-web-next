import React, { useEffect, useState } from 'react';
import TableManager from '../components/TableManager.jsx';

export default function TablesManagement() {
  const [tables, setTables] = useState([]);
  const [selectedTable, setSelectedTable] = useState('');
  const [error, setError] = useState('');
  const [errorLog, setErrorLog] = useState([]);

  function logError(msg) {
    setError(msg);
    setErrorLog((log) => [...log, msg]);
  }

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
        logError(err.message);
      });
  }, []);

  return (
    <div>
      <h2>Dynamic Tables</h2>
      {error && (
        <div style={{ color: 'red', marginBottom: '0.5rem' }}>{error}</div>
      )}
      {errorLog.length > 0 && (
        <details style={{ marginBottom: '0.5rem' }}>
          <summary>Error Log ({errorLog.length})</summary>
          <ul>
            {errorLog.map((e, i) => (
              <li key={i} style={{ color: 'red' }}>
                {e}
              </li>
            ))}
          </ul>
        </details>
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
