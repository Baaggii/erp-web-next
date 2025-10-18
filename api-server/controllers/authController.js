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

export async function login(req, res, next) {
  try {
    const { empid, password, companyId } = req.body;
    const user = await getUserByEmpId(empid);
    if (!user || !(await user.verifyPassword(password))) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const sessions = await getEmploymentSessions(empid);
    if (sessions.length === 0) {
      return res.status(403).json({ message: 'No active workplace schedule found' });
    }

    let session = null;
    if (companyId == null) {
      if (sessions.length > 1) {
        return res.json({ needsCompany: true, sessions });
      }
      session = sessions[0] ?? null;
    } else {
      session = sessions.find((s) => s.company_id === Number(companyId)) ?? null;
      if (!session && sessions.length > 0) {
        return res.status(400).json({ message: 'Invalid company selection' });
      }
    }

    const workplaceAssignments = session
      ? sessions
          .filter((s) => s.company_id === session.company_id)
          .map(
            ({
              branch_id,
              branch_name,
              department_id,
              department_name,
              workplace_id,
              workplace_name,
              workplace_session_id,
            }) => ({
              branch_id: branch_id ?? null,
              branch_name: branch_name ?? null,
              department_id: department_id ?? null,
              department_name: department_name ?? null,
              workplace_id: workplace_id ?? null,
              workplace_name: workplace_name ?? null,
              workplace_session_id: workplace_session_id ?? null,
            }),
          )
      : [];

    const sessionPayload = session
      ? { ...session, workplace_assignments: workplaceAssignments }
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
    ? sessions
        .filter((s) => s.company_id === session.company_id)
        .map(
          ({
            branch_id,
            branch_name,
            department_id,
            department_name,
            workplace_id,
            workplace_name,
            workplace_session_id,
          }) => ({
            branch_id: branch_id ?? null,
            branch_name: branch_name ?? null,
            department_id: department_id ?? null,
            department_name: department_name ?? null,
            workplace_id: workplace_id ?? null,
            workplace_name: workplace_name ?? null,
            workplace_session_id: workplace_session_id ?? null,
          }),
        )
    : [];

  const sessionPayload = session
    ? { ...session, workplace_assignments: workplaceAssignments }
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
      ? sessions
          .filter((s) => s.company_id === session.company_id)
          .map(
            ({
              branch_id,
              branch_name,
              department_id,
              department_name,
              workplace_id,
              workplace_name,
              workplace_session_id,
            }) => ({
              branch_id: branch_id ?? null,
              branch_name: branch_name ?? null,
              department_id: department_id ?? null,
              department_name: department_name ?? null,
              workplace_id: workplace_id ?? null,
              workplace_name: workplace_name ?? null,
              workplace_session_id: workplace_session_id ?? null,
            }),
          )
      : [];

    const sessionPayload = session
      ? { ...session, workplace_assignments: workplaceAssignments }
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
