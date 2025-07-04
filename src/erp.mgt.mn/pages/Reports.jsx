// src/erp.mgt.mn/pages/Reports.jsx
import React, { useEffect, useState } from 'react';
import { useOutlet } from 'react-router-dom';

export default function Reports() {
  const outlet = useOutlet();
  const [data, setData] = useState(null);

  useEffect(() => {
    if (outlet) return;
    fetch('/api/reports/sales', { credentials: 'include' })
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch reports');
        return res.json();
      })
      .then((json) => setData(json))
      .catch((err) => console.error('Error fetching report:', err));
  }, [outlet]);

  if (outlet) return outlet;

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
