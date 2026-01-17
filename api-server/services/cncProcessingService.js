import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import potrace from 'potrace';
import { svgPathProperties } from 'svg-path-properties';

const OUTPUT_DIR = path.join(os.tmpdir(), 'erp-cnc');
const outputRegistry = new Map();

const ALLOWED_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/svg+xml',
  'application/dxf',
  'image/vnd.dxf',
  'application/octet-stream',
]);

const ALLOWED_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.svg', '.dxf']);

function toSafeBaseName(name) {
  return name.replace(/[^a-z0-9_.-]/gi, '_');
}

function getFileExtension(name) {
  return path.extname(name || '').toLowerCase();
}

function isRaster(extension, mimeType) {
  return (
    ['.png', '.jpg', '.jpeg'].includes(extension) ||
    ['image/png', 'image/jpeg', 'image/jpg'].includes(mimeType)
  );
}

function isSvg(extension, mimeType) {
  return extension === '.svg' || mimeType === 'image/svg+xml';
}

function isDxf(extension, mimeType) {
  return (
    extension === '.dxf' ||
    mimeType === 'application/dxf' ||
    mimeType === 'image/vnd.dxf'
  );
}

function validateUpload(file) {
  const extension = getFileExtension(file.originalname);
  const mimeAllowed = ALLOWED_MIME_TYPES.has(file.mimetype);
  const extAllowed = ALLOWED_EXTENSIONS.has(extension);
  if (!mimeAllowed && !extAllowed) {
    const err = new Error('Unsupported file type');
    err.status = 415;
    throw err;
  }
  return extension;
}

async function rasterToSvg(buffer) {
  const { trace } = potrace;
  return new Promise((resolve, reject) => {
    trace(buffer, { color: 'black', turdSize: 2 }, (err, svg) => {
      if (err) reject(err);
      else resolve(svg);
    });
  });
}

function extractPathData(svgText) {
  const paths = [];
  const regex = /<path[^>]*?d=["']([^"']+)["'][^>]*?>/gi;
  let match;
  while ((match = regex.exec(svgText))) {
    paths.push(match[1]);
  }
  return paths;
}

function samplePath(pathData, step) {
  const props = new svgPathProperties(pathData);
  const total = props.getTotalLength();
  if (!Number.isFinite(total) || total <= 0) return [];
  const count = Math.max(2, Math.ceil(total / step));
  const points = [];
  for (let i = 0; i <= count; i += 1) {
    const point = props.getPointAtLength((total * i) / count);
    points.push({ x: point.x, y: point.y });
  }
  return points;
}

function pathsToPolylines(paths, step) {
  return paths
    .map((pathData) => samplePath(pathData, step))
    .filter((points) => points.length > 1);
}

function formatNumber(value) {
  return Number(value).toFixed(3);
}

function generateGcode(polylines, options) {
  const {
    feedRate = 1200,
    plungeRate = 600,
    safeHeight = 5,
    cutDepth = -1,
  } = options;

  const lines = [
    'G21',
    'G90',
    `G0 Z${formatNumber(safeHeight)}`,
    'M3 S1000',
  ];

  polylines.forEach((points) => {
    const [first, ...rest] = points;
    if (!first) return;
    lines.push(`G0 X${formatNumber(first.x)} Y${formatNumber(first.y)}`);
    lines.push(`G1 Z${formatNumber(cutDepth)} F${formatNumber(plungeRate)}`);
    lines.push(`G1 F${formatNumber(feedRate)}`);
    rest.forEach((point) => {
      lines.push(`G1 X${formatNumber(point.x)} Y${formatNumber(point.y)}`);
    });
    lines.push(`G0 Z${formatNumber(safeHeight)}`);
  });

  lines.push('M5');
  lines.push('G0 X0 Y0');
  return `${lines.join('\n')}\n`;
}

function generateDxf(polylines) {
  const lines = ['0', 'SECTION', '2', 'ENTITIES'];
  polylines.forEach((points) => {
    if (!points.length) return;
    lines.push('0', 'LWPOLYLINE');
    lines.push('8', '0');
    lines.push('90', String(points.length));
    lines.push('70', '1');
    points.forEach((point) => {
      lines.push('10', formatNumber(point.x));
      lines.push('20', formatNumber(point.y));
    });
  });
  lines.push('0', 'ENDSEC', '0', 'EOF');
  return `${lines.join('\n')}\n`;
}

function buildPreview(polylines) {
  if (!polylines?.length) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  polylines.forEach((points) => {
    points.forEach((point) => {
      if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
    });
  });
  if (!Number.isFinite(minX) || !Number.isFinite(minY)) return null;
  const padding = 5;
  const width = Math.max(1, maxX - minX + padding * 2);
  const height = Math.max(1, maxY - minY + padding * 2);
  return {
    viewBox: `${minX - padding} ${minY - padding} ${width} ${height}`,
    polylines,
  };
}

async function ensureOutputDir() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
}

export function getCncOutput(id) {
  return outputRegistry.get(id);
}

export async function processCncFile({
  file,
  outputFormat,
  options = {},
}) {
  const extension = validateUpload(file);
  const normalizedOutput = outputFormat?.toLowerCase() || 'gcode';
  const conversionType = options.conversionType || '2d_outline';
  if (!['gcode', 'dxf'].includes(normalizedOutput)) {
    const err = new Error('Unsupported output format');
    err.status = 400;
    throw err;
  }

  const raster = isRaster(extension, file.mimetype);
  const svg = isSvg(extension, file.mimetype);
  const dxf = isDxf(extension, file.mimetype);

  if (dxf && normalizedOutput !== 'dxf') {
    const err = new Error('DXF inputs can only be exported as DXF');
    err.status = 400;
    throw err;
  }

  let outputContent;
  let outputMime;
  let outputExtension;
  let preview = null;

  if (dxf && normalizedOutput === 'dxf') {
    outputContent = file.buffer;
    outputMime = 'application/dxf';
    outputExtension = '.dxf';
  } else {
    let svgText;
    if (svg) {
      svgText = file.buffer.toString('utf8');
    } else if (raster) {
      svgText = await rasterToSvg(file.buffer);
    } else {
      const err = new Error('Unsupported file type for conversion');
      err.status = 415;
      throw err;
    }

    const paths = extractPathData(svgText);
    if (!paths.length) {
      const err = new Error('No vector paths found for conversion');
      err.status = 422;
      throw err;
    }

    const step = Number(options.step ?? 5);
    const polylines = pathsToPolylines(paths, Number.isFinite(step) && step > 0 ? step : 5);
    if (!polylines.length) {
      const err = new Error('Failed to generate toolpaths from vector data');
      err.status = 422;
      throw err;
    }

    preview = buildPreview(polylines);

    if (normalizedOutput === 'gcode') {
      outputContent = generateGcode(polylines, options);
      outputMime = 'text/plain';
      outputExtension = '.gcode';
    } else {
      outputContent = generateDxf(polylines);
      outputMime = 'application/dxf';
      outputExtension = '.dxf';
    }
  }

  await ensureOutputDir();
  const id = crypto.randomUUID();
  const baseName = toSafeBaseName(path.basename(file.originalname, extension || undefined));
  const fileName = `${baseName || 'cnc-output'}-${id}${outputExtension}`;
  const outputPath = path.join(OUTPUT_DIR, fileName);
  await fs.writeFile(outputPath, outputContent);

  const metadata = {
    id,
    fileName,
    path: outputPath,
    mimeType: outputMime,
    createdAt: Date.now(),
    preview,
    conversionType,
  };
  outputRegistry.set(id, metadata);
  return metadata;
}
