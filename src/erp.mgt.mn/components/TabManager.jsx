import React, { useMemo, useState } from 'react';

export default function TabManager({ initialTab = null, keepAlive = true, renderTab }) {
  const [openTabs, setOpenTabs] = useState(() => (initialTab ? [initialTab] : []));
  const [activeTabId, setActiveTabId] = useState(initialTab?.id || null);

  const tabMap = useMemo(() => new Map(openTabs.map((tab) => [tab.id, tab])), [openTabs]);

  const openTab = (tab) => {
    setOpenTabs((prev) => (prev.some((entry) => entry.id === tab.id) ? prev : [...prev, tab]));
    setActiveTabId(tab.id);
  };

  const closeTab = (tabId) => {
    setOpenTabs((prev) => prev.filter((tab) => tab.id !== tabId));
    setActiveTabId((prev) => (prev === tabId ? openTabs[0]?.id || null : prev));
  };

  return {
    openTabs,
    activeTabId,
    tabMap,
    keepAlive,
    setActiveTabId,
    openTab,
    closeTab,
    render: () => {
      if (!activeTabId) return null;
      if (!keepAlive) return renderTab(tabMap.get(activeTabId));
      return openTabs.map((tab) => (
        <div key={tab.id} style={{ display: tab.id === activeTabId ? 'block' : 'none' }}>
          {renderTab(tab)}
        </div>
      ));
    },
  };
}
