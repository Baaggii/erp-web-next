import React, { useState, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext.jsx';

export default function UserMenu({ user, onLogout }) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { company } = useContext(AuthContext);

  if (!user) return null;

  function toggle() {
    setOpen((o) => !o);
  }

  function handleChangePassword() {
    setOpen(false);
    navigate('/settings/change-password');
  }

  function handleLogout() {
    setOpen(false);
    onLogout();
  }

  return (
    <div style={styles.wrapper}>
      <button style={styles.userBtn} onClick={toggle}>
        {company?.employee_name
          ? `${company.employee_name} (${user.empid})`
          : user.empid}
        {company?.company_name ? ` - ${company.company_name}` : ''}
        {company?.branch_name ? ` - ${company.branch_name}` : ''}
        {company?.department_name ? ` - ${company.department_name}` : ''} ▾
      </button>
      {open && (
        <div style={styles.menu}>
          <button style={styles.menuItem} onClick={handleChangePassword}>
            Нууц үг солих
          </button>
          <button style={styles.menuItem} onClick={handleLogout}>Гарах</button>
        </div>
      )}
    </div>
  );
}

const styles = {
  wrapper: { position: 'relative', display: 'inline-block' },
  userBtn: {
    background: 'transparent',
    border: 'none',
    color: '#fff',
    cursor: 'pointer',
    fontSize: '0.9rem',
  },
  menu: {
    position: 'absolute',
    right: 0,
    top: '100%',
    background: '#ffffff',
    border: '1px solid #d1d5db',
    borderRadius: '3px',
    boxShadow: '0 2px 6px rgba(0,0,0,0.1)',
    minWidth: '150px',
    padding: '0.25rem 0',
    zIndex: 10,
  },
  menuItem: {
    display: 'block',
    width: '100%',
    background: 'transparent',
    border: 'none',
    textAlign: 'left',
    padding: '0.5rem',
    cursor: 'pointer',
    fontSize: '0.9rem',
    color: '#1f2937',
  },
};
