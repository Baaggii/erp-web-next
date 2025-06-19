// src/erp.mgt.mn/pages/Forms.jsx
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';


export default function Forms() {
  const [transactions, setTransactions] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    fetch('/api/transaction_forms', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : {}))
      .then((data) =>
        setTransactions(
          Object.entries(data).map(([name, info]) => ({
            name,
            moduleKey: info.moduleKey,
          }))
        )
      )
      .catch((err) => console.error('Error fetching forms:', err));
  }, []);

  return (
    <div>
      <h2>Маягтууд</h2>
      {transactions.length === 0 ? (
        <p>Маягт олдсонгүй.</p>
      ) : (
        <ul>
          {transactions.map((t) => (
            <li key={t.moduleKey}>
              <button
                onClick={() =>
                  navigate(
                    `/finance-transactions/${t.moduleKey.replace(/_/g, '-')}`
                  )
                }
              >
                {t.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
