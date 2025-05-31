export async function login(credentials) {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',         
    body: JSON.stringify(credentials)
  });
  return res.json();
}

export async function logout() {
  await fetch('/api/auth/logout', { method: 'POST' });
}
export async function fetchProfile() {
  const res = await fetch('/api/auth/me');
  if (!res.ok) throw new Error('Not authenticated');
  return res.json();
}