// src/erp.mgt.mn/pages/Reports.jsx
import React, { useEffect, useState } from 'react';
import { API_BASE } from '../utils/apiBase.js';

export default function Reports() {
  const [data, setData] = useState(null);

  useEffect(() => {
    fetch(`${API_BASE}/reports/sales`, { credentials: 'include' })
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch reports');
        return res.json();
      })
      .then((json) => setData(json))
      .catch((err) => console.error('Error fetching report:', err));
  }, []);

  return (
    <div>
      <h2>Тайлан</h2>
      {data ? (
        <pre>{JSON.stringify(data, null, 2)}</pre>
      ) : (
        <p>Тайлангийн мэдээлэл ачааллаж байна…</p>
      )}
    </div>
  );
}
