// api-server/routes/dbtest.js
import express from 'express';
const router = express.Router();

router.get('/dbtest', async (req, res) => {
  try {
    const pool = req.app.get('erpPool');
    const [rows] = await pool.query('SELECT NOW() AS now');
    return res.json({ ok: true, time: rows[0].now });
  } catch (err) {
    console.error('DB test error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
