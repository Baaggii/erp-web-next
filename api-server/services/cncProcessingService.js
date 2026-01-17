import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import potrace from 'potrace';
import { svgPathProperties } from 'svg-path-properties';
import toolLibrary from '../data/toolLibrary.json' assert { type: 'json' };

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
  'model/stl',
  'application/sla',
  'application/vnd.ms-pki.stl',
]);

const ALLOWED_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.svg',
  '.dxf',
  '.stl',
]);

const TOOL_LIBRARY = (toolLibrary || []).map((tool) => ({
  ...tool,
  type: tool.shape || tool.type || 'flat',
}));

const TOOL_COLORS = ['#2563eb', '#db2777', '#059669', '#f59e0b', '#7c3aed'];

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

function isStl(extension, mimeType) {
  return (
    extension === '.stl' ||
    mimeType === 'model/stl' ||
    mimeType === 'application/sla' ||
    mimeType === 'application/vnd.ms-pki.stl'
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

function parseOptionalNumber(value, fallback = null) {
  if (value === undefined || value === null || value === '') return fallback;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
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
    scaleX,
    scaleY,
    appliedScaleX,
    appliedScaleY,
  };
}

function scalePolylinesWithZ({
  polylines,
  bounds,
  outputWidthMm,
  outputHeightMm,
  materialWidthMm,
  materialHeightMm,
  keepAspectRatio,
}) {
  const scaleX = outputWidthMm / bounds.width;
  const scaleY = outputHeightMm / bounds.height;
  const uniformScale = keepAspectRatio ? Math.min(scaleX, scaleY) : null;
  const appliedScaleX = keepAspectRatio ? uniformScale : scaleX;
  const appliedScaleY = keepAspectRatio ? uniformScale : scaleY;
  const scaled = polylines.map((points) =>
    points.map((point) => {
      const x = (point.x - bounds.minX) * appliedScaleX;
      const y = (point.y - bounds.minY) * appliedScaleY;
      const z = Number.isFinite(point.z) ? point.z * (uniformScale || 1) : point.z;
      return {
        x: clampValue(x, 0, materialWidthMm),
        y: clampValue(y, 0, materialHeightMm),
        z,
      };
    }),
  );
  return { polylines: scaled };
}

function getToolById(toolId) {
  return TOOL_LIBRARY.find((tool) => tool.id === toolId) || null;
}

function resolveTool(options = {}) {
  const toolId = options.toolId || options.toolID || options.tool_id;
  if (!toolId) {
    return {
      id: 'legacy',
      name: 'Legacy toolpath',
      type: 'flat',
      shape: 'flat',
      diameterMm: 0,
      maxDepthMm: Infinity,
      toolNumber: 0,
      defaultFeedRateXY: 1200,
      defaultFeedRateZ: 600,
      defaultSpindleSpeed: 1000,
    };
  }
  const baseTool = getToolById(toolId);
  if (!baseTool) {
    const err = new Error('Unknown tool selection');
    err.status = 400;
    throw err;
  }
  const overrideDiameter = parseOptionalNumber(options.toolDiameterOverrideMm, null);
  const diameterMm = overrideDiameter && overrideDiameter > 0 ? overrideDiameter : baseTool.diameterMm;
  return {
    ...baseTool,
    type: baseTool.shape || baseTool.type || 'flat',
    shape: baseTool.shape || baseTool.type || 'flat',
    diameterMm,
  };
}

function buildOperations(polylines, options, defaultTool) {
  const operationsRaw = options.operations;
  if (!operationsRaw) {
    return [
      {
        id: 'op-1',
        tool: defaultTool,
        strategy: options.strategy || 'outline',
        polylines,
      },
    ];
  }

  let parsed;
  if (typeof operationsRaw === 'string') {
    try {
      parsed = JSON.parse(operationsRaw);
    } catch (err) {
      const error = new Error('Invalid operations payload');
      error.status = 400;
      throw error;
    }
  } else {
    parsed = operationsRaw;
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    return [
      {
        id: 'op-1',
        tool: defaultTool,
        strategy: options.strategy || 'outline',
        polylines,
      },
    ];
  }
  return parsed.map((operation, index) => {
    const tool = resolveTool({ toolId: operation.toolId }) || defaultTool;
    const subset = Array.isArray(operation.geometrySubset) ? operation.geometrySubset : [];
    const indices = subset
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value) && value >= 0 && value < polylines.length);
    const subsetPolylines = indices.length
      ? indices.map((i) => polylines[i]).filter(Boolean)
      : polylines;
    return {
      id: operation.id || `op-${index + 1}`,
      tool,
      strategy: operation.strategy || 'outline',
      polylines: subsetPolylines,
    };
  });
}

function offsetPolyline(polyline, offset) {
  if (!offset || !polyline || polyline.length < 2) return polyline;
  return polyline.map((point, index) => {
    const prev = polyline[index - 1] || point;
    const next = polyline[index + 1] || point;
    const v1x = point.x - prev.x;
    const v1y = point.y - prev.y;
    const v2x = next.x - point.x;
    const v2y = next.y - point.y;
    const n1 = Math.hypot(v1x, v1y);
    const n2 = Math.hypot(v2x, v2y);
    const nx1 = n1 ? -v1y / n1 : 0;
    const ny1 = n1 ? v1x / n1 : 0;
    const nx2 = n2 ? -v2y / n2 : 0;
    const ny2 = n2 ? v2x / n2 : 0;
    const nx = nx1 + nx2;
    const ny = ny1 + ny2;
    const n = Math.hypot(nx, ny) || 1;
    return {
      ...point,
      x: point.x + (nx / n) * offset,
      y: point.y + (ny / n) * offset,
    };
  });
}

function applyToolpathOffset(polylines, toolRadiusMm) {
  if (!toolRadiusMm) return polylines;
  return polylines.map((polyline) => offsetPolyline(polyline, toolRadiusMm));
}

function parseStl(buffer) {
  if (!buffer || buffer.length < 84) return null;
  const header = buffer.slice(0, 80).toString('utf8');
  const isAscii = header.trim().startsWith('solid');
  if (isAscii) {
    const text = buffer.toString('utf8');
    const vertexRegex = /vertex\s+([-\d.eE+]+)\s+([-\d.eE+]+)\s+([-\d.eE+]+)/g;
    const vertices = [];
    let match;
    while ((match = vertexRegex.exec(text))) {
      vertices.push({ x: Number(match[1]), y: Number(match[2]), z: Number(match[3]) });
    }
    const faces = [];
    for (let i = 0; i < vertices.length; i += 3) {
      faces.push([vertices[i], vertices[i + 1], vertices[i + 2]]);
    }
    return { vertices, faces };
  }
  const dv = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const triangleCount = dv.getUint32(80, true);
  const vertices = [];
  const faces = [];
  let offset = 84;
  for (let i = 0; i < triangleCount; i += 1) {
    offset += 12;
    const tri = [];
    for (let v = 0; v < 3; v += 1) {
      const x = dv.getFloat32(offset, true);
      const y = dv.getFloat32(offset + 4, true);
      const z = dv.getFloat32(offset + 8, true);
      const vertex = { x, y, z };
      vertices.push(vertex);
      tri.push(vertex);
      offset += 12;
    }
    faces.push(tri);
    offset += 2;
  }
  return { vertices, faces };
}

function getMeshBounds(mesh) {
  if (!mesh?.faces?.length) return null;
  return mesh.faces.reduce(
    (acc, tri) => {
      tri.forEach((v) => {
        acc.minX = Math.min(acc.minX, v.x);
        acc.maxX = Math.max(acc.maxX, v.x);
        acc.minY = Math.min(acc.minY, v.y);
        acc.maxY = Math.max(acc.maxY, v.y);
        acc.minZ = Math.min(acc.minZ, v.z);
        acc.maxZ = Math.max(acc.maxZ, v.z);
      });
      return acc;
    },
    {
      minX: Infinity,
      maxX: -Infinity,
      minY: Infinity,
      maxY: -Infinity,
      minZ: Infinity,
      maxZ: -Infinity,
    },
  );
}

function generateMeshToolpaths(mesh, options, tool) {
  if (!mesh?.faces?.length) return [];
  const stepOverPercent = parseOptionalNumber(options.stepOverPercent, 40);
  const stepOver = (tool.diameterMm || 1) * (stepOverPercent / 100);
  const faces = mesh.faces;
  const bounds = faces.reduce(
    (acc, tri) => {
      tri.forEach((v) => {
        acc.minX = Math.min(acc.minX, v.x);
        acc.maxX = Math.max(acc.maxX, v.x);
        acc.minY = Math.min(acc.minY, v.y);
        acc.maxY = Math.max(acc.maxY, v.y);
        acc.minZ = Math.min(acc.minZ, v.z);
        acc.maxZ = Math.max(acc.maxZ, v.z);
      });
      return acc;
    },
    {
      minX: Infinity,
      maxX: -Infinity,
      minY: Infinity,
      maxY: -Infinity,
      minZ: Infinity,
      maxZ: -Infinity,
    },
  );

  const sliceStep = stepOver > 0 ? stepOver : 1;
  const toolpaths = [];
  for (let x = bounds.minX; x <= bounds.maxX; x += sliceStep) {
    const intersections = [];
    faces.forEach((tri) => {
      const points = [];
      for (let i = 0; i < 3; i += 1) {
        const a = tri[i];
        const b = tri[(i + 1) % 3];
        if ((a.x <= x && b.x >= x) || (a.x >= x && b.x <= x)) {
          const t = a.x === b.x ? 0 : (x - a.x) / (b.x - a.x);
          if (t >= 0 && t <= 1) {
            points.push({
              x,
              y: a.y + (b.y - a.y) * t,
              z: a.z + (b.z - a.z) * t,
            });
          }
        }
      }
      if (points.length >= 2) {
        intersections.push(...points.slice(0, 2));
      }
    });
    if (intersections.length >= 2) {
      const ordered = intersections.sort((a, b) => a.y - b.y);
      toolpaths.push(ordered.map((point) => ({ ...point })));
    }
  }
  return toolpaths;
}

function resolveHeightFieldGrid({
  widthMm,
  heightMm,
  resolution,
  imageWidthPx,
  imageHeightPx,
}) {
  const fallbackCols = Math.max(10, Math.round(resolution));
  const fallbackRows = Math.max(10, Math.round((resolution * heightMm) / widthMm));
  if (!Number.isFinite(imageWidthPx) || !Number.isFinite(imageHeightPx)) {
    return { cols: fallbackCols, rows: fallbackRows };
  }
  const maxDimension = Math.max(imageWidthPx, imageHeightPx);
  const scale = maxDimension > 0 ? Math.min(1, resolution / maxDimension) : 1;
  const cols = Math.max(10, Math.round(imageWidthPx * scale));
  const rows = Math.max(10, Math.round(imageHeightPx * scale));
  return { cols, rows };
}

function createHeightField(widthMm, heightMm, thicknessMm, options = {}) {
  const resolution = parseOptionalNumber(options.resolution, 140);
  const imageWidthPx = parseOptionalNumber(options.imageWidthPx, null);
  const imageHeightPx = parseOptionalNumber(options.imageHeightPx, null);
  const { cols, rows } = resolveHeightFieldGrid({
    widthMm,
    heightMm,
    resolution,
    imageWidthPx,
    imageHeightPx,
  });
  const heightField = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => thicknessMm),
  );
  return {
    heightField,
    cols,
    rows,
  };
}

function smoothHeightField(heightField, radius) {
  if (!Array.isArray(heightField) || !heightField.length) return heightField;
  const rows = heightField.length;
  const cols = heightField[0]?.length || 0;
  if (!rows || !cols || radius <= 0) return heightField;
  const next = Array.from({ length: rows }, () => Array(cols).fill(0));
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      let sum = 0;
      let count = 0;
      for (let dy = -radius; dy <= radius; dy += 1) {
        for (let dx = -radius; dx <= radius; dx += 1) {
          const ny = y + dy;
          const nx = x + dx;
          if (ny < 0 || ny >= rows || nx < 0 || nx >= cols) continue;
          sum += heightField[ny][nx];
          count += 1;
        }
      }
      next[y][x] = count ? sum / count : heightField[y][x];
    }
  }
  return next;
}

function clampHeightField(heightField, minValue, maxValue) {
  if (!Array.isArray(heightField)) return heightField;
  return heightField.map((row) =>
    row.map((value) => clampValue(value, minValue, maxValue)),
  );
}

function applyToolFootprint(heightField, cols, rows, material, tool, point, targetDepthMm) {
  const radius = Math.max(0.1, tool.diameterMm / 2 || 0.1);
  const cellWidth = material.widthMm / cols;
  const cellHeight = material.heightMm / rows;
  const centerX = point.x;
  const centerY = point.y;
  const depth = Math.min(targetDepthMm, tool.maxDepthMm || targetDepthMm);
  const minX = Math.max(0, Math.floor((centerX - radius) / cellWidth));
  const maxX = Math.min(cols - 1, Math.ceil((centerX + radius) / cellWidth));
  const minY = Math.max(0, Math.floor((centerY - radius) / cellHeight));
  const maxY = Math.min(rows - 1, Math.ceil((centerY + radius) / cellHeight));

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const worldX = (x + 0.5) * cellWidth;
      const worldY = (y + 0.5) * cellHeight;
      const dx = worldX - centerX;
      const dy = worldY - centerY;
      const dist = Math.hypot(dx, dy);
      let removal = 0;
      if (tool.type === 'flat') {
        if (Math.abs(dx) <= radius && Math.abs(dy) <= radius) removal = depth;
      } else if (tool.type === 'ball') {
        if (dist <= radius) {
          const cap = radius - Math.sqrt(Math.max(0, radius * radius - dist * dist));
          removal = depth - cap;
        }
      } else if (tool.type === 'vbit' || tool.type === 'engraving') {
        const angleRad = ((tool.angleDeg || 60) * Math.PI) / 180;
        const maxDepth = Math.tan(angleRad / 2) ? dist / Math.tan(angleRad / 2) : depth;
        removal = Math.max(0, depth - maxDepth);
      }
      if (removal > 0) {
        heightField[y][x] = Math.max(material.minHeightMm, heightField[y][x] - removal);
      }
    }
  }
}

function simulateHeightField(operations, material, options) {
  const resolution = parseOptionalNumber(options.heightFieldResolution, 140);
  const imageWidthPx = parseOptionalNumber(options.imageWidthPx, null);
  const imageHeightPx = parseOptionalNumber(options.imageHeightPx, null);
  const { heightField, cols, rows } = createHeightField(
    material.widthMm,
    material.heightMm,
    material.thicknessMm,
    {
      resolution,
      imageWidthPx,
      imageHeightPx,
    },
  );
  const maxDepth = Math.min(material.thicknessMm, material.maxDepthMm);
  const requestedDepth = parseOptionalNumber(options.heightFieldMaxDepthMm, maxDepth);
  const depthScale = clampValue(requestedDepth ?? maxDepth, 0.1, maxDepth);
  const cellWidth = material.widthMm / cols;
  const cellHeight = material.heightMm / rows;
  operations.forEach((operation) => {
    const tool = operation.tool;
    operation.polylines.forEach((polyline) => {
      for (let i = 1; i < polyline.length; i += 1) {
        const start = polyline[i - 1];
        const end = polyline[i];
        const segmentLength = Math.hypot(end.x - start.x, end.y - start.y);
        const toolStep = Math.max(0.4, (tool.diameterMm || 1) * 0.35);
        const gridStep = Math.min(cellWidth, cellHeight);
        const step = Math.max(0.2, Math.min(toolStep, gridStep));
        const steps = Math.max(1, Math.ceil(segmentLength / step));
        for (let s = 0; s <= steps; s += 1) {
          const t = steps === 0 ? 0 : s / steps;
          const x = start.x + (end.x - start.x) * t;
          const y = start.y + (end.y - start.y) * t;
          const z = Number.isFinite(end.z)
            ? Math.min(Math.abs(end.z), depthScale)
            : depthScale;
          applyToolFootprint(heightField, cols, rows, material, tool, { x, y }, z);
        }
      }
    });
  });
  const smoothingEnabled = parseBooleanValue(options.heightFieldSmoothingEnabled, false);
  const smoothingRadius = Math.round(
    parseOptionalNumber(options.heightFieldSmoothingRadius, 1) || 1,
  );
  const smoothedField =
    smoothingEnabled && smoothingRadius > 0
      ? smoothHeightField(heightField, smoothingRadius)
      : heightField;
  const clampedField = clampHeightField(smoothedField, material.minHeightMm, material.thicknessMm);
  return { heightField: clampedField, cols, rows, maxDepthMm: depthScale };
}

function generateGcode(operations, options) {
  const safeHeight = parseOptionalNumber(options.safeHeightMm, options.safeHeight ?? 5);
  const cutDepth = parseOptionalNumber(options.cutDepthMm, options.cutDepth ?? -1);
  const maxStepDownMm = parseOptionalNumber(options.maxStepDownMm, 1.5);
  const materialThicknessMm = parseOptionalNumber(options.materialThicknessMm, 0);
  const materialWidthMm = parseOptionalNumber(options.materialWidthMm, Infinity);
  const materialHeightMm = parseOptionalNumber(options.materialHeightMm, Infinity);
  const maxX = Number.isFinite(materialWidthMm) ? materialWidthMm : Infinity;
  const maxY = Number.isFinite(materialHeightMm) ? materialHeightMm : Infinity;

  const lines = ['G21', 'G90', `G0 Z${formatNumber(safeHeight)}`];

  operations.forEach((operation, index) => {
    const tool = operation.tool;
    const feedRateXY = parseOptionalNumber(
      options.feedRateXY,
      tool?.defaultFeedRateXY ?? 1200,
    );
    const feedRateZ = parseOptionalNumber(
      options.feedRateZ,
      tool?.defaultFeedRateZ ?? 600,
    );
    const spindleSpeed = parseOptionalNumber(
      options.spindleSpeed,
      tool?.defaultSpindleSpeed ?? 1000,
    );
    const toolNumber = tool?.toolNumber ?? index + 1;
    if (toolNumber) {
      lines.push(`T${toolNumber} M6`);
      lines.push(`; Tool: ${tool?.name || 'Unknown'}`);
    }
    lines.push(`M3 S${formatNumber(spindleSpeed)}`);
    const targetDepth = Math.min(
      Math.abs(cutDepth),
      materialThicknessMm || Math.abs(cutDepth),
      tool?.maxDepthMm ?? Math.abs(cutDepth),
    );
    const passDepth = Math.max(0.2, maxStepDownMm || targetDepth);
    const passes = Math.max(1, Math.ceil(targetDepth / passDepth));
    const passDepths = Array.from({ length: passes }, (_, i) =>
      -Math.min(targetDepth, (i + 1) * passDepth),
    );

    operation.polylines.forEach((points) => {
      const [first, ...rest] = points;
      if (!first) return;
      const startX = clampValue(first.x, 0, maxX);
      const startY = clampValue(first.y, 0, maxY);
      const hasZ = rest.some((point) => Number.isFinite(point.z)) || Number.isFinite(first.z);

      lines.push(`G0 X${formatNumber(startX)} Y${formatNumber(startY)}`);
      if (hasZ) {
        const startZ = clampValue(first.z ?? -targetDepth, -targetDepth, safeHeight);
        lines.push(`G1 Z${formatNumber(startZ)} F${formatNumber(feedRateZ)}`);
        lines.push(`G1 F${formatNumber(feedRateXY)}`);
        rest.forEach((point) => {
          const x = clampValue(point.x, 0, maxX);
          const y = clampValue(point.y, 0, maxY);
          const z = clampValue(point.z ?? startZ, -targetDepth, safeHeight);
          lines.push(`G1 X${formatNumber(x)} Y${formatNumber(y)} Z${formatNumber(z)}`);
        });
        lines.push(`G0 Z${formatNumber(safeHeight)}`);
        return;
      }

      passDepths.forEach((depth) => {
        lines.push(`G1 Z${formatNumber(depth)} F${formatNumber(feedRateZ)}`);
        lines.push(`G1 F${formatNumber(feedRateXY)}`);
        rest.forEach((point) => {
          const x = clampValue(point.x, 0, maxX);
          const y = clampValue(point.y, 0, maxY);
          lines.push(`G1 X${formatNumber(x)} Y${formatNumber(y)}`);
        });
        lines.push(`G0 Z${formatNumber(safeHeight)}`);
      });
    });
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

function buildPreview(operations, tool, heightFieldData = null) {
  const polylines = operations.flatMap((operation) => operation.polylines || []);
  if (!polylines?.length) return null;
  return {
    polylines,
    operations: operations.map((operation, index) => ({
      id: operation.id,
      toolId: operation.tool?.id,
      toolName: operation.tool?.name,
      toolType: operation.tool?.type,
      toolDiameterMm: operation.tool?.diameterMm,
      toolAngleDeg: operation.tool?.angleDeg,
      color: TOOL_COLORS[index % TOOL_COLORS.length],
      polylines: operation.polylines,
      strategy: operation.strategy,
    })),
    toolLibrary: TOOL_LIBRARY,
    tool: tool
      ? {
      id: tool.id,
      name: tool.name,
      type: tool.type,
      shape: tool.shape,
      diameterMm: tool.diameterMm,
      angleDeg: tool.angleDeg,
      maxDepthMm: tool.maxDepthMm,
      fluteLengthMm: tool.fluteLengthMm,
      defaultFeedRateXY: tool.defaultFeedRateXY,
      defaultFeedRateZ: tool.defaultFeedRateZ,
      defaultSpindleSpeed: tool.defaultSpindleSpeed,
    }
      : null,
    heightField: heightFieldData?.heightField || null,
    heightFieldMeta: heightFieldData
      ? {
          cols: heightFieldData.cols,
          rows: heightFieldData.rows,
          maxDepthMm: heightFieldData.maxDepthMm,
        }
      : null,
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
  const stl = isStl(extension, file.mimetype);

  if (dxf && normalizedOutput !== 'dxf') {
    const err = new Error('DXF inputs can only be exported as DXF');
    err.status = 400;
    throw err;
  }
  if (stl && normalizedOutput !== 'gcode') {
    const err = new Error('STL inputs can only be exported as G-code');
    err.status = 400;
    throw err;
  }

  let outputContent;
  let outputMime;
  let outputExtension;
  let preview = null;
  let materialWidthMm = null;
  let materialHeightMm = null;
  let materialThicknessMm = null;
  let scaledResult = null;
  let scaleMeta = null;

  if (dxf && normalizedOutput === 'dxf') {
    outputContent = file.buffer;
    outputMime = 'application/dxf';
    outputExtension = '.dxf';
  } else {
    const tool = resolveTool(options);
    materialWidthMm = parseDimensionValue(options.materialWidthMm, 'Material width');
    materialHeightMm = parseDimensionValue(options.materialHeightMm, 'Material height');
    materialThicknessMm = parseDimensionValue(
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

    let scaledPolylines = [];

    if (stl) {
      const mesh = parseStl(file.buffer);
      if (!mesh) {
        const err = new Error('Unable to parse STL file');
        err.status = 422;
        throw err;
      }
      const meshBounds = getMeshBounds(mesh);
      const toolpaths = generateMeshToolpaths(mesh, options, tool);
      if (!toolpaths.length) {
        const err = new Error('No toolpaths generated from STL mesh');
        err.status = 422;
        throw err;
      }
      const scaleX = outputWidthMm / (meshBounds.maxX - meshBounds.minX);
      const scaleY = outputHeightMm / (meshBounds.maxY - meshBounds.minY);
      const uniformScale = Math.min(scaleX, scaleY);
      const appliedScaleX = keepAspectRatio ? uniformScale : scaleX;
      const appliedScaleY = keepAspectRatio ? uniformScale : scaleY;
      const appliedScaleZ = keepAspectRatio ? uniformScale : Math.min(scaleX, scaleY);
      scaleMeta = {
        scaleX,
        scaleY,
        appliedScaleX,
        appliedScaleY,
      };
      scaledPolylines = toolpaths.map((polyline) =>
        polyline.map((point) => ({
          x: clampValue((point.x - meshBounds.minX) * appliedScaleX, 0, materialWidthMm),
          y: clampValue((point.y - meshBounds.minY) * appliedScaleY, 0, materialHeightMm),
          z: -Math.max(0, (meshBounds.maxZ - point.z) * appliedScaleZ),
        })),
      );
      scaledResult = {
        scaledWidth: outputWidthMm,
        scaledHeight: outputHeightMm,
      };
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

      const bounds = getPolylineBounds(polylines);
      const normalizedPolylines = normalizePolylines(polylines, bounds);
      scaledResult = scalePolylines({
        normalizedPolylines,
        bounds,
        outputWidthMm,
        outputHeightMm,
        materialWidthMm,
        materialHeightMm,
        keepAspectRatio,
      });
      scaledPolylines = scaledResult.polylines;
      scaleMeta = {
        scaleX: scaledResult.scaleX,
        scaleY: scaledResult.scaleY,
        appliedScaleX: scaledResult.appliedScaleX,
        appliedScaleY: scaledResult.appliedScaleY,
      };
    }

    const operations = buildOperations(scaledPolylines, options, tool).map((operation) => {
      const toolRadius = (operation.tool?.diameterMm || 0) / 2;
      return {
        ...operation,
        polylines: applyToolpathOffset(operation.polylines, toolRadius),
      };
    });

    const material = {
      widthMm: materialWidthMm,
      heightMm: materialHeightMm,
      thicknessMm: materialThicknessMm,
      minHeightMm: 0,
      maxDepthMm: materialThicknessMm,
    };

    const heightFieldData = simulateHeightField(operations, material, options);

    preview = buildPreview(operations, tool, heightFieldData);
    if (preview) {
      preview.viewBox = `0 0 ${materialWidthMm} ${materialHeightMm}`;
      preview.materialWidthMm = materialWidthMm;
      preview.materialHeightMm = materialHeightMm;
      preview.materialThicknessMm = materialThicknessMm;
      preview.outputWidthMm = scaledResult?.scaledWidth || outputWidthMm;
      preview.outputHeightMm = scaledResult?.scaledHeight || outputHeightMm;
      preview.toolRadiusMm = tool.diameterMm / 2;
      preview.scale = scaleMeta;
    }

    if (normalizedOutput === 'gcode') {
      outputContent = generateGcode(operations, {
        ...options,
        materialWidthMm,
        materialHeightMm,
        materialThicknessMm,
      });
      outputMime = 'text/plain';
      outputExtension = '.gcode';
    } else {
      outputContent = generateDxf(operations.flatMap((operation) => operation.polylines));
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
    material: Number.isFinite(materialWidthMm)
      ? {
          widthMm: materialWidthMm,
          heightMm: materialHeightMm,
          thicknessMm: materialThicknessMm,
        }
      : null,
    output: scaledResult
      ? {
          widthMm: scaledResult?.scaledWidth || null,
          heightMm: scaledResult?.scaledHeight || null,
          scale: scaleMeta,
        }
      : null,
  };
  outputRegistry.set(id, metadata);
  return metadata;
}
