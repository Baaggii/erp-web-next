import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import AuthContextProvider from './context/AuthContext.jsx';
import RequireAuth from './components/RequireAuth.jsx';
import ERPLayout from './components/ERPLayout.jsx';
import LoginPage from './pages/Login.jsx';

export default function App() {
  return (
    <AuthContextProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<RequireAuth />}> 
            <Route path="/*" element={<ERPLayout />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthContextProvider>
  );
}
