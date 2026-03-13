let cachedSessionData = null;
let sessionPromise = null;

function safeJson(response, fallback) {
  if (!response?.ok) return Promise.resolve(fallback);
  return response.json().catch(() => fallback);
}

function getCachedUserSettings() {
  try {
    const stored = localStorage.getItem('erp_user_settings');
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
}

export async function initSession(options = {}) {
  const { force = false } = options;

  if (!force && cachedSessionData?.loaded) {
    return cachedSessionData;
  }

  if (!force && sessionPromise) {
    return sessionPromise;
  }

  sessionPromise = Promise.all([
    fetch('/api/auth/me', { credentials: 'include' }),
    fetch('/api/company_modules', { credentials: 'include' }),
    fetch('/api/modules', { credentials: 'include' }),
    fetch('/api/user/settings', { credentials: 'include', skipErrorToast: true }),
  ])
    .then(async ([userResponse, companyModulesResponse, modulesResponse, userSettingsResponse]) => {
      const user = await safeJson(userResponse, null);
      const companyModules = await safeJson(companyModulesResponse, []);
      const modules = await safeJson(modulesResponse, []);
      const userSettings = await safeJson(userSettingsResponse, getCachedUserSettings());

      const sessionData = {
        user,
        companyModules: Array.isArray(companyModules) ? companyModules : [],
        modules: Array.isArray(modules) ? modules : [],
        userSettings: userSettings && typeof userSettings === 'object' ? userSettings : {},
        loaded: true,
      };

      try {
        localStorage.setItem('erp_user_settings', JSON.stringify(sessionData.userSettings));
      } catch {
        // ignore localStorage failures
      }

      cachedSessionData = sessionData;
      return sessionData;
    })
    .catch(() => {
      const fallback = {
        user: null,
        companyModules: [],
        modules: [],
        userSettings: getCachedUserSettings(),
        loaded: true,
      };
      cachedSessionData = fallback;
      return fallback;
    })
    .finally(() => {
      sessionPromise = null;
    });

  return sessionPromise;
}

export function resetSessionInitCache() {
  cachedSessionData = null;
  sessionPromise = null;
}
