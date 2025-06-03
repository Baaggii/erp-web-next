import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';

export default function HeaderMenu() {
  const [open, setOpen] = useState(false);

  return (
    <div style={styles.wrapper}>
      <button style={styles.menuBtn} onClick={() => setOpen(o => !o)}>
        ☰ Menu
      </button>
      {open && (
        <div style={styles.dropdown} onMouseLeave={() => setOpen(false)}>
          <NavLink to="/" style={styles.item} onClick={() => setOpen(false)}>
            Home
          </NavLink>
          <button style={styles.item} onClick={() => setOpen(false)}>
            Windows
          </button>
          <button style={styles.item} onClick={() => setOpen(false)}>
            Help
          </button>
        </div>
      )}
    </div>
  );
}

const styles = {
  wrapper: { position: 'relative', marginLeft: '2rem', flexGrow: 1 },
  menuBtn: {
    background: 'transparent',
    border: 'none',
    color: '#fff',
    cursor: 'pointer',
    fontSize: '0.9rem',
  },
  dropdown: {
    position: 'absolute',
    top: '100%',
    left: 0,
    background: '#1f2937',
    border: '1px solid #4b5563',
    padding: '0.5rem',
    zIndex: 1,
    minWidth: '120px',
  },
  item: {
    display: 'block',
    background: 'transparent',
    border: 'none',
    color: '#fff',
    cursor: 'pointer',
    fontSize: '0.9rem',
    textDecoration: 'none',
    padding: '0.25rem 0',
    textAlign: 'left',
    width: '100%',
  },
};
