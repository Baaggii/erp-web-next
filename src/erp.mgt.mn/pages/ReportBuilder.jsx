import React, { useState } from 'react';
import buildReportSql from '../utils/buildReportSql.js';

export default function ReportBuilder() {
  const [definitionJson, setDefinitionJson] = useState(`{
  "from": { "table": "orders", "alias": "o" },
  "select": [ { "expr": "o.id", "alias": "order_id" } ]
}`);
  const [sql, setSql] = useState('');
  const [error, setError] = useState('');

  function handleBuild() {
    try {
      const def = JSON.parse(definitionJson);
      const built = buildReportSql(def);
      setSql(built);
      setError('');
    } catch (err) {
      setSql('');
      setError(err.message);
    }
  }

  return (
    <div>
      <h2>Report Builder</h2>
      <p>Paste a report definition in JSON format and build the SQL.</p>
      <textarea
        value={definitionJson}
        onChange={(e) => setDefinitionJson(e.target.value)}
        rows={10}
        style={{ width: '100%' }}
      />
      <button onClick={handleBuild}>Build SQL</button>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      {sql && (
        <pre style={{ whiteSpace: 'pre-wrap', marginTop: '1rem' }}>{sql}</pre>
      )}
    </div>
  );
}
