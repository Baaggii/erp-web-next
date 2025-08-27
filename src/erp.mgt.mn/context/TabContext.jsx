import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useMemo,
} from 'react';
import { trackSetState } from '../utils/debug.js';

const TabContext = createContext();

export function TabProvider({ children }) {
  const [tabs, setTabs] = useState([]);
  const [activeKey, setActiveKey] = useState(null);
  const [cache, setCache] = useState({});

  useEffect(() => {
    window.__activeTabKey = activeKey || 'global';
  }, [activeKey]);

  const openTab = useCallback(({ key, label, content }) => {
    trackSetState('TabProvider.setTabs');
    setTabs((t) => {
      if (t.some((tab) => tab.key === key)) return t;
      return [...t, { key, label }];
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

  const closeTab = useCallback((key) => {
    if (key === '/') return;
    trackSetState('TabProvider.setTabs');
    setTabs((t) => t.filter((tab) => tab.key !== key));
    trackSetState('TabProvider.setCache');
    setCache((c) => {
      const n = { ...c };
      delete n[key];
      return n;
    });
    trackSetState('TabProvider.setActiveKey');
    setActiveKey((k) => {
      if (k !== key) return k;
      const remaining = tabs.filter((t) => t.key !== key);
      return remaining[0]?.key || null;
    });
  }, [tabs]);

  const setTabContent = useCallback((key, content) => {
    trackSetState('TabProvider.setCache');
    setCache((c) => {
      if (c[key] === content) return c;
      return { ...c, [key]: content };
    });
  }, []);

  const resetTabs = useCallback(() => {
    trackSetState('TabProvider.setTabs');
    setTabs([]);
    trackSetState('TabProvider.setActiveKey');
    setActiveKey(null);
    trackSetState('TabProvider.setCache');
    setCache({});
    window.__activeTabKey = 'global';
  }, []);

  useEffect(() => {
    const handleLogout = () => resetTabs();
    window.addEventListener('auth:logout', handleLogout);
    return () => window.removeEventListener('auth:logout', handleLogout);
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
