import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const SNAPSHOT_DIR = process.env.REPORT_SNAPSHOT_DIR
  ? path.resolve(process.env.REPORT_SNAPSHOT_DIR)
  : path.join(process.cwd(), 'api-server', 'data', 'report-snapshots');

function ensureDir() {
  if (!fs.existsSync(SNAPSHOT_DIR)) {
    fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });
  }
}

function sanitizeRows(rows) {
  if (!Array.isArray(rows)) return [];
  return rows
    .map((row) => {
      if (!row || typeof row !== 'object') return null;
      const entries = Object.entries(row).filter(([key]) =>
        typeof key === 'string' && key.trim(),
      );
      return Object.fromEntries(entries);
    })
    .filter((row) => row && Object.keys(row).length > 0);
}

export function storeSnapshotArtifact({
  rows = [],
  columns = [],
  fieldTypeMap = {},
  procedure = null,
  params = {},
  reportMeta = {},
} = {}) {
  ensureDir();
  const sanitizedRows = sanitizeRows(rows);
  const artifactId = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
  const fileName = `${artifactId}.json`;
  const filePath = path.join(SNAPSHOT_DIR, fileName);
  const payload = {
    version: 1,
    createdAt: new Date().toISOString(),
    procedure: procedure || null,
    params: params && typeof params === 'object' && !Array.isArray(params) ? params : {},
    columns: Array.isArray(columns) ? columns.filter((c) => typeof c === 'string' && c.trim()) : [],
    fieldTypeMap:
      fieldTypeMap && typeof fieldTypeMap === 'object' && !Array.isArray(fieldTypeMap)
        ? Object.fromEntries(
            Object.entries(fieldTypeMap).filter(
              ([key, value]) => typeof key === 'string' && typeof value === 'string',
            ),
          )
        : {},
    reportMeta:
      reportMeta && typeof reportMeta === 'object' && !Array.isArray(reportMeta)
        ? reportMeta
        : {},
    rows: sanitizedRows,
  };
  const fd = fs.openSync(filePath, 'w');
  try {
    fs.writeSync(fd, JSON.stringify(payload));
  } finally {
    fs.closeSync(fd);
  }
  const stats = fs.statSync(filePath);
  return {
    id: artifactId,
    fileName,
    filePath,
    byteSize: stats.size,
    rowCount: sanitizedRows.length,
    createdAt: payload.createdAt,
  };
}

function getArtifactPath(artifactId) {
  if (!artifactId || typeof artifactId !== 'string') {
    throw new Error('Invalid artifact id');
  }
  const safeId = artifactId.replace(/[^a-zA-Z0-9_-]/g, '');
  if (!safeId) throw new Error('Invalid artifact id');
  return path.join(SNAPSHOT_DIR, `${safeId}.json`);
}

export function loadSnapshotArtifact(artifactId) {
  const filePath = getArtifactPath(artifactId);
  const contents = fs.readFileSync(filePath, 'utf8');
  const parsed = JSON.parse(contents);
  return parsed;
}

export function loadSnapshotArtifactPage(artifactId, page = 1, perPage = 200) {
  const parsed = loadSnapshotArtifact(artifactId);
  const rows = Array.isArray(parsed.rows) ? parsed.rows : [];
  const totalRows = rows.length;
  const safePerPage = Math.max(1, Math.min(Number(perPage) || 200, 1000));
  const safePage = Math.max(1, Number(page) || 1);
  const start = (safePage - 1) * safePerPage;
  const sliced = rows.slice(start, start + safePerPage);
  return {
    rows: sliced,
    rowCount: totalRows,
    page: safePage,
    perPage: safePerPage,
    columns: Array.isArray(parsed.columns) ? parsed.columns : [],
    fieldTypeMap:
      parsed.fieldTypeMap && typeof parsed.fieldTypeMap === 'object'
        ? parsed.fieldTypeMap
        : {},
    createdAt: parsed.createdAt || null,
    procedure: parsed.procedure || null,
    params: parsed.params || {},
    reportMeta:
      parsed.reportMeta && typeof parsed.reportMeta === 'object'
        ? parsed.reportMeta
        : {},
  };
}

export function deleteSnapshotArtifact(artifactId) {
  const filePath = getArtifactPath(artifactId);
  if (fs.existsSync(filePath)) {
    fs.rmSync(filePath);
  }
}

export const __test__ = {
  sanitizeRows,
  getArtifactPath,
  SNAPSHOT_DIR,
};
