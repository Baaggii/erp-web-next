import jwtService from '../services/jwtService.js';
import { findUserByEmail, findUserById } from '../db/index.js';
import bcrypt from 'bcryptjs';

export async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    const user = await findUserByEmail(email);
    if (!user) return res.status(401).json({ message: 'Unknown user' });
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ message: 'Invalid password' });
    const payload = { id: user.id, companies: user.companies };
    const token = jwtService.sign(payload);
    res.cookie(process.env.COOKIE_NAME, token, {
      httpOnly: true,
      maxAge: jwtService.getExpiryMillis()
    });
    res.json({ message: 'Login successful', user: { id: user.id, email: user.email } });
  } catch (err) {
    next(err);
  }
}

export function logout(req, res) {
  res.clearCookie(process.env.COOKIE_NAME);
  res.json({ message: 'Logged out' });
}

export async function getProfile(req, res, next) {
  try {
    const user = await findUserById(req.user.id);
    res.json({ id: user.id, email: user.email, roles: user.roles });
  } catch (err) {
    next(err);
  }
}