export async function login(credentials) {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',         // ← allow browser to store the `Set-Cookie` header
    body: JSON.stringify(credentials)
  });
  if (!res.ok) {
    // Bubble up a JSON error if login failed (401/500/etc)
    const err = await res.json().catch(() => ({ message: 'Login failed' }));
    throw new Error(err.message || 'Login failed');
  }
  return res.json();
}

export async function logout() {
  await fetch('/api/auth/logout', {
    method: 'POST',
    credentials: 'include'
  });
}

export async function fetchProfile() {
  const res = await fetch('/api/auth/me', {
    credentials: 'include'
  });
  if (!res.ok) {
    throw new Error('Not authenticated');
  }
  return res.json();
}