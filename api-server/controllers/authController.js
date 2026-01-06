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
import {
  getCookieName,
  getRefreshCookieName,
  getPosSessionCookieName,
} from '../utils/cookieNames.js';
import { normalizeEmploymentSession } from '../utils/employmentSession.js';
import { normalizeNumericId } from '../utils/workplaceAssignments.js';
import {
  recordLoginSession,
  recordLogoutSession,
} from '../services/posSessionLogger.js';

export async function login(req, res, next) {
  try {
    const { empid, password, companyId } = req.body;
    const warnings = [];
    const user = await getUserByEmpId(empid);
    if (!user || !(await user.verifyPassword(password))) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const effectiveDate = new Date();
    let sessions = [];
    let sessionFetchFailed = false;
    try {
      sessions = await getEmploymentSessions(empid, {
        effectiveDate,
        includeDiagnostics: true,
      });
    } catch (err) {
      sessionFetchFailed = true;
      console.error('Failed to fetch employment sessions', err);
      if (err?.message) {
        warnings.push(`Employment session lookup failed: ${err.message}`);
      } else {
        warnings.push('Employment session lookup failed');
      }
    }
    if (!sessionFetchFailed) {
      if (!Array.isArray(sessions) || sessions.length === 0) {
        return res
          .status(403)
          .json({ message: 'No employment sessions available for this user' });
      }
    } else {
      sessions = [];
    }

    const companyGroups = new Map();
    sessions.forEach((session) => {
      if (!session || typeof session !== 'object') return;
      const normalizedCompanyId = normalizeNumericId(session.company_id);
      const groupKey =
        normalizedCompanyId === null
          ? `null:${session.company_name ?? ''}`
          : `id:${normalizedCompanyId}`;
      if (!companyGroups.has(groupKey)) {
        const name = session.company_name
          ? String(session.company_name).trim()
          : normalizedCompanyId !== null
            ? `Company #${normalizedCompanyId}`
            : 'Unknown company';
        companyGroups.set(groupKey, {
          companyId: normalizedCompanyId,
          companyName: name,
          sessions: [],
        });
      }
      companyGroups.get(groupKey).sessions.push(session);
    });

    const pickDefaultSession = (items = []) => {
      if (!Array.isArray(items) || items.length === 0) return null;
      const withWorkplace = items.find((item) => item?.workplace_id != null);
      return withWorkplace ?? items[0];
    };

    const hasCompanySelection =
      companyId !== undefined && companyId !== null;
    let selectedCompanyId = null;
    let sessionPayload = null;
    let workplaceAssignments = [];
    let permissions = {};
    if (hasCompanySelection) {
      selectedCompanyId = normalizeNumericId(companyId);
      if (selectedCompanyId === null) {
        return res.status(400).json({ message: 'Invalid company selection' });
      }
    }

    if (!sessionFetchFailed) {
      let sessionGroup = null;
      if (!hasCompanySelection) {
        if (companyGroups.size > 1) {
          const options = Array.from(companyGroups.values()).map(
            ({ companyId: id, companyName: name }) => ({
              company_id: id,
              company_name: name,
            }),
          );
          options.sort((a, b) => {
            const nameA = (a.company_name || '').toLowerCase();
            const nameB = (b.company_name || '').toLowerCase();
            if (nameA < nameB) return -1;
            if (nameA > nameB) return 1;
            return 0;
          });
          return res.json({ needsCompany: true, sessions: options });
        }
        sessionGroup = companyGroups.values().next().value || null;
      } else {
        const key = `id:${selectedCompanyId}`;
        sessionGroup = companyGroups.get(key) || null;
        if (!sessionGroup) {
          return res.status(400).json({ message: 'Invalid company selection' });
        }
      }

      const session = pickDefaultSession(sessionGroup?.sessions || []);
      if (!session) {
        return res
          .status(403)
          .json({ message: 'No employment session found for the selected company' });
      }

      workplaceAssignments = (sessionGroup?.sessions || []).map(
        ({
          company_id,
          company_name,
          branch_id,
          branch_name,
          department_id,
          department_name,
          workplace_id,
          workplace_name,
          effective_start_date,
          effective_end_date,
        }) => ({
          company_id: company_id ?? null,
          company_name: company_name ?? null,
          branch_id: branch_id ?? null,
          branch_name: branch_name ?? null,
          department_id: department_id ?? null,
          department_name: department_name ?? null,
          workplace_id: workplace_id ?? null,
          workplace_name: workplace_name ?? null,
          effective_start_date: effective_start_date ?? null,
          effective_end_date: effective_end_date ?? null,
        }),
      );

      sessionPayload = session
        ? normalizeEmploymentSession(session, workplaceAssignments)
        : null;

      permissions =
        sessionPayload?.user_level && sessionPayload?.company_id
          ? await getUserLevelActions(
              sessionPayload.user_level,
              sessionPayload.company_id,
            )
          : {};
    } else {
      sessionPayload = null;
      permissions = {};
    }

    const {
      company_id: company = null,
      branch_id: branch = null,
      department_id: department = null,
      position_id = null,
      position = null,
      senior_empid = null,
      senior_plan_empid = null,
      pos_no,
      posNo,
      pos_name,
      branchNo,
      pos_districtCode,
      merchantTin,
    } = sessionPayload || {};
    const resolvedPosition = position_id ?? position ?? null;

    const payload = {
      id: user.id,
      empid: user.empid,
      position: resolvedPosition,
      companyId: company,
      userLevel: sessionPayload?.user_level ?? null,
      seniorPlanEmpid: senior_plan_empid || null,
      posNo: pos_no ?? posNo ?? null,
      branchNo: branchNo ?? null,
      posDistrictCode: pos_districtCode ?? null,
      merchantTin: merchantTin ?? null,
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
    try {
      const posSession = await recordLoginSession(req, sessionPayload, user);
      if (posSession?.sessionUuid) {
        res.cookie(getPosSessionCookieName(), posSession.sessionUuid, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: jwtService.getRefreshExpiryMillis(),
        });
      } else if (posSession?.error) {
        warnings.push(
          posSession.error?.message
            ? `POS session was not recorded: ${posSession.error.message}`
            : 'POS session was not recorded',
        );
      }
    } catch (err) {
      console.error('Failed to log POS session', err);
      warnings.push(
        err?.message
          ? `POS session was not recorded: ${err.message}`
          : 'POS session was not recorded',
      );
    }
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
      position: resolvedPosition,
      senior_empid,
      senior_plan_empid,
      pos_no: pos_no ?? posNo ?? null,
      pos_name: pos_name ?? null,
      pos_branch_no: branchNo ?? null,
      pos_district_code: pos_districtCode ?? null,
      pos_merchant_tin: merchantTin ?? null,
      workplace: sessionPayload?.workplace_id ?? null,
      workplace_name: sessionPayload?.workplace_name ?? null,
      workplace_assignments: sessionPayload?.workplace_assignments ?? [],
      session: sessionPayload,
      permissions,
      warnings,
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
  res.clearCookie(getPosSessionCookieName(), opts);
  try {
    await recordLogoutSession(req);
  } catch (err) {
    console.error('Failed to close POS session', err);
  }
  res.sendStatus(204);
}

export async function getProfile(req, res) {
  const effectiveDate = new Date();
  const [session, sessions] = await Promise.all([
    getEmploymentSession(req.user.empid, req.user.companyId, { effectiveDate }),
    getEmploymentSessions(req.user.empid, {
      effectiveDate,
      includeDiagnostics: true,
    }),
  ]);

  const workplaceAssignments = session
    ? sessions
        .filter((s) => s && s.company_id === session.company_id)
        .map(
          ({
            branch_id,
            branch_name,
            department_id,
            department_name,
            workplace_id,
            workplace_name,
            effective_start_date,
            effective_end_date,
          }) => ({
            branch_id: branch_id ?? null,
            branch_name: branch_name ?? null,
            department_id: department_id ?? null,
            department_name: department_name ?? null,
            workplace_id: workplace_id ?? null,
            workplace_name: workplace_name ?? null,
            effective_start_date: effective_start_date ?? null,
            effective_end_date: effective_end_date ?? null,
          }),
        )
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
    pos_no,
    posNo,
    pos_name,
    branchNo,
    pos_districtCode,
    merchantTin,
  } = sessionPayload || {};
  const resolvedPosition = position_id ?? position ?? null;
  res.json({
    id: req.user.id,
    empid: req.user.empid,
    position: resolvedPosition,
    full_name: sessionPayload?.employee_name,
    user_level: sessionPayload?.user_level,
    user_level_name: sessionPayload?.user_level_name,
    company,
    branch,
    department,
    position_id,
    position: resolvedPosition,
    senior_empid,
    senior_plan_empid,
    workplace: workplace_id ?? null,
    pos_no: pos_no ?? posNo ?? null,
    pos_name: pos_name ?? null,
    pos_branch_no: branchNo ?? null,
    pos_district_code: pos_districtCode ?? null,
    pos_merchant_tin: merchantTin ?? null,
    workplace_name: workplace_name ?? null,
    workplace_assignments: sessionPayload?.workplace_assignments ?? [],
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
    const effectiveDate = new Date();
    const [session, sessions] = await Promise.all([
      getEmploymentSession(user.empid, payload.companyId, { effectiveDate }),
      getEmploymentSessions(user.empid, {
        effectiveDate,
        includeDiagnostics: true,
      }),
    ]);

    const workplaceAssignments = session
      ? sessions
          .filter(
            (s) =>
              s.company_id === session.company_id &&
              s.workplace_id != null,
          )
          .map(
            ({
              branch_id,
              branch_name,
              department_id,
              department_name,
              workplace_id,
              workplace_name,
            }) => ({
              branch_id: branch_id ?? null,
              branch_name: branch_name ?? null,
              department_id: department_id ?? null,
              department_name: department_name ?? null,
              workplace_id: workplace_id ?? null,
              workplace_name: workplace_name ?? null,
            }),
          )
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
      pos_no,
      posNo,
      pos_name,
      branchNo,
      pos_districtCode,
      merchantTin,
    } = sessionPayload || {};
    const resolvedPosition = position_id ?? position ?? null;
    const newPayload = {
      id: user.id,
      empid: user.empid,
      position: resolvedPosition,
      companyId: company,
      userLevel: sessionPayload?.user_level,
      seniorPlanEmpid: senior_plan_empid || null,
      posNo: pos_no ?? posNo ?? null,
      branchNo: branchNo ?? null,
      posDistrictCode: pos_districtCode ?? null,
      merchantTin: merchantTin ?? null,
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
      position: resolvedPosition,
      senior_empid,
      senior_plan_empid,
      workplace: workplace_id ?? null,
      pos_no: pos_no ?? posNo ?? null,
      pos_name: pos_name ?? null,
      pos_branch_no: branchNo ?? null,
      pos_district_code: pos_districtCode ?? null,
      pos_merchant_tin: merchantTin ?? null,
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
