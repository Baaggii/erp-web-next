import React, { useContext, useEffect, useState } from 'react';
import { AuthContext } from '../context/AuthContext.jsx';

export default function SalesDashboard() {
  const { user } = useContext(AuthContext);
  const [data, setData] = useState(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/dashboard', { credentials: 'include' });
        if (res.ok) {
          setData(await res.json());
        }
      } catch (err) {
        console.error('Failed to load dashboard', err);
      }
    }
    if (user) load();
  }, [user]);

  if (!user) return <div>Please login to view the dashboard.</div>;
  if (!data) return <div>Loading dashboard...</div>;

  return (
    <div>
      <h3>Dashboard for {user.empid}</h3>

      <section>
        <h4>Tasks</h4>
        <ul>
          {data.tasks.map((t) => (
            <li key={t.id}>
              <strong>{t.title}</strong>
              {t.progress !== undefined && ` – ${t.progress}%`}
              {t.due && ` (due ${t.due})`}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h4>Projects</h4>
        <ul>
          {data.projects.map((p) => (
            <li key={p.id}>
              {p.name} – {p.progress}%
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h4>Notifications</h4>
        <ul>
          {data.notifications.map((n) => (
            <li key={n.id}>{n.message}</li>
          ))}
        </ul>
      </section>

      {data.summary && (
        <section>
          <h4>AI Summary</h4>
          <p>{data.summary}</p>
        </section>
      )}
    </div>
  );
}
