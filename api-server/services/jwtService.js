import jwt from 'jsonwebtoken';
const secret = process.env.JWT_SECRET;
const expiresIn = process.env.JWT_EXPIRES_IN || '1d';
const refreshSecret = process.env.JWT_REFRESH_SECRET || secret;
const refreshExpiresIn = process.env.JWT_REFRESH_EXPIRES_IN || '7d';

export function sign(payload) {
  return jwt.sign(payload, secret, { expiresIn });
}
export function verify(token) {
  return jwt.verify(token, secret);
}
export function signRefresh(payload) {
  return jwt.sign(payload, refreshSecret, { expiresIn: refreshExpiresIn });
}
export function verifyRefresh(token) {
  return jwt.verify(token, refreshSecret);
}
export function getExpiryMillis() {
  // parse "1d" to milliseconds
  return 24 * 60 * 60 * 1000;
}
