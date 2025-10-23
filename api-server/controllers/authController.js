import {
  getUserByEmpId,
  getUserById,
  updateUserPassword,
  getEmploymentSession,
  getEmploymentSessions,
  getUserLevelActions,
} from '../../db/index.js';
import { hash } from '../services/passwordService.js';
import * as jwtService from '../services/jwtService.js';
import { getCookieName, getRefreshCookieName } from '../utils/cookieNames.js';

function normalizeNumericId(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeWorkplaceAssignments(assignments = []) {
  const normalized = [];
  const sessionIds = [];

  assignments.forEach((assignment) => {
    if (!assignment || typeof assignment !== 'object') return;
    const workplaceId = normalizeNumericId(assignment.workplace_id);
    const rawSessionId =
      assignment.workplace_session_id !== undefined
        ? assignment.workplace_session_id
        : assignment.workplaceSessionId;
    const workplaceSessionId =
      normalizeNumericId(rawSessionId) ?? workplaceId ?? null;
    const normalizedAssignment = {
      ...assignment,
      workplace_id: workplaceId,
      workplace_session_id: workplaceSessionId,
    };
    normalized.push(normalizedAssignment);
    if (
      workplaceSessionId !== null &&
      !sessionIds.includes(workplaceSessionId)
    ) {
      sessionIds.push(workplaceSessionId);
    }
  });

  return { assignments: normalized, sessionIds };
}

function normalizeEmploymentSession(session, assignments = []) {
  if (!session || typeof session !== 'object') {
    return session ?? null;
  }

  const { assignments: normalizedAssignments, sessionIds } =
    normalizeWorkplaceAssignments(assignments);
  const normalizedWorkplaceId = normalizeNumericId(session.workplace_id);
  const normalizedSessionId = normalizeNumericId(session.workplace_session_id);
  const fallbackWorkplaceId =
    normalizedWorkplaceId ??
    (normalizedAssignments.find((item) => item.workplace_id !== null)?.workplace_id ??
      null);
  const fallbackSessionId =
    normalizedSessionId ??
    fallbackWorkplaceId ??
    (sessionIds.length ? sessionIds[0] : null);

  return {
    ...session,
    workplace_id: fallbackWorkplaceId,
    workplace_session_id: fallbackSessionId,
    workplace_assignments: normalizedAssignments,
    workplace_session_ids: sessionIds,
  };
}

function dedupeSessionsByCompany(sessions = []) {
  if (!Array.isArray(sessions) || sessions.length === 0) {
    return [];
  }

  const map = new Map();
  sessions.forEach((session) => {
    if (!session || typeof session !== 'object') return;
    const companyId = session.company_id ?? null;
    if (!map.has(companyId)) {
      map.set(companyId, session);
      return;
    }

    const current = map.get(companyId);
    const currentHasSchedule = current?.workplace_session_id != null;
    const incomingHasSchedule = session.workplace_session_id != null;
    if (incomingHasSchedule && !currentHasSchedule) {
      map.set(companyId, session);
    }
  });

  return Array.from(map.values());
}

function filterCurrentScheduleAssignments(sessions, companyId) {
  if (!Array.isArray(sessions) || sessions.length === 0) {
    return [];
  }

  const deduped = [];
  const seen = new Set();

  sessions.forEach((item) => {
    if (!item || typeof item !== 'object') return;
    if (item.company_id !== companyId) return;
    if (item.workplace_session_id == null) return;

    const key = [
      item.workplace_session_id ?? 'null',
      item.workplace_id ?? 'null',
      item.branch_id ?? 'null',
      item.department_id ?? 'null',
    ].join('|');

    if (seen.has(key)) return;
    seen.add(key);

    deduped.push({
      branch_id: item.branch_id ?? null,
      branch_name: item.branch_name ?? null,
      department_id: item.department_id ?? null,
      department_name: item.department_name ?? null,
      workplace_id: item.workplace_id ?? null,
      workplace_name: item.workplace_name ?? null,
      workplace_session_id: item.workplace_session_id ?? null,
    });
  });

  return deduped;
}

export async function login(req, res, next) {
  try {
    const { empid, password, companyId } = req.body;
    const user = await getUserByEmpId(empid);
    if (!user || !(await user.verifyPassword(password))) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const sessions = await getEmploymentSessions(empid);
    if (!Array.isArray(sessions) || sessions.length === 0) {
      return res
        .status(403)
        .json({ message: 'No employment record found for employee' });
    }

    const companySessions = dedupeSessionsByCompany(sessions);
    let session = null;
    if (companyId == null) {
      if (companySessions.length > 1) {
        return res.json({ needsCompany: true, sessions: companySessions });
      }
      session = companySessions[0] ?? null;
    } else {
      const numericCompanyId = Number(companyId);
      if (!Number.isFinite(numericCompanyId)) {
        return res.status(400).json({ message: 'Invalid company selection' });
      }
      session =
        companySessions.find((s) => s.company_id === numericCompanyId) ?? null;
      if (!session) {
        return res.status(400).json({ message: 'Invalid company selection' });
      }
    }

    if (!session) {
      return res
        .status(403)
        .json({ message: 'No employment session available for login' });
    }

    const workplaceAssignments = session
      ? filterCurrentScheduleAssignments(sessions, session.company_id)
      : [];

    const sessionPayload = session
      ? normalizeEmploymentSession(session, workplaceAssignments)
      : null;

    const permissions =
      sessionPayload?.user_level && sessionPayload?.company_id
        ? await getUserLevelActions(
            sessionPayload.user_level,
            sessionPayload.company_id,
          )
        : {};

    const {
      company_id: company = null,
      branch_id: branch = null,
      department_id: department = null,
      position_id = null,
      position = null,
      senior_empid = null,
      senior_plan_empid = null,
    } = sessionPayload || {};

    const payload = {
      id: user.id,
      empid: user.empid,
      position,
      companyId: company,
      userLevel: sessionPayload?.user_level ?? null,
      seniorPlanEmpid: senior_plan_empid || null,
    };
    const token = jwtService.sign(payload);
    const refreshToken = jwtService.signRefresh(payload);

    res.cookie(getCookieName(), token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: jwtService.getExpiryMillis(),
    });
    res.cookie(getRefreshCookieName(), refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: jwtService.getRefreshExpiryMillis(),
    });
    res.json({
      id: user.id,
      empid: user.empid,
      position,
      full_name: sessionPayload?.employee_name,
      user_level: sessionPayload?.user_level,
      user_level_name: sessionPayload?.user_level_name,
      company,
      branch,
      department,
      position_id,
      position,
      senior_empid,
      senior_plan_empid,
      workplace: sessionPayload?.workplace_id ?? null,
      workplace_session_id: sessionPayload?.workplace_session_id ?? null,
      workplace_session_ids: sessionPayload?.workplace_session_ids ?? [],
      workplace_name: sessionPayload?.workplace_name ?? null,
      session: sessionPayload,
      permissions,
    });
  } catch (err) {
    next(err);
  }
}

export async function logout(req, res) {
  const opts = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
  };
  res.clearCookie(getCookieName(), opts);
  res.clearCookie(getRefreshCookieName(), opts);
  res.sendStatus(204);
}

export async function getProfile(req, res) {
  const [session, sessions] = await Promise.all([
    getEmploymentSession(req.user.empid, req.user.companyId),
    getEmploymentSessions(req.user.empid),
  ]);

  const workplaceAssignments = session
    ? filterCurrentScheduleAssignments(sessions, session.company_id)
    : [];

  const sessionPayload = session
    ? normalizeEmploymentSession(session, workplaceAssignments)
    : null;

  const permissions = sessionPayload?.user_level
    ? await getUserLevelActions(
        sessionPayload.user_level,
        sessionPayload.company_id,
      )
    : {};
  const {
    company_id: company,
    branch_id: branch,
    department_id: department,
    position_id,
    position,
    senior_empid,
    senior_plan_empid,
    workplace_id,
    workplace_name,
  } = sessionPayload || {};
  res.json({
    id: req.user.id,
    empid: req.user.empid,
    position: req.user.position,
    full_name: sessionPayload?.employee_name,
    user_level: sessionPayload?.user_level,
    user_level_name: sessionPayload?.user_level_name,
    company,
    branch,
    department,
    position_id,
    position,
    senior_empid,
    senior_plan_empid,
    workplace: workplace_id ?? null,
    workplace_session_id: sessionPayload?.workplace_session_id ?? null,
    workplace_session_ids: sessionPayload?.workplace_session_ids ?? [],
    workplace_name: workplace_name ?? null,
    session: sessionPayload,
    permissions,
  });
}

export async function changePassword(req, res, next) {
  try {
    const { password } = req.body;
    if (!password) {
      return res.status(400).json({ message: 'Password required' });
    }
    const hashed = await hash(password);
    await updateUserPassword(req.user.id, hashed, req.user.id);
    res.sendStatus(204);
  } catch (err) {
    next(err);
  }
}

export async function refresh(req, res) {
  const token = req.cookies?.[process.env.REFRESH_COOKIE_NAME || 'refresh_token'];
  if (!token) {
    return res.status(401).json({ message: 'Refresh token missing' });
  }
  try {
    const payload = jwtService.verifyRefresh(token);
    const user = await getUserById(payload.id);
    if (!user) throw new Error('User not found');
    const [session, sessions] = await Promise.all([
      getEmploymentSession(user.empid, payload.companyId),
      getEmploymentSessions(user.empid),
    ]);

    const workplaceAssignments = session
      ? filterCurrentScheduleAssignments(sessions, session.company_id)
      : [];

    const sessionPayload = session
      ? normalizeEmploymentSession(session, workplaceAssignments)
      : null;

    const permissions = sessionPayload?.user_level
      ? await getUserLevelActions(
          sessionPayload.user_level,
          sessionPayload.company_id,
        )
      : {};
    const {
      company_id: company,
      branch_id: branch,
      department_id: department,
      position_id,
      position,
      senior_empid,
      senior_plan_empid,
      workplace_id,
      workplace_name,
    } = sessionPayload || {};
    const newPayload = {
      id: user.id,
      empid: user.empid,
      position,
      companyId: company,
      userLevel: sessionPayload?.user_level,
      seniorPlanEmpid: senior_plan_empid || null,
    };
    const newAccess = jwtService.sign(newPayload);
    const newRefresh = jwtService.signRefresh(newPayload);
    res.cookie(getCookieName(), newAccess, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: jwtService.getExpiryMillis(),
    });
    res.cookie(getRefreshCookieName(), newRefresh, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: jwtService.getRefreshExpiryMillis(),
    });
    res.json({
      id: user.id,
      empid: user.empid,
      position,
      full_name: sessionPayload?.employee_name,
      user_level: sessionPayload?.user_level,
      user_level_name: sessionPayload?.user_level_name,
      company,
      branch,
      department,
      position_id,
      position,
      senior_empid,
      senior_plan_empid,
      workplace: workplace_id ?? null,
      workplace_session_id: sessionPayload?.workplace_session_id ?? null,
      workplace_session_ids: sessionPayload?.workplace_session_ids ?? [],
      workplace_name: workplace_name ?? null,
      session: sessionPayload,
      permissions,
    });
  } catch (err) {
    const opts = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
    };
    res.clearCookie(getCookieName(), opts);
    res.clearCookie(getRefreshCookieName(), opts);
    return res.status(401).json({ message: 'Invalid or expired refresh token' });
  }
}
