import { getUserByEmail, getUserById, updateUserPassword } from '../../db/index.js';
import { hash } from '../services/passwordService.js';
import jwt from 'jsonwebtoken';

export async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    const user = await getUserByEmail(email);
    if (!user || !(await user.verifyPassword(password))) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        empid: user.empid,
        role: user.role,
        name: user.name,
      },
      process.env.JWT_SECRET,
      {
        expiresIn: process.env.JWT_EXPIRES_IN || '2h'
      }
    );

    const refreshToken = jwt.sign(
      { id: user.id },
      process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' }
    );

    res.cookie(process.env.COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax'
    });
    res.cookie(process.env.REFRESH_COOKIE_NAME || 'refresh_token', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax'
    });
    res.json({
      id: user.id,
      email: user.email,
      empid: user.empid,
      role: user.role,
      name: user.name,
    });
  } catch (err) {
    next(err);
  }
}

export async function logout(req, res) {
  res.clearCookie(process.env.COOKIE_NAME);
  res.clearCookie(process.env.REFRESH_COOKIE_NAME || 'refresh_token');
  res.sendStatus(204);
}

export async function getProfile(req, res) {
  res.json({
    id: req.user.id,
    email: req.user.email,
    empid: req.user.empid,
    role: req.user.role,
    name: req.user.name,
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
    const payload = jwt.verify(
      token,
      process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET,
    );
    const user = await getUserById(payload.id);
    if (!user) throw new Error('User not found');
    const newAccess = jwt.sign(
      {
        id: user.id,
        email: user.email,
        empid: user.empid,
        role: user.role,
        name: user.name,
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '2h' },
    );
    res.cookie(process.env.COOKIE_NAME, newAccess, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
    });
    res.json({
      id: user.id,
      email: user.email,
      empid: user.empid,
      role: user.role,
      name: user.name,
    });
  } catch (err) {
    res.clearCookie(process.env.COOKIE_NAME);
    res.clearCookie(process.env.REFRESH_COOKIE_NAME || 'refresh_token');
    return res.status(401).json({ message: 'Invalid or expired refresh token' });
  }
}
