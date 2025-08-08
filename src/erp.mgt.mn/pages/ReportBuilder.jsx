import React, { useState } from 'react';
import buildReportSql from '../utils/buildReportSql.js';

export default function ReportBuilder() {
  const [sql, setSql] = useState('');

  function handleBuild() {
    const definition = {
      from: { table: 'orders', alias: 'o' },
      joins: [],
      select: [{ expr: 'o.id', alias: 'order_id' }],
      where: [],
      groupBy: [],
      having: [],
    };
    setSql(buildReportSql(definition));
  }

  return (
    <div>
      <h2>Report Builder</h2>
      <button onClick={handleBuild}>Build Sample SQL</button>
      {sql && <pre>{sql}</pre>}
    </div>
  );
}
