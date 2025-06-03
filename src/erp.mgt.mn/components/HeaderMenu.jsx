import React from 'react';

export default function HeaderMenu({ onOpen }) {
  return (
    <nav style={styles.menu}>
      <button style={styles.btn} onClick={() => onOpen('gl')}>
        General Ledger
      </button>
      <button style={styles.btn} onClick={() => onOpen('po')}>
        Purchase Orders
      </button>
      <button style={styles.btn} onClick={() => onOpen('sales')}>
        Sales Dashboard
      </button>
    </nav>
  );
}

const styles = {
  menu: { marginLeft: '2rem', flexGrow: 1 },
  btn: {
    background: 'transparent',
    border: 'none',
    color: '#fff',
    cursor: 'pointer',
    fontSize: '0.9rem',
    marginRight: '0.75rem'
  }
};
