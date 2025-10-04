import express from 'express';
import { requireAuth } from '../middlewares/auth.js';
import { loadReportApprovalArchive } from '../services/reportApprovals.js';

const router = express.Router();

router.get('/:requestId/file', requireAuth, async (req, res, next) => {
  try {
    const { requestId } = req.params;
    const { stream, mimeType, fileName, byteSize } =
      await loadReportApprovalArchive({
        requestId,
        viewerEmpId: req.user?.empid,
      });
    if (mimeType) {
      res.setHeader('Content-Type', mimeType);
    }
    if (fileName) {
      res.setHeader(
        'Content-Disposition',
        `inline; filename="${fileName.replace(/"/g, '')}"`,
      );
    }
    if (byteSize !== undefined && byteSize !== null) {
      res.setHeader('Content-Length', String(byteSize));
    }
    stream.on('error', next);
    stream.pipe(res);
  } catch (err) {
    if (err?.status === 404) {
      return res.status(404).json({ message: err.message || 'Not found' });
    }
    if (err?.status === 403) {
      return res.status(403).json({ message: err.message || 'Forbidden' });
    }
    if (err?.status === 400) {
      return res.status(400).json({ message: err.message || 'Bad request' });
    }
    return next(err);
  }
});

export default router;
