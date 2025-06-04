import { getUserByEmail } from '../../db/index.js'; // adjust path to your db folder
import jwt from 'jsonwebtoken';

export async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    const user = await getUserByEmail(email);
    if (!user || !(await user.verifyPassword(password))) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    const token = jwt.sign(
      { id: user.id, email: user.email, empid: user.empid },
      process.env.JWT_SECRET,
      {
        expiresIn: '2h'
      }
    );

    res.cookie(process.env.COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax'
    });
    res.json({ id: user.id, email: user.email, empid: user.empid });
  } catch (err) {
    next(err);
  }
}

export async function logout(req, res) {
  res.clearCookie(process.env.COOKIE_NAME);
  res.sendStatus(204);
}

export async function getProfile(req, res) {
  res.json({ id: req.user.id, email: req.user.email, empid: req.user.empid });
}
