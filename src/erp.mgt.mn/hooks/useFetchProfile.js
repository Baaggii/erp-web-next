// (for example) src/erp.mgt.mn/hooks/useFetchProfile.js
export async function fetchProfile() {
  const res = await fetch('/api/auth/me', { credentials: 'include' });
  if (!res.ok) throw new Error('Failed to fetch profile');
  return res.json();
}
