import { getUserByEmpId, getUserById, updateUserPassword } from '../../db/index.js';
import { hash } from '../services/passwordService.js';
import * as jwtService from '../services/jwtService.js';

export async function login(req, res, next) {
  try {
    const { empid, password } = req.body;
    const user = await getUserByEmpId(empid);
    if (!user || !(await user.verifyPassword(password))) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    const token = jwtService.sign({
      id: user.id,
      empid: user.empid,
      role: user.role,
    });

    const refreshToken = jwtService.signRefresh({ id: user.id });

    res.cookie(process.env.COOKIE_NAME || 'token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: jwtService.getExpiryMillis(),
    });
    res.cookie(process.env.REFRESH_COOKIE_NAME || 'refresh_token', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: jwtService.getRefreshExpiryMillis(),
    });
    res.json({
      id: user.id,
      empid: user.empid,
      role: user.role,
    });
  } catch (err) {
    next(err);
  }
}

export async function logout(req, res) {
  res.clearCookie(process.env.COOKIE_NAME || 'token');
  res.clearCookie(process.env.REFRESH_COOKIE_NAME || 'refresh_token');
  res.sendStatus(204);
}

export async function getProfile(req, res) {
  res.json({
    id: req.user.id,
    empid: req.user.empid,
    role: req.user.role,
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
    const newAccess = jwtService.sign({
      id: user.id,
      empid: user.empid,
      role: user.role,
    });
    res.cookie(process.env.COOKIE_NAME || 'token', newAccess, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: jwtService.getExpiryMillis(),
    });
    res.json({
      id: user.id,
      empid: user.empid,
      role: user.role,
    });
  } catch (err) {
    res.clearCookie(process.env.COOKIE_NAME || 'token');
    res.clearCookie(process.env.REFRESH_COOKIE_NAME || 'refresh_token');
    return res.status(401).json({ message: 'Invalid or expired refresh token' });
  }
}
