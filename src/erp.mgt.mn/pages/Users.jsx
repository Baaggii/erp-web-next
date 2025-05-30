import { useEffect, useState } from 'react';
export default function Users() {
  const [users, setUsers] = useState([]);
  useEffect(() => { fetch('/api/users').then(r => r.json()).then(setUsers); }, []);
  return (
    <table>
      <thead><tr><th>ID</th><th>Email</th></tr></thead>
      <tbody>{users.map(u => <tr key={u.id}><td>{u.id}</td><td>{u.email}</td></tr>)}</tbody>
    </table>
  );
}