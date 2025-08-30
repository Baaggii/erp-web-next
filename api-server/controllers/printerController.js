import { listPrinters } from '../services/printers.js';

export async function getPrinters(req, res, next) {
  try {
    const printers = await listPrinters();
    res.json(printers);
  } catch (err) {
    next(err);
  }
}

export async function sendPrintJob(req, res, next) {
  try {
    const { printerId, content } = req.body;
    // In a real implementation, send content to printer here.
    console.log('Print job to', printerId, 'content length', content?.length);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}
