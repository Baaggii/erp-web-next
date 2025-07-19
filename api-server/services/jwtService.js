let jwt;
try {
  const mod = await import('jsonwebtoken');
  jwt = mod.default || mod;
} catch {
  jwt = {
    sign: () => '',
    verify: () => ({}),
    signRefresh: () => '',
    verifyRefresh: () => ({}),
  };
}

const secret = process.env.JWT_SECRET;
const expiresIn = process.env.JWT_EXPIRES_IN || '2h';
const refreshSecret = process.env.JWT_REFRESH_SECRET || secret;
const refreshExpiresIn = process.env.JWT_REFRESH_EXPIRES_IN || '7d';

function parseDuration(str, fallback) {
  const match = /^([0-9]+)([smhd])$/.exec(str);
  if (!match) return fallback;
  const num = parseInt(match[1], 10);
  const unit = match[2];
  const unitMap = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  return num * unitMap[unit];
}

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
  return parseDuration(expiresIn, 2 * 60 * 60 * 1000);
}
export function getRefreshExpiryMillis() {
  return parseDuration(refreshExpiresIn, 7 * 24 * 60 * 60 * 1000);
}
