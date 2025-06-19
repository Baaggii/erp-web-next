// src/erp.mgt.mn/pages/Login.jsx
import React from 'react';
import LoginForm from '../components/LoginForm.jsx';

export default function LoginPage() {
  return (
    <div
      style={{
        padding: '2rem',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
      }}
    >
      <h1 style={{ marginBottom: '1rem' }}>Нэвтрэх</h1>
      <LoginForm />
    </div>
  );
}
