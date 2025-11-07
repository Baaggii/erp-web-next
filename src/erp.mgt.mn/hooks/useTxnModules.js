import { useEffect, useState, useContext, useMemo } from 'react';
import { AuthContext } from '../context/AuthContext.jsx';
import { debugLog } from '../utils/debug.js';
import { useCompanyModules } from './useCompanyModules.js';
import { hasTransactionFormAccess } from '../utils/transactionFormAccess.js';

// Cache the raw transaction-form payload so we can re-derive module visibility
// whenever permissions, licensing, or scope change without re-fetching.
const cache = {
  forms: null,
  branchId: undefined,
  departmentId: undefined,
  companyId: undefined,
};
const emitter = new EventTarget();

function deriveTxnModuleState(
  data,
  branch,
  department,
  perms,
  licensed,
  userRights,
  workplaceId,
  workplaceSessionId,
) {
  const branchId = branch != null ? String(branch) : null;
  const departmentId = department != null ? String(department) : null;
  const keys = new Set();
  const labels = {};

  if (data && typeof data === 'object') {
    Object.entries(data).forEach(([name, info]) => {
      if (name === 'isDefault') return;
      if (!info || typeof info !== 'object') return;
      const moduleKey = info.moduleKey;
      if (!moduleKey) return;
      if (
        !hasTransactionFormAccess(info, branchId, departmentId, {
          allowTemporaryAnyScope: true,
          userRights,
          workplaceId,
          workplaceSessionId,
        })
      )
        return;
      if (
        perms &&
        Object.prototype.hasOwnProperty.call(perms, moduleKey) &&
        !perms[moduleKey]
      ) {
        return;
      }
      if (
        licensed &&
        Object.prototype.hasOwnProperty.call(licensed, moduleKey) &&
        !licensed[moduleKey]
      ) {
        return;
      }
      keys.add(moduleKey);
      if (info.moduleLabel) {
        labels[moduleKey] = info.moduleLabel;
      }
    });
  }

  return { keys, labels };
}

function statesEqual(a, b) {
  if (!a || !b) return false;
  const aKeys = a.keys || new Set();
  const bKeys = b.keys || new Set();
  if (aKeys.size !== bKeys.size) return false;
  for (const key of aKeys) {
    if (!bKeys.has(key)) return false;
  }
  const aLabels = a.labels || {};
  const bLabels = b.labels || {};
  const aLabelKeys = Object.keys(aLabels);
  const bLabelKeys = Object.keys(bLabels);
  if (aLabelKeys.length !== bLabelKeys.length) return false;
  for (const key of aLabelKeys) {
    if (aLabels[key] !== bLabels[key]) return false;
  }
  return true;
}

function createEmptyState() {
  return { keys: new Set(), labels: {} };
}

export function refreshTxnModules() {
  cache.forms = null;
  cache.branchId = undefined;
  cache.departmentId = undefined;
  cache.companyId = undefined;
  emitter.dispatchEvent(new Event('refresh'));
}

export function useTxnModules() {
  const { branch, department, company, permissions: perms, session } = useContext(AuthContext);
  const licensed = useCompanyModules(company);
  const [state, setState] = useState(() => createEmptyState());

  const userRights = useMemo(() => {
    const source =
      perms?.permissions && typeof perms.permissions === 'object'
        ? perms.permissions
        : session?.permissions && typeof session.permissions === 'object'
        ? session.permissions
        : {};
    return Object.entries(source)
      .filter(([, allowed]) => Boolean(allowed))
      .map(([key]) => key);
  }, [perms, session]);

  const workplaceId =
    session?.workplace_id ?? session?.workplaceId ?? null;
  const workplaceSessionId =
    session?.workplace_session_id ?? session?.workplaceSessionId ?? null;

  function applyDerivedState(data) {
    const derived = deriveTxnModuleState(
      data,
      branch,
      department,
      perms,
      licensed,
      userRights,
      workplaceId,
      workplaceSessionId,
    );
    setState((prev) => (statesEqual(prev, derived) ? prev : derived));
  }

  async function fetchForms() {
    const currentBranch = branch;
    const currentDepartment = department;
    const currentCompany = company;

    try {
      const params = new URLSearchParams();
      if (currentBranch !== undefined && currentBranch !== null && `${currentBranch}`.trim() !== '') {
        params.set('branchId', currentBranch);
      }
      if (
        currentDepartment !== undefined &&
        currentDepartment !== null &&
        `${currentDepartment}`.trim() !== ''
      ) {
        params.set('departmentId', currentDepartment);
      }
      const res = await fetch(
        `/api/transaction_forms${params.toString() ? `?${params.toString()}` : ''}`,
        { credentials: 'include' },
      );
      const data = res.ok ? await res.json() : {};
      if (
        branch !== currentBranch ||
        department !== currentDepartment ||
        company !== currentCompany
      ) {
        // Scope changed while request was in-flight; ignore this response.
        return;
      }
      cache.forms = data;
      cache.branchId = currentBranch;
      cache.departmentId = currentDepartment;
      cache.companyId = currentCompany;
      applyDerivedState(data);
    } catch (err) {
      console.error('Failed to load transaction modules', err);
      cache.forms = {};
      cache.branchId = currentBranch;
      cache.departmentId = currentDepartment;
      cache.companyId = currentCompany;
      applyDerivedState({});
    }
  }

  useEffect(() => {
    debugLog('useTxnModules effect: initial fetch');
    if (
      !cache.forms ||
      cache.branchId !== branch ||
      cache.departmentId !== department ||
      cache.companyId !== company
    ) {
      setState((prev) => (prev.keys.size === 0 && Object.keys(prev.labels).length === 0 ? prev : createEmptyState()));
      fetchForms();
    } else {
      applyDerivedState(cache.forms);
    }
  }, [
    branch,
    department,
    company,
    perms,
    licensed,
    userRights,
    workplaceId,
    workplaceSessionId,
  ]);

  useEffect(() => {
    debugLog('useTxnModules effect: refresh listener');
    const handler = () => fetchForms();
    emitter.addEventListener('refresh', handler);
    return () => emitter.removeEventListener('refresh', handler);
  }, [branch, department, company, perms, licensed]);

  return state;
}
