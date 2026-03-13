// (for example) src/erp.mgt.mn/hooks/useFetchProfile.js
import { initSession } from '../core/initSession.js';

export async function fetchProfile() {
  const sessionData = await initSession();
  if (!sessionData?.user) throw new Error('Failed to fetch profile');
  return sessionData.user;
}
