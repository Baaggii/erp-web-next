import React from 'react';

export default function Spinner() {
  return (
    <div className="loading-overlay" role="status" aria-live="polite" aria-busy="true">
      <div className="loading-spinner" />
      <span className="loading-message">Loading…</span>
    </div>
  );
}
