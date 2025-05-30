import { testConnection } from '../../db/index.js';
export async function testDb(req, res) {
  const ok = await testConnection();
  res.json({ database: ok ? 'OK' : 'FAIL' });
}