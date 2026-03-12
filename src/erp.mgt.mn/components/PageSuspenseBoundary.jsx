import React, { Suspense } from 'react';

function DefaultPageSkeleton() {
  return (
    <div style={{ padding: '1rem' }}>
      <div style={{ height: 16, background: '#e5e7eb', width: '40%', marginBottom: 12 }} />
      <div style={{ height: 12, background: '#f3f4f6', width: '90%', marginBottom: 8 }} />
      <div style={{ height: 12, background: '#f3f4f6', width: '70%' }} />
    </div>
  );
}

export default function PageSuspenseBoundary({ children, fallback }) {
  return <Suspense fallback={fallback || <DefaultPageSkeleton />}>{children}</Suspense>;
}
