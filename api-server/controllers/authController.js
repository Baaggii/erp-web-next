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
      return res.status(403).json({ message: 'No active employment found' });
    }

    let session;
    if (!companyId) {
      if (sessions.length > 1) {
        return res.json({ needsCompany: true, sessions });
      }
      session = sessions[0];
    } else {
      session = sessions.find((s) => s.company_id === Number(companyId));
      if (!session) {
        return res.status(400).json({ message: 'Invalid company selection' });
      }
    }

    const permissions = await getUserLevelActions(session.user_level);
    const {
      company_id: company,
      branch_id: branch,
      department_id: department,
      position_id,
      position,
      employment_senior_empid,
    } = session || {};

    const payload = {
      id: user.id,
      empid: user.empid,
      position,
      companyId: company,
      userLevel: session.user_level,
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
      full_name: session?.employee_name,
      user_level: session?.user_level,
      user_level_name: session?.user_level_name,
      company,
      branch,
      department,
      position_id,
      position,
      employment_senior_empid,
      session,
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
  const session = await getEmploymentSession(req.user.empid, req.user.companyId);
  const permissions = session?.user_level
    ? await getUserLevelActions(session.user_level)
    : {};
  const {
    company_id: company,
    branch_id: branch,
    department_id: department,
    position_id,
    position,
    employment_senior_empid,
  } = session || {};
  res.json({
    id: req.user.id,
    empid: req.user.empid,
    position: req.user.position,
    full_name: session?.employee_name,
    user_level: session?.user_level,
    user_level_name: session?.user_level_name,
    company,
    branch,
    department,
    position_id,
    position,
    employment_senior_empid,
    session,
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
    await updateUserPassword(req.user.id, hashed);
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
    const session = await getEmploymentSession(user.empid, payload.companyId);
    const permissions = session?.user_level
      ? await getUserLevelActions(session.user_level)
      : {};
    const {
      company_id: company,
      branch_id: branch,
      department_id: department,
      position_id,
      position,
      employment_senior_empid,
    } = session || {};
    const newPayload = {
      id: user.id,
      empid: user.empid,
      position,
      companyId: company,
      userLevel: session.user_level,
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
      full_name: session?.employee_name,
      user_level: session?.user_level,
      user_level_name: session?.user_level_name,
      company,
      branch,
      department,
      position_id,
      position,
      employment_senior_empid,
      session,
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
