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

function clampValue(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function parseDimensionValue(value, label) {
  if (value === undefined || value === null || value === '') {
    const err = new Error(`${label} is required`);
    err.status = 400;
    throw err;
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    const err = new Error(`${label} must be greater than 0`);
    err.status = 400;
    throw err;
  }
  return numeric;
}

function parseBooleanValue(value, fallback = true) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
    if (['false', '0', 'no', 'off'].includes(normalized)) return false;
  }
  return fallback;
}

function getPolylineBounds(polylines) {
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
  if (!Number.isFinite(minX) || !Number.isFinite(minY)) {
    const err = new Error('Unable to determine geometry bounds');
    err.status = 422;
    throw err;
  }
  const width = maxX - minX;
  const height = maxY - minY;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    const err = new Error('Invalid geometry size detected');
    err.status = 422;
    throw err;
  }
  return {
    minX,
    minY,
    maxX,
    maxY,
    width,
    height,
  };
}

function normalizePolylines(polylines, bounds) {
  return polylines.map((points) =>
    points.map((point) => ({
      x: (point.x - bounds.minX) / bounds.width,
      y: (point.y - bounds.minY) / bounds.height,
    })),
  );
}

function scalePolylines({
  normalizedPolylines,
  bounds,
  outputWidthMm,
  outputHeightMm,
  materialWidthMm,
  materialHeightMm,
  keepAspectRatio,
}) {
  const scaleX = outputWidthMm / bounds.width;
  const scaleY = outputHeightMm / bounds.height;
  let appliedScaleX = scaleX;
  let appliedScaleY = scaleY;
  let scaledWidth = outputWidthMm;
  let scaledHeight = outputHeightMm;

  if (keepAspectRatio) {
    const uniformScale = Math.min(scaleX, scaleY);
    appliedScaleX = uniformScale;
    appliedScaleY = uniformScale;
    scaledWidth = bounds.width * uniformScale;
    scaledHeight = bounds.height * uniformScale;
  }

  const scaled = normalizedPolylines.map((points) =>
    points.map((point) => {
      const x = keepAspectRatio
        ? point.x * bounds.width * appliedScaleX
        : point.x * outputWidthMm;
      const y = keepAspectRatio
        ? point.y * bounds.height * appliedScaleY
        : point.y * outputHeightMm;
      return {
        x: clampValue(x, 0, materialWidthMm),
        y: clampValue(y, 0, materialHeightMm),
      };
    }),
  );

  return {
    polylines: scaled,
    scaledWidth,
    scaledHeight,
  };
}

function generateGcode(polylines, options) {
  const {
    feedRate = 1200,
    plungeRate = 600,
    safeHeight = 5,
    cutDepth = -1,
    materialThicknessMm,
    materialWidthMm,
    materialHeightMm,
  } = options;

  const maxDepth = Number.isFinite(materialThicknessMm)
    ? Math.max(0, materialThicknessMm)
    : Math.abs(cutDepth);
  const boundedCutDepth = -Math.min(Math.abs(cutDepth), maxDepth);

  const maxX = Number.isFinite(materialWidthMm) ? materialWidthMm : Infinity;
  const maxY = Number.isFinite(materialHeightMm) ? materialHeightMm : Infinity;

  const lines = [
    'G21',
    'G90',
    `G0 Z${formatNumber(safeHeight)}`,
    'M3 S1000',
  ];

  polylines.forEach((points) => {
    const [first, ...rest] = points;
    if (!first) return;
    const startX = clampValue(first.x, 0, maxX);
    const startY = clampValue(first.y, 0, maxY);
    lines.push(`G0 X${formatNumber(startX)} Y${formatNumber(startY)}`);
    lines.push(`G1 Z${formatNumber(boundedCutDepth)} F${formatNumber(plungeRate)}`);
    lines.push(`G1 F${formatNumber(feedRate)}`);
    rest.forEach((point) => {
      const x = clampValue(point.x, 0, maxX);
      const y = clampValue(point.y, 0, maxY);
      lines.push(`G1 X${formatNumber(x)} Y${formatNumber(y)}`);
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
  return { polylines };
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
    const materialWidthMm = parseDimensionValue(options.materialWidthMm, 'Material width');
    const materialHeightMm = parseDimensionValue(options.materialHeightMm, 'Material height');
    const materialThicknessMm = parseDimensionValue(
      options.materialThicknessMm,
      'Material thickness',
    );
    const outputWidthMm = parseDimensionValue(options.outputWidthMm, 'Output width');
    const outputHeightMm = parseDimensionValue(options.outputHeightMm, 'Output height');
    const keepAspectRatio = parseBooleanValue(options.keepAspectRatio, true);

    if (outputWidthMm > materialWidthMm || outputHeightMm > materialHeightMm) {
      const err = new Error('Output size exceeds material bounds');
      err.status = 400;
      throw err;
    }

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

    const bounds = getPolylineBounds(polylines);
    const normalizedPolylines = normalizePolylines(polylines, bounds);
    const scaledResult = scalePolylines({
      normalizedPolylines,
      bounds,
      outputWidthMm,
      outputHeightMm,
      materialWidthMm,
      materialHeightMm,
      keepAspectRatio,
    });

    const scaledPolylines = scaledResult.polylines;

    preview = buildPreview(scaledPolylines);
    if (preview) {
      preview.viewBox = `0 0 ${materialWidthMm} ${materialHeightMm}`;
      preview.materialWidthMm = materialWidthMm;
      preview.materialHeightMm = materialHeightMm;
      preview.materialThicknessMm = materialThicknessMm;
      preview.outputWidthMm = scaledResult.scaledWidth;
      preview.outputHeightMm = scaledResult.scaledHeight;
    }

    if (normalizedOutput === 'gcode') {
      outputContent = generateGcode(scaledPolylines, {
        ...options,
        materialWidthMm,
        materialHeightMm,
        materialThicknessMm,
      });
      outputMime = 'text/plain';
      outputExtension = '.gcode';
    } else {
      outputContent = generateDxf(scaledPolylines);
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
