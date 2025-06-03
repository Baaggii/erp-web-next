import React from 'react';

export default function HeaderMenu({ onOpen }) {
  // All modules have been removed from the dashboard, so the menu is empty for now.
  return <nav style={styles.menu}></nav>;
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
