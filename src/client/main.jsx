import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import './index.css';
import Login from './pages/Login';
import FormRenderer from './pages/FormRenderer';

function Home() {
  return <h1>ERP Web Next – Home</h1>;
}

const root = createRoot(document.getElementById('root'));
root.render(
  <BrowserRouter basename="/erp">
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<Home />} />
          <Route path="/form" element={<FormRenderer/>}/>
    </Routes>
  </BrowserRouter>
);
