import React, { useState } from 'react';
import buildStoredProcedure from '../utils/buildStoredProcedure.js';
// global fetch is patched with CSRF token handling in main.jsx

  export default function ReportBuilder() {
    const [procName, setProcName] = useState('inventory');
    const [paramsJson, setParamsJson] = useState(`[
  { "name": "start_date", "type": "DATE" },
  { "name": "end_date", "type": "DATE" },
  { "name": "session_branch_id", "type": "INT" },
  { "name": "session_user_id", "type": "VARCHAR(10)" },
  { "name": "session_company_id", "type": "INT" }
]`);
    const [definitionJson, setDefinitionJson] = useState(`{
  "from": { "table": "orders", "alias": "o" },
  "select": [ { "expr": "o.id", "alias": "order_id" } ]
}`);
    const [script, setScript] = useState('');
    const [error, setError] = useState('');

    async function handleSave() {
      if (!script) return;
      try {
        const name = `report_${procName}`;
        const res = await fetch('/api/report-builder/procedures', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, sql: script }),
        });
        if (!res.ok) throw new Error('Save failed');
        window.dispatchEvent(
          new CustomEvent('toast', {
            detail: { message: 'Stored procedure saved', type: 'success' },
          })
        );
      } catch (err) {
        window.dispatchEvent(
          new CustomEvent('toast', {
            detail: { message: err.message || 'Save failed', type: 'error' },
          })
        );
      }
    }

    function handleGenerate() {
      try {
        const params = JSON.parse(paramsJson);
        const report = JSON.parse(definitionJson);
        const built = buildStoredProcedure({
          name: procName,
          params,
          report,
        });
        setScript(built);
        setError('');
      } catch (err) {
        setScript('');
        setError(err.message);
      }
    }

    return (
      <div>
        <h2>Report Builder</h2>
        <label>
          Procedure Name:
          <div>
            report_
            <input
              value={procName}
              onChange={(e) => setProcName(e.target.value)}
              style={{ width: '50%' }}
            />
          </div>
        </label>
        <p>Parameters (JSON array)</p>
        <textarea
          value={paramsJson}
          onChange={(e) => setParamsJson(e.target.value)}
          rows={5}
          style={{ width: '100%' }}
        />
        <p>Report Definition (JSON)</p>
        <textarea
          value={definitionJson}
          onChange={(e) => setDefinitionJson(e.target.value)}
          rows={10}
          style={{ width: '100%' }}
        />
        <div style={{ marginTop: '1rem' }}>
          <button onClick={handleGenerate}>Generate Procedure</button>
          <button onClick={handleSave} style={{ marginLeft: '0.5rem' }}>
            Save Procedure
          </button>
        </div>
        {error && <p style={{ color: 'red' }}>{error}</p>}
        {script && (
          <pre style={{ whiteSpace: 'pre-wrap', marginTop: '1rem' }}>{script}</pre>
        )}
      </div>
    );
  }
