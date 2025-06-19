import React, { createContext, useContext, useState, useCallback } from 'react';

const TabContext = createContext();

export function TabProvider({ children }) {
  const [tabs, setTabs] = useState([]);
  const [activeKey, setActiveKey] = useState(null);
  const [cache, setCache] = useState({});

  const openTab = useCallback(({ key, label, content }) => {
    setTabs((t) => {
      if (t.some((tab) => tab.key === key)) return t;
      return [...t, { key, label }];
    });
    if (content) setCache((c) => ({ ...c, [key]: content }));
    setActiveKey(key);
  }, []);

  const switchTab = useCallback((key) => {
    setActiveKey(key);
  }, []);

  const closeTab = useCallback((key) => {
    setTabs((t) => t.filter((tab) => tab.key !== key));
    setCache((c) => {
      const n = { ...c };
      delete n[key];
      return n;
    });
    setActiveKey((k) => {
      if (k !== key) return k;
      const remaining = tabs.filter((t) => t.key !== key);
      return remaining[0]?.key || null;
    });
  }, [tabs]);

  const setTabContent = useCallback((key, content) => {
    setCache((c) => ({ ...c, [key]: content }));
  }, []);

  return (
    <TabContext.Provider value={{ tabs, activeKey, openTab, closeTab, switchTab, setTabContent, cache }}>
      {children}
    </TabContext.Provider>
  );
}

export function useTabs() {
  return useContext(TabContext);
}

export default TabContext;
