import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AuthContext } from '../context/AuthContext.jsx';
import { updateCache as updateGeneralConfigCache } from './useGeneralConfig.js';

const bootstrapCache = {
  ready: false,
  data: null,
  error: null,
  inflight: null,
};

function normalizeModule(moduleEntry) {
  if (!moduleEntry || typeof moduleEntry !== 'object') return null;
  const moduleKey = moduleEntry.module_key ?? moduleEntry.moduleKey;
  if (!moduleKey) return null;
  return {
    ...moduleEntry,
    module_key: moduleKey,
    parent_key: moduleEntry.parent_key ?? moduleEntry.parentKey ?? null,
  };
}

async function fetchBootstrapPayload() {
  const [modulesRes, generalConfigRes, dashboardRes, notificationsRes] = await Promise.allSettled([
    fetch('/api/modules', { credentials: 'include' }),
    fetch('/api/general_config', { credentials: 'include' }),
    fetch('/api/dashboard/preview', { credentials: 'include', skipErrorToast: true }),
    fetch('/api/notifications/preview', { credentials: 'include', skipErrorToast: true }),
  ]);

  const modules =
    modulesRes.status === 'fulfilled' && modulesRes.value.ok
      ? (await modulesRes.value.json()).map(normalizeModule).filter(Boolean)
      : [];

  const startupConfig =
    generalConfigRes.status === 'fulfilled' && generalConfigRes.value.ok
      ? await generalConfigRes.value.json()
      : {};

  if (startupConfig && typeof startupConfig === 'object') {
    updateGeneralConfigCache(startupConfig);
  }

  const dashboardPreview =
    dashboardRes.status === 'fulfilled' && dashboardRes.value.ok
      ? await dashboardRes.value.json()
      : null;

  const notificationPreview =
    notificationsRes.status === 'fulfilled' && notificationsRes.value.ok
      ? await notificationsRes.value.json()
      : null;

  return {
    modules,
    startupConfig,
    dashboardPreview,
    notificationPreview,
  };
}

export default function useAppBootstrap() {
  const { user, session, permissions, userSettings } = useContext(AuthContext);
  const [state, setState] = useState(() => ({
    loading: user !== null,
    data: bootstrapCache.data,
    error: bootstrapCache.error,
  }));

  const runBootstrap = useCallback(async () => {
    if (!user) {
      setState({ loading: false, data: null, error: null });
      return;
    }

    if (bootstrapCache.ready && bootstrapCache.data) {
      setState({ loading: false, data: bootstrapCache.data, error: null });
      return;
    }

    if (!bootstrapCache.inflight) {
      bootstrapCache.inflight = fetchBootstrapPayload()
        .then((payload) => {
          bootstrapCache.ready = true;
          bootstrapCache.error = null;
          bootstrapCache.data = payload;
          return payload;
        })
        .catch((error) => {
          bootstrapCache.error = error;
          throw error;
        })
        .finally(() => {
          bootstrapCache.inflight = null;
        });
    }

    setState((prev) => ({ ...prev, loading: true }));
    try {
      const payload = await bootstrapCache.inflight;
      setState({ loading: false, data: payload, error: null });
    } catch (error) {
      setState({ loading: false, data: null, error });
    }
  }, [user]);

  useEffect(() => {
    runBootstrap();
  }, [runBootstrap]);

  const mergedData = useMemo(() => {
    if (!state.data) return null;
    return {
      ...state.data,
      user,
      session,
      permissions,
      userSettings,
    };
  }, [permissions, session, state.data, user, userSettings]);

  return {
    ...state,
    data: mergedData,
    reload: () => {
      bootstrapCache.ready = false;
      bootstrapCache.data = null;
      bootstrapCache.error = null;
      runBootstrap();
    },
  };
}
