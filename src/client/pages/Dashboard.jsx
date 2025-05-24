// src/client/pages/Dashboard.jsx
export default function Dashboard() {
  return <h2>Welcome to your Dashboard</h2>;
}

// src/client/pages/Forms.jsx
import React, { useEffect, useState } from 'react';
export default function Forms() {
  const [forms, setForms] = useState([]);
  useEffect(() => {
    fetch('/erp/api/forms', { credentials: 'include' })
      .then(r => r.json())
      .then(data => setForms(data));
  }, []);
  return (
    <div>
      <h2>Forms</h2>
      <pre>{JSON.stringify(forms, null, 2)}</pre>
    </div>
  );
}

// src/client/pages/Reports.jsx
export default function Reports() {
  return <h2>Reports (coming soon)</h2>;
}

// src/client/pages/Users.jsx
export default function Users() {
  return <h2>User Management (coming soon)</h2>;
}
