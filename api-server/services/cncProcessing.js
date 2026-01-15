import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { performance } from 'perf_hooks';
import crypto from 'crypto';
import potraceModule from 'potrace';
import svg2gcode from 'svg2gcode';
import svg2dxf from 'svg2dxf';

const OUTPUT_DIR = path.join(os.tmpdir(), 'erp-cnc-processing');
const RASTER_EXTS = new Set(['.png', '.jpg', '.jpeg', '.bmp', '.tif', '.tiff']);
const VECTOR_EXTS = new Set(['.svg', '.dxf']);

function createError(message, status, details) {
  const err = new Error(message);
  err.status = status;
  if (details !== undefined) {
    err.details = details;
  }
  return err;
}

function normalizeOutputFormat(outputFormat) {
  const format = String(outputFormat || '').trim().toLowerCase();
  if (!format || format === 'gcode' || format === 'nc') return 'gcode';
  if (format === 'dxf') return 'dxf';
  return null;
}

function getPotraceTrace() {
  if (typeof potraceModule?.trace === 'function') return potraceModule.trace;
  if (typeof potraceModule?.Potrace?.trace === 'function') {
    return potraceModule.Potrace.trace.bind(potraceModule.Potrace);
  }
  return null;
}

async function rasterToSvg(buffer) {
  const trace = getPotraceTrace();
  if (!trace) {
    throw createError('Potrace conversion is unavailable on this server.', 500);
  }
  return new Promise((resolve, reject) => {
    trace(buffer, { turdSize: 10, optTolerance: 0.4 }, (err, svg) => {
      if (err) return reject(err);
      return resolve(svg);
    });
  });
}

function sanitizeBaseName(name) {
  return String(name || 'cnc')
    .replace(/\.[^/.]+$/, '')
    .replace(/[^a-z0-9_-]+/gi, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
}

function detectInputType({ originalName, mimeType }) {
  const ext = path.extname(originalName || '').toLowerCase();
  if (RASTER_EXTS.has(ext)) return 'raster';
  if (VECTOR_EXTS.has(ext)) return 'vector';
  if (mimeType === 'image/svg+xml') return 'vector';
  if (mimeType === 'image/png' || mimeType === 'image/jpeg') return 'raster';
  return null;
}

function ensureSvg2Gcode() {
  if (typeof svg2gcode !== 'function') {
    throw createError('SVG to G-code conversion is unavailable.', 500);
  }
}

function ensureSvg2Dxf() {
  if (typeof svg2dxf !== 'function') {
    throw createError('SVG to DXF conversion is unavailable.', 500);
  }
}

export async function processCncFile({
  buffer,
  originalName,
  mimeType,
  conversionType,
  outputFormat,
}) {
  const start = performance.now();
  const inputType = detectInputType({ originalName, mimeType });
  if (!inputType) {
    throw createError('Unsupported file type for CNC processing.', 415);
  }

  const targetFormat = normalizeOutputFormat(outputFormat);
  if (!targetFormat) {
    throw createError('Unsupported output format requested.', 400, {
      supported: ['gcode', 'dxf'],
    });
  }

  let svgContent = null;
  let outputBuffer;

  if (inputType === 'raster') {
    svgContent = await rasterToSvg(buffer);
  } else if (path.extname(originalName || '').toLowerCase() === '.svg') {
    svgContent = buffer.toString('utf-8');
  }

  if (targetFormat === 'gcode') {
    if (!svgContent) {
      throw createError('Vector data is required to generate G-code.', 400);
    }
    ensureSvg2Gcode();
    const gcode = svg2gcode(svgContent, {
      feedRate: 1200,
      seekRate: 3000,
      precision: 4,
      safeZ: 5,
      cutZ: -1,
    });
    outputBuffer = Buffer.from(gcode, 'utf-8');
  } else if (targetFormat === 'dxf') {
    if (svgContent) {
      ensureSvg2Dxf();
      const dxf = svg2dxf(svgContent);
      outputBuffer = Buffer.from(dxf, 'utf-8');
    } else {
      outputBuffer = buffer;
    }
  }

  if (!outputBuffer) {
    throw createError('Conversion failed to produce output.', 500);
  }

  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const baseName = sanitizeBaseName(originalName);
  const unique = crypto.randomUUID();
  const filename = `${baseName || 'cnc'}-${unique}.${targetFormat}`;
  const outputPath = path.join(OUTPUT_DIR, filename);
  await fs.writeFile(outputPath, outputBuffer);

  const end = performance.now();
  return {
    filename,
    outputPath,
    outputFormat: targetFormat,
    inputType,
    conversionType: conversionType || null,
    processingTimeMs: Math.round(end - start),
    sizeBytes: outputBuffer.length,
  };
}

export function getCncOutputPath(filename) {
  if (!filename) return null;
  const safe = path.basename(filename);
  return path.join(OUTPUT_DIR, safe);
}
