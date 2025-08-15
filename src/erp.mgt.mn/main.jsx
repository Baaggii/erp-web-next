import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './utils/csrfFetch.js';
import './utils/debug.js';
import { setupDebugHooks } from './utils/debugHooks.js';
import './index.css';
import './legacyModals.js';

setupDebugHooks();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
