import React, { useEffect, useState } from 'react';
import ErrorMessage from '../components/ErrorMessage.jsx';

export default function ErrorLogPage() {
  const [logs, setLogs] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/errors', { credentials: 'include' })
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch error log');
        return res.text();
      })
      .then(setLogs)
      .catch(err => {
        console.error('Error fetching error log:', err);
        setError(err.message);
      });
  }, []);

  return (
    <div>
      <h2>Error Log</h2>
      <ErrorMessage message={error} />
      <pre style={{ background: '#f3f4f6', padding: '1rem', whiteSpace: 'pre-wrap' }}>
        {logs}
      </pre>
    </div>
  );
}
