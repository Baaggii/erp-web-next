// api-server/utils/cookieOptions.js

const isProduction = process.env.NODE_ENV === 'production';
const sameSite = isProduction ? 'none' : 'lax';
const baseOptions = {
  httpOnly: true,
  secure: isProduction,
  sameSite,
};

/**
 * Returns cookie options configured for the current environment.
 * Values can be overridden per cookie via the `overrides` parameter.
 */
export function buildCookieOptions(overrides = {}) {
  return { ...baseOptions, ...overrides };
}

/**
 * CSRF cookies should mirror auth cookie attributes so that cross-site
 * requests work when the UI and API are hosted on different domains.
 */
export function getCsrfCookieOptions(overrides = {}) {
  return { ...baseOptions, ...overrides };
}

export const cookieSameSite = sameSite;
