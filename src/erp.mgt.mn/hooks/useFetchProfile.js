// (for example) src/erp.mgt.mn/hooks/useFetchProfile.js
import { fetchWithApiFallback } from '../utils/apiBase.js';

export async function fetchProfile() {
  const res = await fetchWithApiFallback(fetch, '/auth/me', { credentials: 'include' });
  if (!res.ok) throw new Error('Failed to fetch profile');
  return res.json();
}
