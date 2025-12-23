import { useEffect, useState, useContext } from 'react';
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
  userRightId: undefined,
  workplaceId: undefined,
  positionId: undefined,
};
const emitter = new EventTarget();

function deriveTxnModuleState(
  data,
  branch,
  department,
  userRight,
  workplaceId,
  positionId,
  workplacePositionId,
  workplacePositions,
  perms,
  licensed,
) {
  const branchId = branch != null ? String(branch) : null;
  const departmentId = department != null ? String(department) : null;
  const userRightId = userRight != null ? String(userRight) : null;
  const workplace = workplaceId != null ? String(workplaceId) : null;
  const position = positionId != null ? String(positionId) : null;
  const workplacePosition = workplacePositionId != null ? String(workplacePositionId) : null;
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
          userRightId,
          workplaceId: workplace,
          positionId: position,
          workplacePositionId: workplacePosition,
          workplacePositions,
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
  cache.userRightId = undefined;
  cache.workplaceId = undefined;
  cache.positionId = undefined;
  emitter.dispatchEvent(new Event('refresh'));
}

export function useTxnModules() {
  const {
    branch,
    department,
    company,
    permissions: perms,
    session,
    user,
    workplace,
    position,
  } = useContext(AuthContext);
  const licensed = useCompanyModules(company);
  const [state, setState] = useState(() => createEmptyState());

  function applyDerivedState(data) {
    const userRightId =
      user?.userLevel ??
      user?.userlevel_id ??
      user?.userlevelId ??
      session?.user_level ??
      session?.userlevel_id ??
      session?.userlevelId ??
      null;
    const workplaceId =
      workplace ?? session?.workplace_id ?? session?.workplaceId ?? null;
    const workplaceIds = Array.isArray(session?.workplace_assignments)
      ? session.workplace_assignments
          .map((wp) => wp?.workplace_id ?? wp?.workplaceId ?? null)
          .filter((val) => val !== null && val !== undefined)
      : [];
    const positionId =
      position ??
      session?.employment_position_id ??
      session?.position_id ??
      session?.position ??
      null;
    const workplacePositionId =
      session?.workplace_position_id ?? session?.workplacePositionId ?? null;
    const workplacePositions = session?.workplace_assignments;
    const derived = deriveTxnModuleState(
      data,
      branch,
      department,
      userRightId,
      workplaceId,
      positionId,
      workplacePositionId,
      workplacePositions,
      perms,
      licensed,
    );
    setState((prev) => (statesEqual(prev, derived) ? prev : derived));
  }

  async function fetchForms() {
    const currentBranch = branch;
    const currentDepartment = department;
    const currentCompany = company;
    const currentUserRight =
      user?.userLevel ??
      user?.userlevel_id ??
      user?.userlevelId ??
      session?.user_level ??
      session?.userlevel_id ??
      session?.userlevelId ??
      null;
    const currentWorkplace =
      workplace ?? session?.workplace_id ?? session?.workplaceId ?? null;
    const currentWorkplaceIds = Array.isArray(session?.workplace_assignments)
      ? session.workplace_assignments
          .map((wp) => wp?.workplace_id ?? wp?.workplaceId ?? null)
          .filter((val) => val !== null && val !== undefined)
      : [];
    const currentPosition =
      position ??
      session?.employment_position_id ??
      session?.position_id ??
      session?.position ??
      null;
    const currentWorkplacePosition =
      session?.workplace_position_id ?? session?.workplacePositionId ?? null;
    const currentWorkplaceAssignments = session?.workplace_assignments;

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
      if (currentUserRight !== undefined && currentUserRight !== null && `${currentUserRight}`.trim() !== '') {
        params.set('userRightId', currentUserRight);
      }
      if (currentWorkplace !== undefined && currentWorkplace !== null && `${currentWorkplace}`.trim() !== '') {
        params.set('workplaceId', currentWorkplace);
      }
      if (currentPosition !== undefined && currentPosition !== null && `${currentPosition}`.trim() !== '') {
        params.set('positionId', currentPosition);
      }
      if (
        currentWorkplacePosition !== undefined &&
        currentWorkplacePosition !== null &&
        `${currentWorkplacePosition}`.trim() !== ''
      ) {
        params.set('workplacePositionId', currentWorkplacePosition);
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
      cache.userRightId = currentUserRight;
      cache.workplaceId = currentWorkplace;
      cache.positionId = currentPosition;
      cache.workplacePositionId = currentWorkplacePosition;
      applyDerivedState(data);
    } catch (err) {
      console.error('Failed to load transaction modules', err);
      cache.forms = {};
      cache.branchId = currentBranch;
      cache.departmentId = currentDepartment;
      cache.companyId = currentCompany;
      cache.userRightId = currentUserRight;
      cache.workplaceId = currentWorkplace;
      cache.positionId = currentPosition;
      cache.workplacePositionId = currentWorkplacePosition;
      applyDerivedState({});
    }
  }

  useEffect(() => {
    debugLog('useTxnModules effect: initial fetch');
    if (
      !cache.forms ||
      cache.branchId !== branch ||
      cache.departmentId !== department ||
      cache.companyId !== company ||
      cache.userRightId !==
        (user?.userLevel ??
          user?.userlevel_id ??
          user?.userlevelId ??
          session?.user_level ??
          session?.userlevel_id ??
          session?.userlevelId ??
          null) ||
      cache.workplaceId !== (workplace ?? session?.workplace_id ?? session?.workplaceId ?? null) ||
      cache.positionId !==
        (position ??
          session?.employment_position_id ??
          session?.position_id ??
          session?.position ??
          null)
    ) {
      setState((prev) => (prev.keys.size === 0 && Object.keys(prev.labels).length === 0 ? prev : createEmptyState()));
      fetchForms();
    } else {
      applyDerivedState(cache.forms);
    }
  }, [branch, department, company, perms, licensed, session, user, workplace, position]);

  useEffect(() => {
    debugLog('useTxnModules effect: refresh listener');
    const handler = () => fetchForms();
    emitter.addEventListener('refresh', handler);
    return () => emitter.removeEventListener('refresh', handler);
  }, [branch, department, company, perms, licensed, session, user, workplace]);

  return state;
}
