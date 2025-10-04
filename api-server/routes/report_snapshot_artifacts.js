import express from 'express';
import { requireAuth } from '../middlewares/auth.js';
import {
  loadSnapshotArtifactPage,
  loadSnapshotArtifact,
} from '../services/reportSnapshotArtifacts.js';

const router = express.Router();

router.get('/:artifactId', requireAuth, (req, res, next) => {
  try {
    const { artifactId } = req.params;
    if (req.query.download) {
      const data = loadSnapshotArtifact(artifactId);
      res.setHeader('Content-Type', 'application/json');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${artifactId}.json"`,
      );
      return res.send(JSON.stringify(data));
    }
    const page = Number(req.query.page) || 1;
    const perPage = Number(req.query.per_page) || 200;
    const result = loadSnapshotArtifactPage(artifactId, page, perPage);
    return res.json({
      rows: result.rows,
      rowCount: result.rowCount,
      page: result.page,
      per_page: result.perPage,
      columns: result.columns,
      fieldTypeMap: result.fieldTypeMap,
      createdAt: result.createdAt,
      procedure: result.procedure,
      params: result.params,
    });
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      return res.status(404).json({ message: 'Snapshot artifact not found' });
    }
    if (err && err.message === 'Invalid artifact id') {
      return res.status(400).json({ message: err.message });
    }
    return next(err);
  }
});

export default router;
