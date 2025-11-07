// src/erp.mgt.mn/pages/Login.jsx
import React from 'react';
import LoginForm from '../components/LoginForm.jsx';

export default function LoginPage() {
  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #e2e8f0, #f8fafc)',
        padding: '1.5rem',
      }}
    >
      <LoginForm />
    </main>
  );
}
