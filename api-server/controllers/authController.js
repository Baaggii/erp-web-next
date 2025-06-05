import { getUserByEmpId } from '../../db/index.js';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret';

export async function login(req, res, next) {
  try {
    const { empid, password } = req.body;
    const user = await getUserByEmpId(empid);
    if (!user || !(await user.verifyPassword(password))) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    const token = jwt.sign(
      { id: user.id, empid: user.empid, email: user.email },
      JWT_SECRET,
      {
        expiresIn: '2h'
      }
    );

    res.cookie(process.env.COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax'
    });
    res.json({ id: user.id, empid: user.empid, email: user.email });
  } catch (err) {
    next(err);
  }
}

export async function logout(req, res) {
  res.clearCookie(process.env.COOKIE_NAME);
  res.sendStatus(204);
}

export async function getProfile(req, res) {
  res.json({ id: req.user.id, empid: req.user.empid, email: req.user.email });
}
