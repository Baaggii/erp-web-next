import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useMemo,
} from 'react';
import { trackSetState } from '../utils/debug.js';
import { dispatchReset } from '../utils/loadingEvents.js';

const TabContext = createContext();
const TAB_STORAGE_KEY = 'erp.tabs.v1';

const readStoredTabs = () => {
  if (typeof window === 'undefined') {
    return { tabs: [], activeKey: null };
  }
  try {
    const raw = window.sessionStorage?.getItem(TAB_STORAGE_KEY);
    if (!raw) return { tabs: [], activeKey: null };
    const parsed = JSON.parse(raw);
    const storedTabs = Array.isArray(parsed?.tabs) ? parsed.tabs : [];
    const tabs = storedTabs
      .map((tab) => ({
        key: typeof tab?.key === 'string' ? tab.key : '',
        label: typeof tab?.label === 'string' ? tab.label : '',
      }))
      .filter((tab) => tab.key);
    const activeKey =
      typeof parsed?.activeKey === 'string' && parsed.activeKey ? parsed.activeKey : null;
    return { tabs, activeKey };
  } catch (err) {
    return { tabs: [], activeKey: null };
  }
};

const persistTabs = (tabs, activeKey) => {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage?.setItem(
      TAB_STORAGE_KEY,
      JSON.stringify({ tabs, activeKey }),
    );
  } catch (err) {
    // ignore storage failures
  }
};

const clearStoredTabs = () => {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage?.removeItem(TAB_STORAGE_KEY);
  } catch (err) {
    // ignore storage failures
  }
};

export function TabProvider({ children }) {
  const storedState = useMemo(() => readStoredTabs(), []);
  const [tabs, setTabs] = useState(storedState.tabs);
  const [activeKey, setActiveKey] = useState(storedState.activeKey);
  const [cache, setCache] = useState({});

  useEffect(() => {
    window.__activeTabKey = activeKey || 'global';
  }, [activeKey]);

  useEffect(() => {
    persistTabs(tabs, activeKey);
  }, [activeKey, tabs]);

  const openTab = useCallback(({ key, label, content }) => {
    trackSetState('TabProvider.setTabs');
    setTabs((t) => {
      const existing = t.find((tab) => tab.key === key);
      if (!existing) return [...t, { key, label }];
      if (label && existing.label !== label) {
        return t.map((tab) => (tab.key === key ? { ...tab, label } : tab));
      }
      return t;
    });
    if (content) {
      setCache((c) => {
        if (c[key] === content) return c;
        return { ...c, [key]: content };
      });
    }
    trackSetState('TabProvider.setActiveKey');
    setActiveKey((k) => (k === key ? k : key));
    window.__activeTabKey = key;
  }, []);

  const switchTab = useCallback((key) => {
    trackSetState('TabProvider.setActiveKey');
    setActiveKey(key);
    window.__activeTabKey = key;
  }, []);

  const closeTab = useCallback(
    (key, onNavigate) => {
      if (key === '/') return;

      const activeAtClose = window.__activeTabKey || activeKey || 'global';
      dispatchReset(key);
      if (activeAtClose && activeAtClose !== key) {
        dispatchReset(activeAtClose);
      }

      trackSetState('TabProvider.setTabs');
      const remaining = tabs.filter((tab) => tab.key !== key);
      setTabs(remaining);

      trackSetState('TabProvider.setCache');
      setCache((c) => {
        const n = { ...c };
        delete n[key];
        return n;
      });

      let nextActiveKey = activeKey;
      let shouldNavigate = false;
      if (activeKey === key) {
        nextActiveKey = remaining[0]?.key || null;
        shouldNavigate = true;
      }

      trackSetState('TabProvider.setActiveKey');
      setActiveKey(nextActiveKey);
      window.__activeTabKey = nextActiveKey || 'global';

      if (
        shouldNavigate &&
        typeof onNavigate === 'function' &&
        nextActiveKey &&
        typeof nextActiveKey === 'string' &&
        nextActiveKey.startsWith('/')
      ) {
        onNavigate(nextActiveKey);
      }
    },
    [activeKey, tabs],
  );

  const setTabContent = useCallback((key, content) => {
    trackSetState('TabProvider.setCache');
    setCache((c) => {
      if (c[key] === content) return c;
      return { ...c, [key]: content };
    });
  }, []);

  const resetTabs = useCallback(() => {
    const keysToReset = new Set([
      'global',
      activeKey,
      window.__activeTabKey,
      ...tabs.map((tab) => tab.key),
    ]);
    keysToReset.forEach((loaderKey) => {
      if (!loaderKey) return;
      dispatchReset(loaderKey);
    });

    trackSetState('TabProvider.setTabs');
    setTabs([]);
    trackSetState('TabProvider.setActiveKey');
    setActiveKey(null);
    trackSetState('TabProvider.setCache');
    setCache({});
    window.__activeTabKey = 'global';
    clearStoredTabs();
  }, [activeKey, tabs]);

  useEffect(() => {
    const handleLogout = () => resetTabs();
    window.addEventListener('auth:logout', handleLogout);
    const handleUserChange = () => resetTabs();
    window.addEventListener('auth:user-changed', handleUserChange);
    return () => {
      window.removeEventListener('auth:logout', handleLogout);
      window.removeEventListener('auth:user-changed', handleUserChange);
    };
  }, [resetTabs]);

  const value = useMemo(
    () => ({
      tabs,
      activeKey,
      openTab,
      closeTab,
      switchTab,
      setTabContent,
      cache,
      resetTabs,
    }),
    [tabs, activeKey, openTab, closeTab, switchTab, setTabContent, cache, resetTabs]
  );

  return (
    <TabContext.Provider value={value}>
      {children}
    </TabContext.Provider>
  );
}

export function useTabs() {
  return useContext(TabContext);
}

export default TabContext;
