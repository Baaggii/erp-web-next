export function getCookieName() {
  const name = process.env.COOKIE_NAME;
  return name && name !== 'undefined' ? name : 'token';
}

export function getRefreshCookieName() {
  const name = process.env.REFRESH_COOKIE_NAME;
  return name && name !== 'undefined' ? name : 'refresh_token';
}
