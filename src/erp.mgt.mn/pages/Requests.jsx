// src/erp.mgt.mn/pages/Requests.jsx
import React, { useEffect } from 'react';
import { debugLog } from '../utils/debug.js';

export default function RequestsPage() {
  useEffect(() => {
    debugLog('Component mounted: Requests');
  }, []);

  return (
    <div>
      <h2>Requests</h2>
      <p>List of requests will appear here.</p>
    </div>
  );
}
