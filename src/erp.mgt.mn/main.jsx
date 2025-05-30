[⚠️ Suspicious Content] import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';

// If you have global styles for ERP, import them here. Otherwise, remove this line.
// import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);