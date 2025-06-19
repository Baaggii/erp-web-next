import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function UserMenu({ user, onLogout }) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

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
        {user.full_name ? `${user.full_name} (${user.empid})` : user.empid} ▾
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
  },
};
