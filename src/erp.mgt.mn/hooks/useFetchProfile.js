// (for example) src/erp.mgt.mn/hooks/useFetchProfile.js
import { API_BASE } from '../utils/apiBase.js';

export async function fetchProfile() {
  const res = await fetch(`${API_BASE}/auth/me`, { credentials: 'include' });
  if (!res.ok) throw new Error('Failed to fetch profile');
  return res.json();
}
