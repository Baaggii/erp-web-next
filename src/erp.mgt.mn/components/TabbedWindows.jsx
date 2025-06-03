// Previously this component displayed multiple ERP modules in tabs.
// The modules have been removed from the dashboard so it now simply shows a
// placeholder message.
import React from 'react';
export default function TabbedWindows() {
  return (
    <div style={styles.placeholder}>No modules available.</div>
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
