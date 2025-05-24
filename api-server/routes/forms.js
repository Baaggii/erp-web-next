import express from 'express';
import path from 'path';
import fs from 'fs';
const router = express.Router();
router.get('/forms', (req, res) => {
  const config = JSON.parse(fs.readFileSync(path.join(__dirname,'..','..','config','forms.json'),'utf8'));
  res.json(config);
});
router.post('/data', (req, res) => { console.log(req.body); res.json({ ok:true }); });
export default router;