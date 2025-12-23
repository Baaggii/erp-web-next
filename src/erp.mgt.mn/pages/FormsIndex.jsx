import React, { useEffect, useState, useContext } from 'react';
import FinanceTransactionsPage from './FinanceTransactions.jsx';
import { useModules } from '../hooks/useModules.js';
import { AuthContext } from '../context/AuthContext.jsx';
import { useCompanyModules } from '../hooks/useCompanyModules.js';
import { useTxnModules } from '../hooks/useTxnModules.js';
import useGeneralConfig from '../hooks/useGeneralConfig.js';
import useHeaderMappings from '../hooks/useHeaderMappings.js';
import I18nContext from '../context/I18nContext.jsx';
import { useTranslation } from 'react-i18next';
import TooltipWrapper from '../components/TooltipWrapper.jsx';
import { hasTransactionFormAccess } from '../utils/transactionFormAccess.js';
import {
  isModuleLicensed,
  isModulePermissionGranted,
} from '../utils/moduleAccess.js';

export default function FormsIndex() {
  const [transactions, setTransactions] = useState({});
  const modules = useModules();
  const { company, branch, department, permissions: perms, session, user, workplace } =
    useContext(AuthContext);
  const licensed = useCompanyModules(company);
  const txnModules = useTxnModules();
  const generalConfig = useGeneralConfig();
  const { t } = useContext(I18nContext);
  const { t: tTip } = useTranslation('tooltip');

  const headerMap = useHeaderMappings(modules.map((m) => m.module_key));
  const moduleMap = {};
  modules.forEach((m) => {
    const label =
      generalConfig.general?.procLabels?.[m.module_key] ||
      headerMap[m.module_key] ||
      m.label;
    moduleMap[m.module_key] = { ...m, label };
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
    if (branch != null) params.set('branchId', branch);
    if (department != null) params.set('departmentId', department);
    const userRightId =
      user?.userLevel ??
      user?.userlevel_id ??
      user?.userlevelId ??
      session?.user_level ??
      session?.userlevel_id ??
      session?.userlevelId ??
      null;
    const workplaceId =
      workplace ??
      session?.workplace_id ??
      session?.workplaceId ??
      null;
    const workplacePositionId =
      session?.workplace_position_id ?? session?.workplacePositionId ?? null;
    const positionId =
      session?.employment_position_id ??
      session?.position_id ??
      session?.position ??
      user?.position ??
      null;
    if (userRightId != null && `${userRightId}`.trim() !== '') {
      params.set('userRightId', userRightId);
    }
    if (workplaceId != null && `${workplaceId}`.trim() !== '') {
      params.set('workplaceId', workplaceId);
    }
    if (positionId != null && `${positionId}`.trim() !== '') {
      params.set('positionId', positionId);
    }
    if (workplacePositionId != null && `${workplacePositionId}`.trim() !== '') {
      params.set('workplacePositionId', workplacePositionId);
    }
    const url = `/api/transaction_forms${params.toString() ? `?${params.toString()}` : ''}`;
    fetch(url, { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : {}))
      .then((data) => {
        const grouped = {};
        const branchId = branch != null ? String(branch) : null;
        const departmentId = department != null ? String(department) : null;
        Object.entries(data).forEach(([name, info]) => {
          if (name === 'isDefault') return;
          if (!info || typeof info !== 'object') return;
          const key = info.moduleKey || 'forms';
          if (!descendantKeys.includes(key)) return;
          if (
            !hasTransactionFormAccess(info, branchId, departmentId, {
              allowTemporaryAnyScope: true,
              userRightId,
              workplaceId,
              positionId,
              workplacePositions: session?.workplace_assignments,
              workplacePositionId,
            })
          )
            return;
          if (!isModulePermissionGranted(perms, key))
            return;
          if (!isModuleLicensed(licensed, key))
            return;
          if (!grouped[key]) grouped[key] = [];
          grouped[key].push(name);
        });
        setTransactions(grouped);
      })
      .catch((err) => console.error('Error fetching forms:', err));
  }, [company, perms, licensed, txnModules, modules, branch, department, session, user, workplace]);

  const groups = Object.entries(transactions);

  return (
    <div>
      <TooltipWrapper title={tTip('forms_header', { defaultValue: 'Available forms' })}>
        <h2>{t('forms', 'Forms')}</h2>
      </TooltipWrapper>
      {groups.length === 0 ? (
        <TooltipWrapper title={tTip('forms_none', { defaultValue: 'No matching forms available' })}>
          <p>{t('formsNone', 'No forms found.')}</p>
        </TooltipWrapper>
      ) : (
        groups.map(([key]) => {
          const mod = modules.find((m) => m.module_key === key);
          const label = mod
            ? generalConfig.general?.procLabels?.[mod.module_key] ||
              headerMap[mod.module_key] ||
              mod.label
            : key;
          return (
            <div key={key} style={{ marginBottom: '1rem' }}>
              <FinanceTransactionsPage moduleKey={key} moduleLabel={label} />
            </div>
          );
        })
      )}
    </div>
  );
}
