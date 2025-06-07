// src/erp.mgt.mn/components/ERPLayout.jsx
import React, { useContext, useState } from "react";
import HeaderMenu from "./HeaderMenu.jsx";
import UserMenu from "./UserMenu.jsx";
import { Outlet, NavLink, useNavigate, useLocation } from "react-router-dom";
import { AuthContext } from "../context/AuthContext.jsx";
import { logout } from "../hooks/useAuth.jsx";
import { useRolePermissions, refreshRolePermissions } from "../hooks/useRolePermissions.js";
import { useCompanyModules } from "../hooks/useCompanyModules.js";

/**
 * A desktop‐style “ERPLayout” with:
 *  - Top header bar (logo, nav icons, user dropdown)
 *  - Left sidebar (menu groups + items)
 *  - Main content area (faux window container)
 */
export default function ERPLayout() {
  const { user, setUser, company } = useContext(AuthContext);
  const navigate = useNavigate();
  const location = useLocation();

  const titleMap = {
    "/": "Blue Link демо",
    "/forms": "Маягтууд",
    "/reports": "Тайлан",
    "/settings": "Тохиргоо",
    "/settings/users": "Хэрэглэгчид",
    "/settings/user-companies": "Хэрэглэгчийн компаниуд",
    "/settings/role-permissions": "Эрхийн тохиргоо",
    "/settings/company-licenses": "Лиценз",
    "/settings/tables-management": "Хүснэгтийн удирдлага",
    "/settings/forms-management": "Маягтын удирдлага",
    "/settings/report-management": "Тайлангийн удирдлага",
    "/settings/change-password": "Нууц үг солих",
  };
  const windowTitle = titleMap[location.pathname] || "ERP";

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
      <Header user={user} onLogout={handleLogout} onHome={handleHome} />
      <div style={styles.body}>
        <Sidebar />
        <MainWindow title={windowTitle}>
          <Outlet />
        </MainWindow>
      </div>
    </div>
  );
}

/** Top header bar **/
function Header({ user, onLogout, onHome }) {
  const { company } = useContext(AuthContext);
  function handleOpen(id) {
    console.log("open module", id);
  }

  return (
    <header style={styles.header}>
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
      <div style={styles.userSection}>
        <UserMenu user={user} onLogout={onLogout} />
      </div>
    </header>
  );
}

/** Left sidebar with “menu groups” and “pinned items” **/
function Sidebar() {
  const { user, company } = useContext(AuthContext);
  const perms = useRolePermissions();
  const licensed = useCompanyModules(company?.company_id);
  const [openSettings, setOpenSettings] = useState(false);
  const [openUserSettings, setOpenUserSettings] = useState(false);

  if (!perms || !licensed) {
    return null;
  }

  return (
    <aside style={styles.sidebar}>
      <nav>
        <div style={styles.menuGroup}>
          <div style={styles.groupTitle}>📌 Түгээмэл</div>
          {perms.dashboard && licensed.dashboard && (
            <NavLink
              to="/"
              style={({ isActive }) => styles.menuItem({ isActive })}
            >
              Blue Link демо
            </NavLink>
          )}
          {perms.forms && licensed.forms && (
            <NavLink
              to="/forms"
              style={({ isActive }) => styles.menuItem({ isActive })}
            >
              Маягтууд
            </NavLink>
          )}
          {perms.reports && licensed.reports && (
            <NavLink
              to="/reports"
              style={({ isActive }) => styles.menuItem({ isActive })}
            >
              Тайлан
            </NavLink>
          )}
        </div>

        <hr style={styles.divider} />

        <div style={styles.menuGroup}>
          <button
            style={styles.groupBtn}
            onClick={() => setOpenSettings((o) => !o)}
          >
            ⚙ Тохиргоо {openSettings ? "▾" : "▸"}
          </button>
          {openSettings && (
            <>
              {perms.settings && licensed.settings && (
                <NavLink to="/settings" style={styles.menuItem} end>
                  Ерөнхий
                </NavLink>
              )}
              {licensed.company_licenses && (
                <NavLink
                  to="/settings/company-licenses"
                  style={styles.menuItem}
                >
                  Лиценз
                </NavLink>
              )}
              <button
                style={styles.groupBtn}
                onClick={() => setOpenUserSettings((o) => !o)}
              >
                👤 Хэрэглэгчийн тохиргоо {openUserSettings ? "▾" : "▸"}
              </button>
              {openUserSettings && (
                <>
                  {user?.role === "admin" && (
                    <>
                      {licensed.users && (
                        <NavLink to="/settings/users" style={styles.menuItem}>
                          Хэрэглэгчид
                        </NavLink>
                      )}
                      {licensed.user_companies && (
                        <NavLink
                          to="/settings/user-companies"
                          style={styles.menuItem}
                        >
                          Хэрэглэгчийн компаниуд
                        </NavLink>
                      )}
                      {licensed.role_permissions && (
                        <NavLink
                          to="/settings/role-permissions"
                          style={styles.menuItem}
                        >
                          Эрхийн тохиргоо
                        </NavLink>
                      )}
                    </>
                  )}
                  {licensed.change_password && (
                    <NavLink
                      to="/settings/change-password"
                      style={styles.menuItem}
                    >
                      Нууц үг солих
                    </NavLink>
                  )}
                </>
              )}
              {user?.role === "admin" && (
                <>
                  {licensed.tables_management && (
                    <NavLink
                      to="/settings/tables-management"
                      style={styles.menuItem}
                    >
                      Хүснэгтийн удирдлага
                    </NavLink>
                  )}
                  {licensed.forms_management && (
                    <NavLink
                      to="/settings/forms-management"
                      style={styles.menuItem}
                    >
                      Маягтын удирдлага
                    </NavLink>
                  )}
                  {licensed.report_management && (
                    <NavLink
                      to="/settings/report-management"
                      style={styles.menuItem}
                    >
                      Тайлангийн удирдлага
                    </NavLink>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </nav>
    </aside>
  );
}

/** A faux “window” wrapper around the main content **/
function MainWindow({ children, title }) {
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
      <div style={styles.windowContent}>{children}</div>
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
  },
  header: {
    display: "flex",
    alignItems: "center",
    backgroundColor: "#1f2937",
    color: "#fff",
    padding: "0 1rem",
    height: "48px",
    flexShrink: 0,
  },
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
  body: {
    display: "flex",
    flexGrow: 1,
    backgroundColor: "#f3f4f6",
  },
  sidebar: {
    width: "220px",
    backgroundColor: "#374151",
    color: "#e5e7eb",
    display: "flex",
    flexDirection: "column",
    padding: "1rem 0.5rem",
    flexShrink: 0,
  },
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
  windowContent: {
    flexGrow: 1,
    padding: "1rem",
    overflow: "auto",
  },
};
