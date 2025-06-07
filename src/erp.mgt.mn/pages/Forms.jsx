// src/erp.mgt.mn/pages/Forms.jsx
import React, { useEffect, useState } from 'react';

export default function Forms() {
  const [formsList, setFormsList] = useState([]);

  useEffect(() => {
    fetch('/api/forms', { credentials: 'include' })
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch forms');
        return res.json();
      })
      .then((data) => setFormsList(data))
      .catch((err) => console.error('Error fetching forms:', err));
  }, []);

  return (
    <div>
      <h2>Маягтууд</h2>
      {formsList.length === 0 ? (
        <p>Маягт олдсонгүй.</p>
      ) : (
        <ul>
          {formsList.map((f) => (
            <li key={f.id}>{f.name}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
