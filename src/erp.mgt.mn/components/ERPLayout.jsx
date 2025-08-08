// src/erp.mgt.mn/components/ERPLayout.jsx
import React, { useContext, useState, useEffect, useRef } from "react";
import HeaderMenu from "./HeaderMenu.jsx";
import UserMenu from "./UserMenu.jsx";
import { useOutlet, useNavigate, useLocation } from "react-router-dom";
import { AuthContext } from "../context/AuthContext.jsx";
import { logout } from "../hooks/useAuth.jsx";
import { useRolePermissions, refreshRolePermissions } from "../hooks/useRolePermissions.js";
import { useCompanyModules } from "../hooks/useCompanyModules.js";
import { useModules } from "../hooks/useModules.js";
import { useTxnModules } from "../hooks/useTxnModules.js";
import modulePath from "../utils/modulePath.js";
import AskAIFloat from "./AskAIFloat.jsx";
import useGeneralConfig from "../hooks/useGeneralConfig.js";
import { useTabs } from "../context/TabContext.jsx";
import { useIsLoading } from "../context/LoadingContext.jsx";
import Spinner from "./Spinner.jsx";
import useHeaderMappings from "../hooks/useHeaderMappings.js";

/**
 * A desktop‐style “ERPLayout” with:
 *  - Top header bar (logo, nav icons, user dropdown)
 *  - Left sidebar (menu groups + items)
 *  - Main content area (faux window container)
 */
export default function ERPLayout() {
  const { user, setUser, company } = useContext(AuthContext);
  const generalConfig = useGeneralConfig();
  const renderCount = useRef(0);
  useEffect(() => {
  renderCount.current++;
  if (renderCount.current > 10) {
    console.warn('ERPLayout re-rendering too many times', renderCount.current);
  }
}, []);
  useEffect(() => {
    if (window.erpDebug) console.warn('Mounted: ERPLayout');
  }, []);
  const navigate = useNavigate();
  const location = useLocation();

  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  const modules = useModules();
  const headerMap = useHeaderMappings(modules.map((m) => m.module_key));
  const titleMap = {
    "/": "Blue Link демо",
    "/forms": "Маягтууд",
    "/reports": "Тайлан",
    "/settings": "Тохиргоо",
    "/settings/users": "Хэрэглэгчид",
    "/settings/user-companies": "Хэрэглэгчийн компаниуд",
    "/settings/role-permissions": "Эрхийн тохиргоо",
    "/settings/modules": "Модуль",
    "/settings/company-licenses": "Лиценз",
    "/settings/tables-management": "Хүснэгтийн удирдлага",
    "/settings/forms-management": "Маягтын удирдлага",
    "/settings/report-management": "Тайлангийн удирдлага",
    "/settings/change-password": "Нууц үг солих",
  };

  function titleForPath(path) {
    if (titleMap[path]) return titleMap[path];
    const seg = path.replace(/^\/+/, '').split('/')[0];
    const mod = modules.find(
      (m) => m.module_key.replace(/_/g, '-') === seg,
    );
    if (!mod) return 'ERP';
    return (
      generalConfig.general?.procLabels?.[mod.module_key] ||
      headerMap[mod.module_key] ||
      mod.label
    );
  }

  const windowTitle = titleForPath(location.pathname);

  const { tabs, activeKey, openTab, closeTab, switchTab, setTabContent, cache } = useTabs();
  const txnModuleKeys = useTxnModules();

  useEffect(() => {
    const title = titleForPath(location.pathname);
    openTab({ key: location.pathname, label: title });
  }, [location.pathname, openTab]);

  function handleOpen(path, label, key) {
    if (txnModuleKeys && txnModuleKeys.has(key)) {
      openTab({ key: path, label });
      navigate(path);
    } else {
      openTab({ key: path, label });
      navigate(path);
    }
  }

  async function handleLogout() {
    await logout();
    setUser(null);
    navigate("/login");
  }

  function handleHome() {
    const roleId = user?.role_id || (user?.role === 'admin' ? 1 : 2);
    const companyId = user?.company_id || company?.company_id;
    refreshRolePermissions(roleId, companyId);
    navigate('/');
  }

  return (
    <div style={styles.container}>
      <Header
        user={user}
        onLogout={handleLogout}
        onHome={handleHome}
        isMobile={isMobile}
        onToggleSidebar={() => setSidebarOpen((o) => !o)}
      />
      <div style={styles.body(isMobile)}>
        {isMobile && sidebarOpen && (
          <div
            className="sidebar-overlay"
            onClick={() => setSidebarOpen(false)}
          />
        )}
        <Sidebar
          open={isMobile ? sidebarOpen : true}
          onOpen={handleOpen}
          isMobile={isMobile}
        />
        <MainWindow title={windowTitle} />
      </div>
      {generalConfig.general?.aiApiEnabled && <AskAIFloat />}
    </div>
  );
}

/** Top header bar **/
function Header({ user, onLogout, onHome, isMobile, onToggleSidebar }) {
  const { company } = useContext(AuthContext);
  function handleOpen(id) {
    console.log("open module", id);
  }

  return (
    <header className="sticky-header" style={styles.header(isMobile)}>
      {isMobile && (
        <button
          onClick={onToggleSidebar}
          style={{ ...styles.iconBtn, marginRight: '0.5rem' }}
          className="sm:hidden"
        >
          ☰
        </button>
      )}
      <div style={styles.logoSection}>
        <img
          src="/assets/logo‐small.png"
          alt="ERP Logo"
          style={styles.logoImage}
        />
        <span style={styles.logoText}>MyERP</span>
        {company && (
          <span style={styles.companyText}> ({company.company_name})</span>
        )}
      </div>
      <nav style={styles.headerNav}>
        <button style={styles.iconBtn} onClick={onHome}>🗔 Нүүр</button>
        <button style={styles.iconBtn}>🗗 Цонхнууд</button>
        <button style={styles.iconBtn}>❔ Тусламж</button>
      </nav>
      <HeaderMenu onOpen={handleOpen} />
      {company && (
        <span style={styles.locationInfo}>
          {company.branch_name && `📍 ${company.branch_name} | `}
          🏢 {company.company_name}
        </span>
      )}
      <div style={styles.userSection}>
        <UserMenu user={user} onLogout={onLogout} />
      </div>
    </header>
  );
}

/** Left sidebar with “menu groups” and “pinned items” **/
function Sidebar({ onOpen, open, isMobile }) {
  const { company } = useContext(AuthContext);
  const location = useLocation();
  const perms = useRolePermissions();
  const licensed = useCompanyModules(company?.company_id);
  const modules = useModules();
  const txnModuleKeys = useTxnModules();
  const generalConfig = useGeneralConfig();
  const headerMap = useHeaderMappings(modules.map((m) => m.module_key));

  if (!perms || !licensed) return null;

  const allMap = {};
  modules.forEach((m) => {
    const label =
      generalConfig.general?.procLabels?.[m.module_key] ||
      headerMap[m.module_key] ||
      m.label;
    allMap[m.module_key] = { ...m, label };
  });

  function isFormsDescendant(mod) {
    let cur = mod;
    while (cur) {
      if (cur.module_key === 'forms') return mod.module_key !== 'forms';
      cur = cur.parent_key ? allMap[cur.parent_key] : null;
    }
    return false;
  }

  const map = {};
  modules.forEach((m) => {
    if (
      !perms[m.module_key] ||
      !licensed[m.module_key] ||
      !m.show_in_sidebar
    )
      return;
    if (isFormsDescendant(m) && txnModuleKeys && !txnModuleKeys.has(m.module_key))
      return;
    const label =
      generalConfig.general?.procLabels?.[m.module_key] ||
      headerMap[m.module_key] ||
      m.label;
    map[m.module_key] = { ...m, label, children: [] };
  });

  // Ensure parents exist for permitted modules so children don't become
  // "orphans" when the parent itself is not accessible. This allows modules
  // like the Developer group to appear if any child is shown.
  Object.values(map).forEach((m) => {
    let pKey = m.parent_key;
    while (pKey && !map[pKey] && allMap[pKey]) {
      const parent = allMap[pKey];
      map[pKey] = { ...parent, children: [] };
      pKey = parent.parent_key;
    }
  });

  const roots = [];
  const orphans = [];
  Object.values(map).forEach((m) => {
    if (m.parent_key && map[m.parent_key]) {
      map[m.parent_key].children.push(m);
    } else if (m.parent_key) {
      orphans.push(m);
    } else {
      roots.push(m);
    }
  });

  if (orphans.length > 0) {
    roots.push({
      module_key: '__orphan__',
      label: 'Other',
      children: orphans,
    });
  }

  return (
    <aside
      id="sidebar"
      className={`sidebar ${open ? 'open' : ''}`}
      style={styles.sidebar(isMobile, open)}
    >
      <nav className="menu-container">
        {roots.map((m) =>
          m.children.length > 0 ? (
            <SidebarGroup key={m.module_key} mod={m} map={map} allMap={allMap} level={0} onOpen={onOpen} />
          ) : (
            <button
              key={m.module_key}
              onClick={() => onOpen(modulePath(m, allMap), m.label, m.module_key)}
              className="menu-item"
              style={styles.menuItem({ isActive: location.pathname === modulePath(m, allMap) })}
            >
              {m.label}
            </button>
          ),
        )}
      </nav>
    </aside>
  );
}

function SidebarGroup({ mod, map, allMap, level, onOpen }) {
  const [open, setOpen] = useState(false);
  const groupClass = level === 0 ? 'menu-group' : level === 1 ? 'menu-group submenu' : 'menu-group subsubmenu';
  return (
    <div className={groupClass} style={{ ...styles.menuGroup, paddingLeft: level ? '1rem' : 0 }}>
      <button className="menu-item" style={styles.groupBtn} onClick={() => setOpen((o) => !o)}>
        {mod.label} {open ? '▾' : '▸'}
      </button>
      {open &&
        mod.children.map((c) =>
          c.children.length > 0 ? (
            <SidebarGroup key={c.module_key} mod={c} map={map} allMap={allMap} level={level + 1} onOpen={onOpen} />
          ) : (
            <button
              key={c.module_key}
              onClick={() => onOpen(modulePath(c, allMap), c.label, c.module_key)}
              style={{
                ...styles.menuItem({ isActive: location.pathname === modulePath(c, allMap) }),
                paddingLeft: `${(level + 1) * 1}rem`,
              }}
              className="menu-item"
            >
              {c.label}
            </button>
          ),
        )}
    </div>
  );
}



/** A faux “window” wrapper around the main content **/
function MainWindow({ title }) {
  const location = useLocation();
  const outlet = useOutlet();
  const navigate = useNavigate();
  const { tabs, activeKey, switchTab, closeTab, setTabContent, cache } = useTabs();

  // Store rendered outlet by path once the route changes. Avoid tracking
  // the `outlet` object itself to prevent endless updates caused by React
  // creating a new element on every render.
  useEffect(() => {
    setTabContent(location.pathname, outlet);
  }, [location.pathname, setTabContent]);

  function handleSwitch(key) {
    switchTab(key);
    if (key.startsWith('/')) navigate(key);
  }

  const elements = { ...cache, [location.pathname]: outlet };

  return (
    <div style={styles.windowContainer}>
      <div style={styles.windowHeader}>
        <span>{title}</span>
        <div>
          <button style={styles.windowHeaderBtn}>–</button>
          <button style={styles.windowHeaderBtn}>□</button>
          <button style={styles.windowHeaderBtn}>×</button>
        </div>
      </div>
      <div style={styles.tabBar}>
        {tabs.map((t) => (
          <div
            key={t.key}
            style={activeKey === t.key ? styles.activeTab : styles.tab}
            onClick={() => handleSwitch(t.key)}
          >
            <span>{t.label}</span>
            {tabs.length > 1 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(t.key);
                }}
                style={styles.closeBtn}
              >
                ×
              </button>
            )}
          </div>
        ))}
      </div>
      <div style={styles.windowContent}>
        {tabs.map((t) => (
          <TabPanel key={t.key} tabKey={t.key} active={t.key === activeKey}>
            {t.key === location.pathname ? elements[t.key] : cache[t.key]}
          </TabPanel>
        ))}
      </div>
    </div>
  );
}

function TabPanel({ tabKey, active, children }) {
  const loading = useIsLoading(tabKey);
  return (
    <div style={{ position: 'relative', display: active ? 'block' : 'none' }}>
      {loading && <Spinner />}
      {children}
    </div>
  );
}

/** Inline styles (you can move these into a `.css` or Tailwind classes if you prefer) **/
const styles = {
  container: {
    display: "flex",
    flexDirection: "column",
    height: "100vh",
    fontFamily: "Arial, sans-serif",
    overflowX: "hidden",
  },
  header: (mobile) => ({
    display: "flex",
    alignItems: "center",
    backgroundColor: "#1f2937",
    color: "#fff",
    padding: "0 1rem",
    height: "48px",
    flexShrink: 0,
    position: "sticky",
    top: 0,
    zIndex: 20,
    marginLeft: mobile ? 0 : "240px",
  }),
  logoSection: {
    display: "flex",
    alignItems: "center",
    flex: "0 0 auto",
  },
  logoImage: {
    width: "24px",
    height: "24px",
    marginRight: "0.5rem",
  },
  logoText: {
    fontSize: "1.1rem",
    fontWeight: "bold",
  },
  companyText: {
    marginLeft: "0.5rem",
    fontSize: "0.9rem",
    opacity: 0.8,
  },
  headerNav: {
    marginLeft: "2rem",
    display: "flex",
    gap: "0.75rem",
    overflowX: "auto",
    whiteSpace: "nowrap",
    flexGrow: 1,
  },
  iconBtn: {
    background: "transparent",
    border: "none",
    color: "#fff",
    cursor: "pointer",
    fontSize: "0.9rem",
    padding: "0.25rem 0.5rem",
  },
  userSection: {
    display: "flex",
    alignItems: "center",
    flex: "0 0 auto",
    gap: "0.5rem",
  },
  locationInfo: {
    color: "#e5e7eb",
    fontSize: "0.85rem",
    marginRight: "0.75rem",
  },
  logoutBtn: {
    backgroundColor: "#dc2626",
    color: "#fff",
    border: "none",
    borderRadius: "3px",
    padding: "0.25rem 0.75rem",
    cursor: "pointer",
    fontSize: "0.9rem",
  },
  body: (mobile) => ({
    display: "flex",
    flexGrow: 1,
    backgroundColor: "#f3f4f6",
    overflow: "auto",
    marginLeft: mobile ? 0 : "240px",
  }),
  sidebar: (mobile, open) => ({
    width: "240px",
    backgroundColor: "#374151",
    color: "#e5e7eb",
    display: "flex",
    flexDirection: "column",
    padding: "1rem 0.5rem",
    flexShrink: 0,
    overflowY: "auto",
    position: "fixed",
    top: "48px",
    left: 0,
    height: "calc(100vh - 48px)",
    zIndex: 30,
    ...(mobile
      ? {
          transform: open ? "translateX(0)" : "translateX(-100%)",
          transition: "transform 0.3s",
        }
      : {}),
  }),
  menuGroup: {
    marginBottom: "1rem",
  },
  groupTitle: {
    fontSize: "0.85rem",
    fontWeight: "bold",
    margin: "0.5rem 0 0.25rem 0",
  },
  groupBtn: {
    display: "block",
    width: "100%",
    background: "transparent",
    border: "none",
    color: "#e5e7eb",
    textAlign: "left",
    padding: "0.4rem 0.75rem",
    cursor: "pointer",
    fontSize: "0.9rem",
  },
  menuItem: ({ isActive, disabled }) => ({
    display: "block",
    padding: "0.4rem 0.75rem",
    color: disabled ? "#6b7280" : isActive ? "#ffffff" : "#d1d5db",
    backgroundColor: isActive ? "#4b5563" : "transparent",
    textDecoration: "none",
    borderRadius: "3px",
    marginBottom: "0.25rem",
    fontSize: "0.9rem",
    pointerEvents: disabled ? "none" : "auto",
    opacity: disabled ? 0.6 : 1,
  }),
  divider: {
    border: "none",
    borderTop: "1px solid #4b5563",
    margin: "0.5rem 0",
  },
  windowContainer: {
    flexGrow: 1,
    margin: "1rem",
    border: "1px solid #9ca3af",
    borderRadius: "4px",
    display: "flex",
    flexDirection: "column",
    backgroundColor: "#ffffff",
    boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
  },
  windowHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#6b7280",
    color: "#f9fafb",
    padding: "0.5rem 1rem",
    borderTopLeftRadius: "4px",
    borderTopRightRadius: "4px",
    fontSize: "0.95rem",
  },
  windowHeaderBtn: {
    marginLeft: "0.5rem",
    background: "transparent",
    border: "none",
    color: "#f9fafb",
    cursor: "pointer",
    fontSize: "0.9rem",
  },
  tabBar: {
    display: "flex",
    borderBottom: "1px solid #9ca3af",
    backgroundColor: "#e5e7eb",
  },
  tab: {
    padding: "0.25rem 0.5rem",
    marginRight: "2px",
    cursor: "pointer",
    backgroundColor: "#d1d5db",
    display: "flex",
    alignItems: "center",
    borderTopLeftRadius: "4px",
    borderTopRightRadius: "4px",
  },
  activeTab: {
    padding: "0.25rem 0.5rem",
    marginRight: "2px",
    cursor: "pointer",
    backgroundColor: "#ffffff",
    border: "1px solid #9ca3af",
    borderBottom: "none",
    display: "flex",
    alignItems: "center",
    borderTopLeftRadius: "4px",
    borderTopRightRadius: "4px",
  },
  closeBtn: {
    marginLeft: "0.25rem",
    background: "transparent",
    border: "none",
    cursor: "pointer",
  },
  windowContent: {
    flexGrow: 1,
    padding: "1rem",
    overflow: "auto",
  },
};
