import { useEffect, useState } from 'react';

// Default export renamed to match import in App.jsx
export default function SettingsPage() {
  const [flags, setFlags] = useState({});

  useEffect(() => {
    fetch('/api/settings')
      .then(r => r.json())
      .then(setFlags);
  }, []);

  function toggleFlag(key) {
    const updated = { ...flags, [key]: !flags[key] };
    fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated)
    })
      .then(r => r.json())
      .then(setFlags);
  }

  return (
    <ul>
      {Object.entries(flags).map(([k, v]) => (
        <li key={k}>
          <label>
            <input type="checkbox" checked={v} onChange={() => toggleFlag(k)} /> {k}
          </label>
        </li>
      ))}
    </ul>
  );
}