import React, { useEffect, useState, useContext } from 'react';
import FinanceTransactionsPage from './FinanceTransactions.jsx';
import { useModules } from '../hooks/useModules.js';
import { AuthContext } from '../context/AuthContext.jsx';
import { useRolePermissions } from '../hooks/useRolePermissions.js';
import { useCompanyModules } from '../hooks/useCompanyModules.js';
import { useTxnModules } from '../hooks/useTxnModules.js';

export default function FormsIndex() {
  const [transactions, setTransactions] = useState({});
  const modules = useModules();
  const { company } = useContext(AuthContext);
  const perms = useRolePermissions();
  const licensed = useCompanyModules(company?.company_id);
  const txnModules = useTxnModules();

  const moduleMap = {};
  modules.forEach((m) => {
    moduleMap[m.module_key] = { ...m };
  });

  function isFormsDescendant(mod) {
    let cur = mod;
    while (cur) {
      if (cur.module_key === 'forms') return mod.module_key !== 'forms';
      cur = cur.parent_key ? moduleMap[cur.parent_key] : null;
    }
    return false;
  }

  const descendantKeys = modules
    .filter((m) => isFormsDescendant(m))
    .map((m) => m.module_key);

  useEffect(() => {
    const params = new URLSearchParams();
    if (company?.branch_id !== undefined)
      params.set('branchId', company.branch_id);
    if (company?.department_id !== undefined)
      params.set('departmentId', company.department_id);
    const url = `/api/transaction_forms${params.toString() ? `?${params.toString()}` : ''}`;
    fetch(url, { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : {}))
      .then((data) => {
        const grouped = {};
        Object.entries(data).forEach(([name, info]) => {
          const allowedB = info.allowedBranches || [];
          const allowedD = info.allowedDepartments || [];
          const key = info.moduleKey || 'forms';
          if (!descendantKeys.includes(key)) return;
          if (
            allowedB.length > 0 &&
            company?.branch_id !== undefined &&
            !allowedB.includes(company.branch_id)
          )
            return;
          if (
            allowedD.length > 0 &&
            company?.department_id !== undefined &&
            !allowedD.includes(company.department_id)
          )
            return;
          if (perms && !perms[key]) return;
          if (licensed && !licensed[key]) return;
          if (!grouped[key]) grouped[key] = [];
          grouped[key].push(name);
        });
        setTransactions(grouped);
      })
      .catch((err) => console.error('Error fetching forms:', err));
  }, [company, perms, licensed, txnModules, modules]);

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
              <FinanceTransactionsPage moduleKey={key} moduleLabel={mod ? mod.label : key} />
            </div>
          );
        })
      )}
    </div>
  );
}
