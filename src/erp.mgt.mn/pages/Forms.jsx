// src/erp.mgt.mn/pages/Forms.jsx
import React, { useEffect, useState } from 'react';
import FinanceTransactionsPage from './FinanceTransactions.jsx';
import { useTabs } from '../context/TabContext.jsx';


export default function Forms() {
  const [transactions, setTransactions] = useState([]);
  const { openTab } = useTabs();

  useEffect(() => {
    fetch('/api/transaction_forms', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : {}))
      .then((data) =>
        setTransactions(
          Object.entries(data).map(([name, info]) => ({
            name,
            moduleKey: info.moduleKey,
            table: info.table,
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
                  openTab({
                    key: t.moduleKey,
                    label: t.name,
                    content: (
                      <FinanceTransactionsPage
                        defaultName={t.name}
                        hideSelector
                      />
                    ),
                  })
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
