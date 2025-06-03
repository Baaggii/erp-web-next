// Mosaic layout originally arranged multiple ERP modules side by side.
// Since those modules have been removed, the component now renders a simple
// placeholder.
import React from 'react';

export default function MosaicLayout() {
  return (
    <div style={styles.placeholder}>No modules to display.</div>
  );
}

const styles = {
  placeholder: {
    border: '1px solid #ccc',
    padding: '1rem',
    background: '#fff',
    color: '#555',
  },
};
