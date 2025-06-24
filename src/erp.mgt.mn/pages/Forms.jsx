// src/erp.mgt.mn/pages/Forms.jsx
import React, { useEffect, useState } from 'react';
import FinanceTransactionsPage from './FinanceTransactions.jsx';
import { useModules } from '../hooks/useModules.js';


export default function Forms() {
  const [transactions, setTransactions] = useState({});
  const modules = useModules();

  useEffect(() => {
    fetch('/api/transaction_forms', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : {}))
      .then((data) => {
        const grouped = {};
        Object.entries(data).forEach(([name, info]) => {
          const key = info.moduleKey || 'finance_transactions';
          if (!grouped[key]) grouped[key] = [];
          grouped[key].push(name);
        });
        setTransactions(grouped);
      })
      .catch((err) => console.error('Error fetching forms:', err));
  }, []);

  const groups = Object.entries(transactions);

  return (
    <div>
      <h2>Маягтууд</h2>
      {groups.length === 0 ? (
        <p>Маягт олдсонгүй.</p>
      ) : (
        groups.map(([key]) => {
          const mod = modules.find((m) => m.module_key === key);
          return (
            <div key={key} style={{ marginBottom: '1rem' }}>
              <FinanceTransactionsPage
                moduleKey={key}
                defaultName={mod ? mod.label : key}
              />
            </div>
          );
        })
      )}
    </div>
  );
}
