import React from 'react';

export default function ErrorMessage({ message }) {
  return (
    <div style={{ color: 'red', marginBottom: '0.5rem', minHeight: '1.2em' }}>
      {message || '\u00a0'}
    </div>
  );
}
