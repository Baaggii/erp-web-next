import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useToast } from '../context/ToastContext.jsx';
import toolLibrary from '../data/toolLibrary.js';
import { API_BASE } from '../utils/apiBase.js';

const processingOptions = [
  { value: '2d_outline', label: '2D outline' },
  { value: '2_5d_heightmap', label: '2.5D heightmap' },
  { value: '3d_model', label: '3D model' },
];

const outputOptions = [
  { value: 'gcode', label: 'G-code' },
  { value: 'dxf', label: 'DXF' },
];

const supportedExtensions = ['.png', '.jpg', '.jpeg', '.svg', '.dxf', '.stl'];
const supportedMimeTypes = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/pjpeg',
  'image/svg+xml',
  'image/x-png',
  'application/dxf',
  'application/vnd.dxf',
  'image/vnd.dxf',
  'model/stl',
  'application/sla',
  'application/vnd.ms-pki.stl',
]);
const woodSurfaceOptions = [
  {
    value: 'oak',
    label: 'Oak',
    textureUrl: 'https://upload.wikimedia.org/wikipedia/commons/7/7f/Oak_wood_texture.jpg',
  },
  {
    value: 'walnut',
    label: 'Walnut',
    textureUrl: 'https://upload.wikimedia.org/wikipedia/commons/9/9d/Walnut_wood_texture.jpg',
  },
  {
    value: 'maple',
    label: 'Maple',
    textureUrl: 'https://upload.wikimedia.org/wikipedia/commons/1/12/Maple_wood_texture.jpg',
  },
  {
    value: 'pine',
    label: 'Pine',
    textureUrl: 'https://upload.wikimedia.org/wikipedia/commons/2/2f/Pine_wood_texture.jpg',
  },
  {
    value: 'cherry',
    label: 'Cherry',
    textureUrl: 'https://upload.wikimedia.org/wikipedia/commons/8/8b/Cherry_wood_texture.jpg',
  },
];

const defaultMaterialSize = {
  width: 300,
  height: 200,
  thickness: 18,
};

const defaultCamParams = {
  feedRateXY: 800,
  feedRateZ: 300,
  maxStepDownMm: 1.5,
  stepOverPercent: 40,
  safeHeightMm: 5,
  spindleSpeed: 12000,
};

function isSupportedFile(file) {
  if (!file) return false;
  if (supportedMimeTypes.has(file.type)) return true;
  const name = file.name?.toLowerCase() || '';
  return supportedExtensions.some((ext) => name.endsWith(ext));
}

function extractDownloadInfo(data) {
  if (!data || typeof data !== 'object') return null;
  return {
    url: data.downloadUrl || data.download_url || data.url || data.fileUrl || '',
    filename: data.filename || data.name || 'cnc-output',
  };
}

function formatTimestamp(date = new Date()) {
  return date.toLocaleString();
}

function formatDimension(value) {
  if (!Number.isFinite(value)) return '';
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(2).replace(/\.00$/, '');
}

function getToolStrokeWidth(diameterMm) {
  if (!Number.isFinite(diameterMm)) return 0.8;
  return Math.max(0.6, diameterMm * 0.35);
}

function getToolShapeLabel(shape) {
  if (!shape) return 'Unknown';
  if (shape === 'flat') return 'Flat';
  if (shape === 'ball') return 'Ball nose';
  if (shape === 'vbit') return 'V-bit';
  return shape;
}

function ToolShapePreview({ shape, diameterMm, className = 'h-12 w-12' }) {
  const stroke = '#0f172a';
  const fill = '#e2e8f0';
  return (
    <svg viewBox="0 0 80 80" className={className}>
      <rect x="2" y="2" width="76" height="76" rx="12" fill="#f8fafc" stroke="#e2e8f0" />
      {shape === 'vbit' ? (
        <polygon points="40,18 62,58 18,58" fill={fill} stroke={stroke} strokeWidth="2" />
      ) : (
        <circle cx="40" cy="40" r="20" fill={fill} stroke={stroke} strokeWidth="2" />
      )}
      <text
        x="40"
        y="70"
        fontSize="10"
        textAnchor="middle"
        fill={stroke}
      >
        {Number.isFinite(diameterMm) ? `${diameterMm}mm` : '--'}
      </text>
    </svg>
  );
}

function parseViewBox(viewBox) {
  if (!viewBox) return null;
  const parts = viewBox.split(' ').map((value) => Number(value));
  if (parts.length !== 4 || parts.some((value) => !Number.isFinite(value))) return null;
  const [minX, minY, width, height] = parts;
  return { minX, minY, width, height };
}

function splitPolylineByDistance(polyline, maxDistance) {
  if (!polyline || polyline.length === 0) return [];
  if (!Number.isFinite(maxDistance) || maxDistance <= 0) return [polyline];
  const segments = [];
  let current = [polyline[0]];
  for (let i = 1; i < polyline.length; i += 1) {
    const prev = polyline[i - 1];
    const point = polyline[i];
    const distance = Math.hypot(point.x - prev.x, point.y - prev.y);
    if (distance > maxDistance) {
      if (current.length > 1) segments.push(current);
      current = [point];
    } else {
      current.push(point);
    }
  }
  if (current.length > 1) segments.push(current);
  return segments;
}

function calculatePolylineLength(polyline) {
  if (!polyline || polyline.length < 2) return 0;
  return polyline.reduce((length, point, index) => {
    if (index === 0) return length;
    const prev = polyline[index - 1];
    return length + Math.hypot(point.x - prev.x, point.y - prev.y);
  }, 0);
}

function calculateAverageTurnAngle(polyline) {
  if (!polyline || polyline.length < 3) return 0;
  let angleSum = 0;
  let count = 0;
  for (let i = 1; i < polyline.length - 1; i += 1) {
    const prev = polyline[i - 1];
    const current = polyline[i];
    const next = polyline[i + 1];
    const v1x = current.x - prev.x;
    const v1y = current.y - prev.y;
    const v2x = next.x - current.x;
    const v2y = next.y - current.y;
    const dot = v1x * v2x + v1y * v2y;
    const mag1 = Math.hypot(v1x, v1y);
    const mag2 = Math.hypot(v2x, v2y);
    if (mag1 === 0 || mag2 === 0) continue;
    const cosAngle = Math.min(1, Math.max(-1, dot / (mag1 * mag2)));
    angleSum += Math.acos(cosAngle);
    count += 1;
  }
  return count ? angleSum / count : 0;
}

function isTravelPolyline(polyline, maxDimension) {
  if (!polyline || polyline.length < 2) return true;
  const length = calculatePolylineLength(polyline);
  if (!Number.isFinite(length) || length === 0) return true;
  const start = polyline[0];
  const end = polyline[polyline.length - 1];
  const direct = Math.hypot(end.x - start.x, end.y - start.y);
  const straightness = direct / length;
  const longStraight = direct > maxDimension * 0.25 && straightness > 0.98;
  const shortHop = polyline.length <= 2 && direct > maxDimension * 0.15;
  return longStraight || shortHop;
}

function createWoodGradient(ctx, width, height, surface) {
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  const tones = {
    oak: ['#f3ddba', '#d3a26e', '#b07b4b'],
    walnut: ['#e1c1a0', '#a46e46', '#6f4528'],
    maple: ['#f7e4c5', '#ddb589', '#c59363'],
    pine: ['#f8e6c3', '#e2b57c', '#c08955'],
    cherry: ['#f2c9a1', '#c47b4b', '#8f4a2b'],
  };
  const [start, mid, end] = tones[surface] || tones.oak;
  gradient.addColorStop(0, start);
  gradient.addColorStop(0.5, mid);
  gradient.addColorStop(1, end);
  return gradient;
}

function drawWoodPattern(ctx, width, height, surface, texture) {
  const gradient = createWoodGradient(ctx, width, height, surface);
  if (texture) {
    const pattern = ctx.createPattern(texture, 'repeat');
    if (pattern) {
      ctx.fillStyle = pattern;
      ctx.fillRect(0, 0, width, height);
    }
    ctx.globalAlpha = 0.2;
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
    ctx.globalAlpha = 1;
  } else {
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
    ctx.globalAlpha = 0.18;
    ctx.strokeStyle = 'rgba(93, 57, 35, 0.4)';
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 16; i += 1) {
      const y = (height / 16) * i + 6;
      ctx.beginPath();
      for (let x = 0; x <= width; x += 40) {
        const offset = Math.sin((x / width) * Math.PI * 2 + i) * 6;
        ctx.lineTo(x, y + offset);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
}

function createPreviewTransform(viewBox, width, height) {
  if (!viewBox) return null;
  const scale = Math.min(width / viewBox.width, height / viewBox.height);
  const offsetX = (width - viewBox.width * scale) / 2 - viewBox.minX * scale;
  const offsetY = (height - viewBox.height * scale) / 2 - viewBox.minY * scale;
  const rectX = viewBox.minX * scale + offsetX;
  const rectY = viewBox.minY * scale + offsetY;
  const rectWidth = viewBox.width * scale;
  const rectHeight = viewBox.height * scale;
  const mapPoint = (point, yAxis = 'down') => {
    const normalizedY =
      yAxis === 'up'
        ? viewBox.minY + viewBox.height - (point.y - viewBox.minY)
        : point.y;
    return {
      x: point.x * scale + offsetX,
      y: normalizedY * scale + offsetY,
    };
  };
  return {
    scale,
    offsetX,
    offsetY,
    rectX,
    rectY,
    rectWidth,
    rectHeight,
    mapPoint,
  };
}

function drawReliefPreview(ctx, width, height, viewBox, polylines, mode, options = {}) {
  if (!viewBox || !polylines?.length) return;
  const transform = createPreviewTransform(viewBox, width, height);
  if (!transform) return;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = mode === 'model' ? '#e2e8f0' : '#f8fafc';
  ctx.fillRect(0, 0, width, height);

  const { rectX, rectY, rectWidth, rectHeight } = transform;
  const yAxis = options?.yAxis || 'down';

  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  const depthSteps = mode === 'model' ? 8 : 4;
  const depthOffset = mode === 'model' ? 1.6 : 1;
  const baseStroke = mode === 'model' ? 6 : 4;
  const shadowColor = mode === 'model' ? 'rgba(15, 23, 42, 0.12)' : 'rgba(30, 41, 59, 0.08)';

  ctx.save();
  ctx.beginPath();
  ctx.rect(rectX, rectY, rectWidth, rectHeight);
  ctx.clip();

  for (let layer = depthSteps; layer > 0; layer -= 1) {
    const shift = layer * depthOffset;
    ctx.strokeStyle = shadowColor;
    ctx.lineWidth = baseStroke + layer * 0.4;
    polylines.forEach((polyline) => {
      if (!polyline.length) return;
      ctx.beginPath();
      polyline.forEach((point, index) => {
        const { x, y } = transform.mapPoint(point, yAxis);
        const shiftedX = x + shift;
        const shiftedY = y + shift;
        if (index === 0) {
          ctx.moveTo(shiftedX, shiftedY);
        } else {
          ctx.lineTo(shiftedX, shiftedY);
        }
      });
      ctx.stroke();
    });
  }

  ctx.shadowColor = mode === 'model' ? 'rgba(15, 23, 42, 0.35)' : 'rgba(30, 41, 59, 0.25)';
  ctx.shadowBlur = mode === 'model' ? 10 : 6;
  ctx.shadowOffsetY = mode === 'model' ? 4 : 3;
  ctx.strokeStyle = mode === 'model' ? '#0f172a' : '#1f2937';
  ctx.lineWidth = mode === 'model' ? 2.4 : 1.8;

  polylines.forEach((polyline) => {
    if (!polyline.length) return;
    ctx.beginPath();
    polyline.forEach((point, index) => {
      const { x, y } = transform.mapPoint(point, yAxis);
      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.stroke();
  });

  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  ctx.strokeStyle = mode === 'model' ? 'rgba(248, 250, 252, 0.7)' : 'rgba(226, 232, 240, 0.7)';
  ctx.lineWidth = mode === 'model' ? 1.2 : 1;
  polylines.forEach((polyline) => {
    if (!polyline.length) return;
    ctx.beginPath();
    polyline.forEach((point, index) => {
      const { x, y } = transform.mapPoint(point, yAxis);
      if (index === 0) {
        ctx.moveTo(x - 1, y - 1);
      } else {
        ctx.lineTo(x - 1, y - 1);
      }
    });
    ctx.stroke();
  });

  ctx.restore();

  ctx.strokeStyle = 'rgba(15, 23, 42, 0.4)';
  ctx.lineWidth = 1.2;
  ctx.strokeRect(rectX, rectY, rectWidth, rectHeight);
}

function drawHeightFieldSurface(ctx, width, height, viewBox, heightField, meta, options) {
  if (!viewBox || !heightField || !meta) return;
  const transform = createPreviewTransform(viewBox, width, height);
  if (!transform) return;
  const { cols, rows } = meta;
  if (!cols || !rows) return;
  ctx.clearRect(0, 0, width, height);

  const { rectX, rectY, rectWidth, rectHeight } = transform;
  const materialWidthMm = Number(options?.materialWidthMm ?? meta.widthMm);
  const materialHeightMm = Number(options?.materialHeightMm ?? meta.heightMm);
  const materialRatio =
    Number.isFinite(meta.aspectRatio) && meta.aspectRatio > 0
      ? meta.aspectRatio
      : Number.isFinite(materialWidthMm) && materialWidthMm > 0
          ? materialWidthMm / (materialHeightMm || 1)
      : null;
  let cellWidth = rectWidth / cols;
  let cellHeight = rectHeight / rows;
  if (materialRatio) {
    cellHeight = rectHeight / rows;
    cellWidth = cellHeight * materialRatio;
    if (cellWidth * cols > rectWidth) {
      cellWidth = rectWidth / cols;
      cellHeight = materialRatio ? cellWidth / materialRatio : cellHeight;
    }
  }
  const gridWidth = cellWidth * cols;
  const gridHeight = cellHeight * rows;
  const gridOffsetX = rectX + (rectWidth - gridWidth) / 2;
  const gridOffsetY = rectY + (rectHeight - gridHeight) / 2;
  const baseTexture = options?.texture;
  if (baseTexture) {
    const pattern = ctx.createPattern(baseTexture, 'repeat');
    if (pattern) {
      ctx.fillStyle = pattern;
      ctx.fillRect(0, 0, width, height);
    }
  } else {
    ctx.fillStyle = createWoodGradient(ctx, width, height, options?.surface || 'oak');
    ctx.fillRect(0, 0, width, height);
  }

  const light = { x: -0.4, y: -0.6, z: 1 };
  const lightLen = Math.hypot(light.x, light.y, light.z);
  const lx = light.x / lightLen;
  const ly = light.y / lightLen;
  const lz = light.z / lightLen;
  const { minHeight, maxHeight } = heightField.reduce(
    (acc, row) => {
      row.forEach((value) => {
        acc.minHeight = Math.min(acc.minHeight, value);
        acc.maxHeight = Math.max(acc.maxHeight, value);
      });
      return acc;
    },
    { minHeight: Number.POSITIVE_INFINITY, maxHeight: Number.NEGATIVE_INFINITY },
  );
  const maxDepth = Math.max(0.1, maxHeight - minHeight);
  const invertYAxis = meta.yAxis === 'up' || options?.invertYAxis;

  for (let y = 1; y < rows - 1; y += 1) {
    const sampleY = invertYAxis ? rows - 1 - y : y;
    const sampleYUp = sampleY - 1;
    const sampleYDown = sampleY + 1;
    for (let x = 1; x < cols - 1; x += 1) {
      const hL = heightField[sampleY][x - 1];
      const hR = heightField[sampleY][x + 1];
      const hU = heightField[sampleYUp][x];
      const hD = heightField[sampleYDown][x];
      const dx = (hL - hR) * 0.5;
      const dy = (hU - hD) * 0.5;
      const dz = 1;
      const len = Math.hypot(dx, dy, dz) || 1;
      const nx = dx / len;
      const ny = dy / len;
      const nz = dz / len;
      const shade = Math.max(0, nx * lx + ny * ly + nz * lz);
      const depth = maxHeight - heightField[sampleY][x];
      const depthShade = Math.min(0.6, (1 - depth / maxDepth) * 0.8);
      const intensity = 0.4 + shade * 0.6 + depthShade;
      ctx.fillStyle = `rgba(40, 28, 18, ${0.35 - intensity * 0.25})`;
      ctx.fillRect(
        gridOffsetX + x * cellWidth,
        gridOffsetY + y * cellHeight,
        cellWidth,
        cellHeight,
      );
    }
  }

  ctx.strokeStyle = 'rgba(15, 23, 42, 0.35)';
  ctx.lineWidth = 1;
  ctx.strokeRect(gridOffsetX, gridOffsetY, gridWidth, gridHeight);
}

function getPreviewCanvasSize(materialWidthMm, materialHeightMm, maxWidth = 640, maxHeight = 360) {
  const widthMm = Number(materialWidthMm);
  const heightMm = Number(materialHeightMm);
  if (!Number.isFinite(widthMm) || !Number.isFinite(heightMm) || widthMm <= 0 || heightMm <= 0) {
    return { width: maxWidth, height: maxHeight };
  }
  const ratio = widthMm / heightMm;
  let width = maxWidth;
  let height = width / ratio;
  if (height > maxHeight) {
    height = maxHeight;
    width = height * ratio;
  }
  return { width: Math.round(width), height: Math.round(height) };
}

function loadWoodTexture(url) {
  return new Promise((resolve, reject) => {
    if (!url) {
      resolve(null);
      return;
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Unable to load texture: ${url}`));
    img.src = url;
  });
}

function headersToObject(headers) {
  if (!headers) return {};
  return Array.from(headers.entries()).reduce((acc, [key, value]) => {
    acc[key] = value;
    return acc;
  }, {});
}

async function readResponseBody(response, contentType) {
  try {
    if (contentType.includes('application/json')) {
      return { body: await response.json(), error: null };
    }
    if (contentType.startsWith('text/')) {
      return { body: await response.text(), error: null };
    }
    const blob = await response.blob();
    return { body: { binary: true, size: blob.size, type: blob.type }, error: null };
  } catch (err) {
    return { body: null, error: err?.message || 'Unable to read response body' };
  }
}

function CncProcessingPage() {
  const { addToast } = useToast();
  const [file, setFile] = useState(null);
  const [processingType, setProcessingType] = useState(processingOptions[0].value);
  const [outputFormat, setOutputFormat] = useState(outputOptions[0].value);
  const [toolId, setToolId] = useState('');
  const [toolDiameterOverrideEnabled, setToolDiameterOverrideEnabled] = useState(false);
  const [toolDiameterOverrideMm, setToolDiameterOverrideMm] = useState('');
  const [operations, setOperations] = useState([]);
  const [status, setStatus] = useState('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [download, setDownload] = useState(null);
  const [preview, setPreview] = useState(null);
  const [animatePreview, setAnimatePreview] = useState(true);
  const [steps, setSteps] = useState([]);
  const [apiLogs, setApiLogs] = useState([]);
  const [sourcePreviewUrl, setSourcePreviewUrl] = useState('');
  const [imageIntrinsicSize, setImageIntrinsicSize] = useState({ width: null, height: null });
  const [autoFitOutput, setAutoFitOutput] = useState(true);
  const [previewModal, setPreviewModal] = useState(null);
  const [resultConversionType, setResultConversionType] = useState(processingOptions[0].value);
  const [woodSurface, setWoodSurface] = useState(woodSurfaceOptions[0].value);
  const [woodTextures, setWoodTextures] = useState({});
  const [woodTextureRevision, setWoodTextureRevision] = useState(0);
  const [materialWidthMm, setMaterialWidthMm] = useState(String(defaultMaterialSize.width));
  const [materialHeightMm, setMaterialHeightMm] = useState(String(defaultMaterialSize.height));
  const [materialThicknessMm, setMaterialThicknessMm] = useState(
    String(defaultMaterialSize.thickness),
  );
  const [outputWidthMm, setOutputWidthMm] = useState(String(defaultMaterialSize.width));
  const [outputHeightMm, setOutputHeightMm] = useState(String(defaultMaterialSize.height));
  const [keepAspectRatio, setKeepAspectRatio] = useState(true);
  const [heightFieldMaxDepthMm, setHeightFieldMaxDepthMm] = useState(
    String(defaultMaterialSize.thickness),
  );
  const [heightFieldResolutionX, setHeightFieldResolutionX] = useState('140');
  const [heightFieldResolutionY, setHeightFieldResolutionY] = useState('140');
  const [heightFieldSmoothingEnabled, setHeightFieldSmoothingEnabled] = useState(true);
  const [heightFieldSmoothingRadius, setHeightFieldSmoothingRadius] = useState('1');
  const [feedRateXY, setFeedRateXY] = useState(String(defaultCamParams.feedRateXY));
  const [feedRateZ, setFeedRateZ] = useState(String(defaultCamParams.feedRateZ));
  const [spindleSpeed, setSpindleSpeed] = useState(String(defaultCamParams.spindleSpeed));
  const [maxStepDownMm, setMaxStepDownMm] = useState(
    String(defaultCamParams.maxStepDownMm),
  );
  const [stepOverPercent, setStepOverPercent] = useState(
    String(defaultCamParams.stepOverPercent),
  );
  const [safeHeightMm, setSafeHeightMm] = useState(String(defaultCamParams.safeHeightMm));
  const stepId = useRef(0);
  const logId = useRef(0);
  const operationId = useRef(0);
  const submitLock = useRef(false);
  const prevMaterialSize = useRef({
    width: defaultMaterialSize.width,
    height: defaultMaterialSize.height,
  });
  const woodCanvasRef = useRef(null);
  const modalWoodCanvasRef = useRef(null);
  const heightmapCanvasRef = useRef(null);
  const modalHeightmapCanvasRef = useRef(null);
  const modelCanvasRef = useRef(null);
  const modalModelCanvasRef = useRef(null);
  const toolpathClipId = useId();
  const toolpathModalClipId = useId();
  const selectedTool = useMemo(
    () => toolLibrary.find((tool) => tool.id === toolId) || null,
    [toolId],
  );
  const effectiveToolDiameter = toolDiameterOverrideEnabled
    ? Number(toolDiameterOverrideMm)
    : selectedTool?.diameterMm;
  const viewBox = useMemo(() => parseViewBox(preview?.viewBox), [preview?.viewBox]);
  const carvedPolylines = useMemo(() => {
    if (!preview?.polylines?.length) return [];
    if (!viewBox) return preview.polylines;
    const maxDimension = Math.max(viewBox.width, viewBox.height);
    const maxDistance = maxDimension * 0.05;
    return preview.polylines
      .flatMap((polyline) => splitPolylineByDistance(polyline, maxDistance))
      .filter((polyline) => !isTravelPolyline(polyline, maxDimension));
  }, [preview, viewBox]);
  const activeConversionType = preview ? resultConversionType : processingType;
  const showWoodPreview = carvedPolylines.length > 0 && activeConversionType === '2d_outline';
  const showHeightmapPreview =
    carvedPolylines.length > 0 && activeConversionType === '2_5d_heightmap';
  const showModelPreview = carvedPolylines.length > 0 && activeConversionType === '3d_model';
  const previewOperations = preview?.operations?.length
    ? preview.operations
    : [
        {
          id: 'single',
          polylines: preview?.polylines || [],
          color: '#0f172a',
          toolDiameterMm: preview?.tool?.diameterMm,
        },
      ];

  const addStep = (label, status, details = '') => {
    stepId.current += 1;
    setSteps((prev) => [
      ...prev,
      {
        id: stepId.current,
        label,
        status,
        details,
        timestamp: formatTimestamp(),
      },
    ]);
  };

  const addApiLog = (entry) => {
    logId.current += 1;
    setApiLogs((prev) => [
      ...prev,
      {
        id: logId.current,
        timestamp: formatTimestamp(),
        ...entry,
      },
    ]);
  };

  const addOperation = () => {
    operationId.current += 1;
    setOperations((prev) => [
      ...prev,
      {
        id: `op-${operationId.current}`,
        toolId: toolId || toolLibrary[0]?.id || '',
        strategy: 'outline',
        geometrySubset: '',
      },
    ]);
  };

  const updateOperation = (id, updates) => {
    setOperations((prev) =>
      prev.map((operation) => (operation.id === id ? { ...operation, ...updates } : operation)),
    );
  };

  const removeOperation = (id) => {
    setOperations((prev) => prev.filter((operation) => operation.id !== id));
  };

  useEffect(() => {
    addStep('Page loaded', 'success');
  }, []);

  useEffect(() => {
    const width = Number(materialWidthMm);
    const height = Number(materialHeightMm);
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      return;
    }
    if (autoFitOutput && keepAspectRatio && imageIntrinsicSize.width && imageIntrinsicSize.height) {
      const scale = Math.min(width / imageIntrinsicSize.width, height / imageIntrinsicSize.height);
      if (Number.isFinite(scale) && scale > 0) {
        setOutputWidthMm(formatDimension(imageIntrinsicSize.width * scale));
        setOutputHeightMm(formatDimension(imageIntrinsicSize.height * scale));
      }
    }
    prevMaterialSize.current = { width, height };
  }, [
    materialWidthMm,
    materialHeightMm,
    autoFitOutput,
    keepAspectRatio,
    imageIntrinsicSize,
  ]);

  useEffect(() => {
    const thickness = Number(materialThicknessMm);
    const currentDepth = Number(heightFieldMaxDepthMm);
    if (!Number.isFinite(thickness) || thickness <= 0) return;
    if (!Number.isFinite(currentDepth) || currentDepth > thickness) {
      setHeightFieldMaxDepthMm(formatDimension(thickness));
    }
  }, [materialThicknessMm, heightFieldMaxDepthMm]);

  useEffect(() => {
    if (!toolDiameterOverrideEnabled) {
      setToolDiameterOverrideMm('');
      return;
    }
    if (!toolDiameterOverrideMm && selectedTool?.diameterMm) {
      setToolDiameterOverrideMm(String(selectedTool.diameterMm));
    }
  }, [toolDiameterOverrideEnabled, selectedTool, toolDiameterOverrideMm]);

  useEffect(() => {
    if (!selectedTool) {
      setFeedRateXY(String(defaultCamParams.feedRateXY));
      setFeedRateZ(String(defaultCamParams.feedRateZ));
      setSpindleSpeed(String(defaultCamParams.spindleSpeed));
      return;
    }
    setFeedRateXY(String(selectedTool.defaultFeedRateXY ?? defaultCamParams.feedRateXY));
    setFeedRateZ(String(selectedTool.defaultFeedRateZ ?? defaultCamParams.feedRateZ));
    setSpindleSpeed(String(selectedTool.defaultSpindleSpeed ?? defaultCamParams.spindleSpeed));
  }, [selectedTool]);

  useEffect(() => {
    let isActive = true;
    const loadTextures = async () => {
      const entries = await Promise.all(
        woodSurfaceOptions.map(async (option) => {
          try {
            const texture = await loadWoodTexture(option.textureUrl);
            return [option.value, texture];
          } catch (err) {
            return [option.value, null];
          }
        }),
      );
      if (!isActive) return;
      const textures = entries.reduce((acc, [value, texture]) => {
        if (texture) acc[value] = texture;
        return acc;
      }, {});
      setWoodTextures(textures);
      setWoodTextureRevision((prev) => prev + 1);
    };
    loadTextures();
    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    if (!file) {
      setSourcePreviewUrl('');
      return undefined;
    }
    if (!file.type.startsWith('image/')) {
      setSourcePreviewUrl('');
      return undefined;
    }
    const url = URL.createObjectURL(file);
    setSourcePreviewUrl(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [file]);

  useEffect(() => {
    if (!file) {
      setImageIntrinsicSize({ width: null, height: null });
      return undefined;
    }
    if (!file.type.startsWith('image/')) {
      setImageIntrinsicSize({ width: null, height: null });
      return undefined;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      setImageIntrinsicSize({
        width: img.naturalWidth || img.width,
        height: img.naturalHeight || img.height,
      });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      setImageIntrinsicSize({ width: null, height: null });
      URL.revokeObjectURL(url);
    };
    img.src = url;
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [file]);

  useEffect(() => {
    if (status !== 'uploading') return undefined;
    setProgress(10);
    const id = setInterval(() => {
      setProgress((prev) => (prev < 90 ? prev + 5 : prev));
    }, 400);
    return () => clearInterval(id);
  }, [status]);

  useEffect(() => {
    if (!showWoodPreview || !carvedPolylines.length) return;
    const canvases = [woodCanvasRef.current, modalWoodCanvasRef.current].filter(Boolean);
    if (canvases.length === 0) return;
    if (!viewBox) return;
    const texture = woodTextures[woodSurface];

    canvases.forEach((canvas) => {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const { width: targetWidth, height: targetHeight } = preview?.heightField
        ? getPreviewCanvasSize(preview.materialWidthMm, preview.materialHeightMm)
        : { width: 640, height: 360 };
      canvas.width = targetWidth;
      canvas.height = targetHeight;

      if (preview?.heightField && preview?.heightFieldMeta) {
        drawHeightFieldSurface(ctx, targetWidth, targetHeight, viewBox, preview.heightField, preview.heightFieldMeta, {
          texture,
          surface: woodSurface,
          materialThicknessMm: preview.materialThicknessMm,
          materialWidthMm: preview.materialWidthMm,
          materialHeightMm: preview.materialHeightMm,
          heightFieldMaxDepthMm: preview?.heightFieldMeta?.maxDepthMm,
        });
        return;
      }

      drawWoodPattern(ctx, targetWidth, targetHeight, woodSurface, texture);

      const transform = createPreviewTransform(viewBox, targetWidth, targetHeight);
      if (!transform) return;
      const { rectX, rectY, rectWidth, rectHeight } = transform;
      const yAxis = preview?.heightFieldMeta?.yAxis || 'down';

      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';

      ctx.save();
      ctx.beginPath();
      ctx.rect(rectX, rectY, rectWidth, rectHeight);
      ctx.clip();

      carvedPolylines.forEach((polyline) => {
        if (!polyline.length) return;
        ctx.beginPath();
        polyline.forEach((point, index) => {
          const { x, y } = transform.mapPoint(point, yAxis);
          if (index === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        });
        ctx.strokeStyle = 'rgba(74, 46, 26, 0.55)';
        ctx.lineWidth = 4;
        ctx.shadowColor = 'rgba(64, 36, 16, 0.4)';
        ctx.shadowBlur = 6;
        ctx.shadowOffsetY = 2;
        ctx.stroke();

        ctx.strokeStyle = 'rgba(255, 244, 230, 0.6)';
        ctx.lineWidth = 2;
        ctx.shadowBlur = 0;
        ctx.shadowOffsetY = -1;
        ctx.stroke();
      });

      ctx.restore();

      ctx.strokeStyle = 'rgba(74, 46, 26, 0.45)';
      ctx.lineWidth = 1.2;
      ctx.strokeRect(rectX, rectY, rectWidth, rectHeight);
    });
  }, [
    carvedPolylines,
    preview,
    showWoodPreview,
    viewBox,
    woodSurface,
    woodTextureRevision,
  ]);

  useEffect(() => {
    if ((!showHeightmapPreview && !showModelPreview) || !carvedPolylines.length) return;
    if (!viewBox) return;
    const mode = showModelPreview ? 'model' : 'heightmap';
    const canvases = [
      showHeightmapPreview ? heightmapCanvasRef.current : null,
      showHeightmapPreview ? modalHeightmapCanvasRef.current : null,
      showModelPreview ? modelCanvasRef.current : null,
      showModelPreview ? modalModelCanvasRef.current : null,
    ].filter(Boolean);
    if (canvases.length === 0) return;

    canvases.forEach((canvas) => {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const { width: targetWidth, height: targetHeight } = preview?.heightField
        ? getPreviewCanvasSize(preview.materialWidthMm, preview.materialHeightMm)
        : { width: 640, height: 360 };
      canvas.width = targetWidth;
      canvas.height = targetHeight;

      if (preview?.heightField && preview?.heightFieldMeta) {
        drawHeightFieldSurface(ctx, targetWidth, targetHeight, viewBox, preview.heightField, preview.heightFieldMeta, {
          surface: woodSurface,
          texture: woodTextures[woodSurface],
          materialThicknessMm: preview.materialThicknessMm,
          materialWidthMm: preview.materialWidthMm,
          materialHeightMm: preview.materialHeightMm,
          heightFieldMaxDepthMm: preview?.heightFieldMeta?.maxDepthMm,
        });
        return;
      }

      drawReliefPreview(ctx, targetWidth, targetHeight, viewBox, carvedPolylines, mode, {
        yAxis: preview?.heightFieldMeta?.yAxis,
      });
    });
  }, [
    carvedPolylines,
    showHeightmapPreview,
    showModelPreview,
    viewBox,
    resultConversionType,
    preview,
    woodSurface,
    woodTextures,
  ]);

  const selectedFileLabel = useMemo(
    () => (file ? `${file.name} (${Math.round(file.size / 1024)} KB)` : 'No file selected'),
    [file],
  );

  const sizeValidationMessage = useMemo(() => {
    const materialWidth = Number(materialWidthMm);
    const materialHeight = Number(materialHeightMm);
    const materialThickness = Number(materialThicknessMm);
    const outputWidth = Number(outputWidthMm);
    const outputHeight = Number(outputHeightMm);
    if (
      !Number.isFinite(materialWidth) ||
      !Number.isFinite(materialHeight) ||
      !Number.isFinite(materialThickness) ||
      !Number.isFinite(outputWidth) ||
      !Number.isFinite(outputHeight)
    ) {
      return 'All material and output dimensions must be numbers.';
    }
    if (
      materialWidth <= 0 ||
      materialHeight <= 0 ||
      materialThickness <= 0 ||
      outputWidth <= 0 ||
      outputHeight <= 0
    ) {
      return 'All material and output dimensions must be greater than 0.';
    }
    if (outputWidth > materialWidth || outputHeight > materialHeight) {
      return 'Output size exceeds material bounds.';
    }
    return '';
  }, [
    materialWidthMm,
    materialHeightMm,
    materialThicknessMm,
    outputWidthMm,
    outputHeightMm,
  ]);

  function handleOutputWidthChange(event) {
    const value = event.target.value;
    setAutoFitOutput(false);
    const nextWidth = Number(value);
    const currentWidth = Number(outputWidthMm);
    const currentHeight = Number(outputHeightMm);
    if (
      keepAspectRatio &&
      Number.isFinite(nextWidth) &&
      nextWidth > 0 &&
      Number.isFinite(currentWidth) &&
      currentWidth > 0 &&
      Number.isFinite(currentHeight) &&
      currentHeight > 0
    ) {
      const ratio = currentHeight / currentWidth;
      const nextHeight = nextWidth * ratio;
      setOutputHeightMm(formatDimension(nextHeight));
    }
    setOutputWidthMm(value);
  }

  function handleOutputHeightChange(event) {
    const value = event.target.value;
    setAutoFitOutput(false);
    const nextHeight = Number(value);
    const currentWidth = Number(outputWidthMm);
    const currentHeight = Number(outputHeightMm);
    if (
      keepAspectRatio &&
      Number.isFinite(nextHeight) &&
      nextHeight > 0 &&
      Number.isFinite(currentWidth) &&
      currentWidth > 0 &&
      Number.isFinite(currentHeight) &&
      currentHeight > 0
    ) {
      const ratio = currentWidth / currentHeight;
      const nextWidth = nextHeight * ratio;
      setOutputWidthMm(formatDimension(nextWidth));
    }
    setOutputHeightMm(value);
  }

  function handleFileChange(event) {
    const selectedFile = event.target.files?.[0] || null;
    setFile(selectedFile);
    setError('');
    setDownload(null);
    setPreview(null);
    setStatus('idle');
    setProgress(0);
    setAutoFitOutput(true);
    setResultConversionType(processingType);
    if (selectedFile) {
      addStep('File selected', 'success', `${selectedFile.name} (${selectedFile.type || 'unknown'})`);
    } else {
      addStep('File cleared', 'success');
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (submitLock.current) return;
    submitLock.current = true;
    setError('');
    setDownload(null);
    setPreview(null);
    addStep('Validation started', 'success');

    if (!file) {
      const message = 'Please select a file to upload.';
      setError(message);
      addToast(message, 'error');
      addStep('Validation failed', 'fail', message);
      submitLock.current = false;
      return;
    }
    if (!isSupportedFile(file)) {
      const message = 'Unsupported file type. Please upload a PNG, JPG, SVG, DXF, or STL file.';
      setError(message);
      addToast(message, 'error');
      addStep('Validation failed', 'fail', message);
      submitLock.current = false;
      return;
    }
    if (sizeValidationMessage) {
      setError(sizeValidationMessage);
      addToast(sizeValidationMessage, 'error');
      addStep('Validation failed', 'fail', sizeValidationMessage);
      submitLock.current = false;
      return;
    }
    addStep('Validation complete', 'success');
    setStatus('uploading');
    setProgress(10);

    const operationsPayload = operations.map((operation) => ({
      id: operation.id,
      toolId: operation.toolId,
      strategy: operation.strategy,
      geometrySubset: operation.geometrySubset
        .split(',')
        .map((value) => Number(value.trim()))
        .filter((value) => Number.isFinite(value) && value > 0)
        .map((value) => value - 1),
    }));

    const formData = new FormData();
    formData.append('file', file);
    formData.append('conversionType', processingType);
    formData.append('outputFormat', outputFormat);
    formData.append('materialWidthMm', materialWidthMm);
    formData.append('materialHeightMm', materialHeightMm);
    formData.append('materialThicknessMm', materialThicknessMm);
    formData.append('outputWidthMm', outputWidthMm);
    formData.append('outputHeightMm', outputHeightMm);
    formData.append('keepAspectRatio', keepAspectRatio);
    if (toolId) {
      formData.append('toolId', toolId);
    }
    if (toolDiameterOverrideEnabled && toolDiameterOverrideMm) {
      formData.append('toolDiameterOverrideMm', toolDiameterOverrideMm);
    }
    if (operationsPayload.length) {
      formData.append('operations', JSON.stringify(operationsPayload));
    }
    formData.append('feedRateXY', feedRateXY);
    formData.append('feedRateZ', feedRateZ);
    formData.append('spindleSpeed', spindleSpeed);
    formData.append('maxStepDownMm', maxStepDownMm);
    formData.append('stepOverPercent', stepOverPercent);
    formData.append('safeHeightMm', safeHeightMm);
    if (imageIntrinsicSize.width && imageIntrinsicSize.height) {
      formData.append('imageWidthPx', imageIntrinsicSize.width);
      formData.append('imageHeightPx', imageIntrinsicSize.height);
    }
    formData.append('heightFieldResolutionX', heightFieldResolutionX);
    formData.append('heightFieldResolutionY', heightFieldResolutionY);
    formData.append('heightFieldMaxDepthMm', heightFieldMaxDepthMm);
    formData.append('heightFieldSmoothingEnabled', heightFieldSmoothingEnabled);
    formData.append('heightFieldSmoothingRadius', heightFieldSmoothingRadius);

    try {
      addStep('Requesting CSRF token', 'success');
      const csrfRequest = {
        url: `${API_BASE}/csrf-token`,
        method: 'GET',
        credentials: 'include',
        headers: {},
      };
      const csrfRes = await fetch(csrfRequest.url, { credentials: 'include' });
      const csrfContentType = csrfRes.headers.get('content-type') || '';
      const csrfBody = await readResponseBody(csrfRes.clone(), csrfContentType);
      addApiLog({
        name: 'CSRF token request',
        request: csrfRequest,
        response: {
          status: csrfRes.status,
          statusText: csrfRes.statusText,
          headers: headersToObject(csrfRes.headers),
          body: csrfBody.body,
          bodyError: csrfBody.error,
        },
      });
      if (!csrfRes.ok) {
        addStep('CSRF token request failed', 'fail', `${csrfRes.status} ${csrfRes.statusText}`);
        throw new Error('Unable to fetch CSRF token. Please refresh and try again.');
      }
      const csrfData = csrfBody.body;
      const csrfToken = csrfData?.csrfToken || csrfData?.csrf_token;
      if (!csrfToken) {
        addStep('CSRF token missing', 'fail', 'No token returned in response.');
        throw new Error('Missing CSRF token. Please refresh and try again.');
      }
      addStep('CSRF token received', 'success');
      addStep('Uploading file for CNC processing', 'success');
      const conversionRequest = {
        url: `${API_BASE}/cnc_processing`,
        method: 'POST',
        credentials: 'include',
        headers: {
          'X-CSRF-Token': csrfToken,
        },
        body: {
          file: {
            name: file.name,
            size: file.size,
            type: file.type || 'unknown',
          },
          conversionType: processingType,
          outputFormat,
          materialWidthMm,
          materialHeightMm,
          materialThicknessMm,
          outputWidthMm,
          outputHeightMm,
          keepAspectRatio,
          toolId,
          toolDiameterOverrideMm: toolDiameterOverrideEnabled ? toolDiameterOverrideMm : undefined,
          operations: operationsPayload.length ? operationsPayload : undefined,
          feedRateXY,
          feedRateZ,
          spindleSpeed,
          maxStepDownMm,
          stepOverPercent,
          safeHeightMm,
          imageWidthPx: imageIntrinsicSize.width,
          imageHeightPx: imageIntrinsicSize.height,
          heightFieldResolutionX,
          heightFieldResolutionY,
          heightFieldMaxDepthMm,
          heightFieldSmoothingEnabled,
          heightFieldSmoothingRadius,
        },
      };
      const res = await fetch(conversionRequest.url, {
        method: 'POST',
        body: formData,
        credentials: 'include',
        headers: {
          'X-CSRF-Token': csrfToken,
        },
      });
      const contentType = res.headers.get('content-type') || '';
      const responseBody = await readResponseBody(res.clone(), contentType);
      addApiLog({
        name: 'CNC processing request',
        request: conversionRequest,
        response: {
          status: res.status,
          statusText: res.statusText,
          headers: headersToObject(res.headers),
          body: responseBody.body,
          bodyError: responseBody.error,
        },
      });

      if (!res.ok) {
        let message = res.statusText || 'Conversion failed';
        if (responseBody?.body && typeof responseBody.body === 'object') {
          if (responseBody.body?.message) message = responseBody.body.message;
        }
        if (res.status === 404) {
          message =
            'CNC processing endpoint not found (404). Verify API base URL and backend routes.';
        } else if (contentType.includes('text/html')) {
          message = 'CNC processing failed on server. Check backend logs.';
        }
        if (res.status === 415) {
          message = 'Unsupported file type. Please upload a PNG, JPG, SVG, DXF, or STL file.';
        }
        addStep('CNC processing failed', 'fail', message);
        throw new Error(message);
      }

      if (contentType.includes('application/json')) {
        const data = responseBody.body;
        const info = extractDownloadInfo(data);
        if (info?.url) {
          setDownload(info);
        } else {
          setDownload({ url: '', filename: info?.filename || 'cnc-output' });
        }
        setPreview(data?.preview || null);
        setResultConversionType(data?.conversionType || processingType);
      } else {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        setDownload({ url, filename: `cnc-output.${outputFormat}` });
        setPreview(null);
        setResultConversionType(processingType);
      }

      addStep('CNC processing completed', 'success');
      setStatus('success');
      setProgress(100);
      addToast('Conversion complete! Ready to download.', 'success');
    } catch (err) {
      const message = err?.message || 'Conversion failed';
      setError(message);
      setStatus('error');
      setProgress(0);
      addStep('Conversion failed', 'fail', message);
      addToast(message, 'error');
    } finally {
      submitLock.current = false;
    }
  }

  const isBusy = status === 'uploading';
  const hasPreview = preview?.polylines?.length > 0;
  const hasSourcePreview = Boolean(sourcePreviewUrl);
  const maxDepthLimit = useMemo(() => {
    const thickness = Number(materialThicknessMm);
    if (!Number.isFinite(thickness) || thickness <= 0) return 1;
    return thickness;
  }, [materialThicknessMm]);
  const materialSummary = preview?.materialWidthMm
    ? `${formatDimension(preview.materialWidthMm)} × ${formatDimension(preview.materialHeightMm)} × ${formatDimension(preview.materialThicknessMm)} mm`
    : '';
  const toolSummary = selectedTool
    ? `${getToolShapeLabel(selectedTool.shape)} · ${formatDimension(
        effectiveToolDiameter || selectedTool.diameterMm,
      )} mm`
    : 'Legacy toolpath';
  const disabledReason = useMemo(() => {
    if (isBusy) {
      return 'Conversion in progress. Please wait for it to finish.';
    }
    if (!file) {
      return 'Select a PNG, JPG, SVG, or DXF file to enable conversion.';
    }
    if (!isSupportedFile(file)) {
      return 'Unsupported file type. Please upload a PNG, JPG, SVG, DXF, or STL file.';
    }
    return '';
  }, [file, isBusy]);
  const canSubmit = !disabledReason;
  const activeConversionLabel =
    processingOptions.find((option) => option.value === activeConversionType)?.label ||
    'Processing';

  return (
    <div className="mx-auto max-w-6xl p-6">
      <style>{`
        @keyframes cnc-draw {
          from { stroke-dashoffset: 1; }
          to { stroke-dashoffset: 0; }
        }
      `}</style>
      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-slate-900">
            CNC Converter
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Upload a PNG, JPG, SVG, or DXF file and generate CNC-ready output.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700" htmlFor="cnc-file">
              Source file
            </label>
            <div className="flex flex-col gap-2 rounded-md border border-dashed border-slate-300 p-4">
              <input
                id="cnc-file"
                type="file"
                accept="image/*,.svg,.dxf,.stl"
                onChange={handleFileChange}
                className="text-sm text-slate-700 file:mr-4 file:rounded-md file:border-0 file:bg-slate-900 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-slate-700"
              />
              <span className="text-xs text-slate-500">{selectedFileLabel}</span>
            </div>
            {hasSourcePreview && (
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-medium text-slate-600">Initial image preview</p>
                <p className="mt-1 text-[11px] text-slate-500">
                  Tap to open the full-size source image.
                </p>
                <button
                  type="button"
                  onClick={() => setPreviewModal('source')}
                  className="mt-3 w-full overflow-hidden rounded-md border border-slate-200 bg-white transition hover:border-slate-300"
                  aria-label="Open initial image preview"
                >
                  <img
                    src={sourcePreviewUrl}
                    alt="Initial uploaded file preview"
                    className="h-52 w-full object-contain"
                  />
                </button>
              </div>
            )}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700" htmlFor="processing-type">
                Processing type
              </label>
              <select
                id="processing-type"
                value={processingType}
                onChange={(event) => setProcessingType(event.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
              >
                {processingOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700" htmlFor="output-format">
                Output format
              </label>
              <select
                id="output-format"
                value={outputFormat}
                onChange={(event) => setOutputFormat(event.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
              >
                {outputOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
          </div>
        </div>

          <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium text-slate-800">Tool selection</p>
                <p className="text-xs text-slate-500">
                  Choose a cutter to control toolpath width, offsets, and carving behavior.
                </p>
              </div>
              <span className="text-[11px] text-slate-500">
                {selectedTool ? selectedTool.shape.toUpperCase() : 'LEGACY'}
              </span>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-4">
              <label className="text-xs text-slate-600">
                Tool
                <select
                  value={toolId}
                  onChange={(event) => setToolId(event.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
                >
                  <option value="">Legacy (no tool offset)</option>
                  {toolLibrary.map((tool) => (
                    <option key={tool.id} value={tool.id}>
                      {tool.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="space-y-2 text-xs text-slate-600">
                <span className="font-medium text-slate-700">Cutter profile</span>
                <div className="flex items-center gap-3 rounded-md border border-slate-200 bg-white px-3 py-2">
                  <ToolShapePreview
                    shape={selectedTool?.shape}
                    diameterMm={effectiveToolDiameter || selectedTool?.diameterMm}
                  />
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-slate-700">
                      {getToolShapeLabel(selectedTool?.shape)}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      Flute: {selectedTool?.fluteLengthMm ? `${selectedTool.fluteLengthMm}mm` : '—'}
                    </p>
                  </div>
                </div>
              </div>
              <label className="text-xs text-slate-600">
                Diameter (mm)
                <input
                  type="number"
                  min="0.1"
                  step="0.1"
                  value={
                    toolDiameterOverrideEnabled
                      ? toolDiameterOverrideMm
                      : effectiveToolDiameter || ''
                  }
                  readOnly={!toolDiameterOverrideEnabled}
                  onChange={(event) => setToolDiameterOverrideMm(event.target.value)}
                  className={`mt-1 w-full rounded-md border px-3 py-2 text-sm ${
                    toolDiameterOverrideEnabled
                      ? 'border-slate-300 text-slate-700'
                      : 'border-slate-200 bg-slate-100 text-slate-500'
                  }`}
                />
              </label>
              <div className="space-y-2 text-xs text-slate-600">
                <span className="font-medium text-slate-700">Advanced override</span>
                <label className="flex items-center gap-2 text-xs text-slate-600">
                  <input
                    type="checkbox"
                    checked={toolDiameterOverrideEnabled}
                    onChange={(event) => setToolDiameterOverrideEnabled(event.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-400"
                  />
                  Override diameter
                </label>
                <p className="text-[11px] text-slate-500">
                  Use a custom diameter if your cutter differs from the preset.
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium text-slate-800">Material &amp; Output Size</p>
                <p className="text-xs text-slate-500">
                  Provide real-world dimensions (mm) to match CNC scale.
                </p>
              </div>
              <label className="flex items-center gap-2 text-xs text-slate-600">
                <input
                  type="checkbox"
                  checked={keepAspectRatio}
                  onChange={(event) => {
                    setKeepAspectRatio(event.target.checked);
                    if (event.target.checked) {
                      setAutoFitOutput(true);
                    }
                  }}
                  className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-400"
                />
                Keep aspect ratio
              </label>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase text-slate-500">Material (mm)</p>
                <div className="grid gap-3">
                  <label className="text-xs text-slate-600">
                    Width
                    <input
                      type="number"
                      min="0.1"
                      step="0.1"
                      value={materialWidthMm}
                      onChange={(event) => setMaterialWidthMm(event.target.value)}
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700"
                    />
                  </label>
                  <label className="text-xs text-slate-600">
                    Height
                    <input
                      type="number"
                      min="0.1"
                      step="0.1"
                      value={materialHeightMm}
                      onChange={(event) => setMaterialHeightMm(event.target.value)}
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700"
                    />
                  </label>
                  <label className="text-xs text-slate-600">
                    Thickness
                    <input
                      type="number"
                      min="0.1"
                      step="0.1"
                      value={materialThicknessMm}
                      onChange={(event) => setMaterialThicknessMm(event.target.value)}
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700"
                    />
                  </label>
                </div>
              </div>
              <div className="space-y-2 md:col-span-2">
                <p className="text-xs font-semibold uppercase text-slate-500">Output size (mm)</p>
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="text-xs text-slate-600">
                    Width
                    <input
                      type="number"
                      min="0.1"
                      step="0.1"
                      value={outputWidthMm}
                      onChange={handleOutputWidthChange}
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700"
                    />
                  </label>
                  <label className="text-xs text-slate-600">
                    Height
                    <input
                      type="number"
                      min="0.1"
                      step="0.1"
                      value={outputHeightMm}
                      onChange={handleOutputHeightChange}
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700"
                    />
                  </label>
                </div>
                <p className="text-[11px] text-slate-500">
                  Output dimensions must fit within the selected material.
                </p>
              </div>
            </div>
            {sizeValidationMessage && (
              <p className="mt-3 text-xs text-rose-600">{sizeValidationMessage}</p>
            )}
          </div>

          <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium text-slate-800">CAM parameters</p>
                <p className="text-xs text-slate-500">
                  Control feed rates and step-down to prevent tool overload.
                </p>
              </div>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <label className="text-xs text-slate-600">
                Feed rate XY (mm/min)
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={feedRateXY}
                  onChange={(event) => setFeedRateXY(event.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700"
                />
              </label>
              <label className="text-xs text-slate-600">
                Feed rate Z (mm/min)
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={feedRateZ}
                  onChange={(event) => setFeedRateZ(event.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700"
                />
              </label>
              <label className="text-xs text-slate-600">
                Spindle speed (RPM)
                <input
                  type="number"
                  min="1000"
                  step="100"
                  value={spindleSpeed}
                  onChange={(event) => setSpindleSpeed(event.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700"
                />
              </label>
              <label className="text-xs text-slate-600">
                Safe height (mm)
                <input
                  type="number"
                  min="0.1"
                  step="0.1"
                  value={safeHeightMm}
                  onChange={(event) => setSafeHeightMm(event.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700"
                />
              </label>
              <label className="text-xs text-slate-600">
                Max step-down (mm)
                <input
                  type="number"
                  min="0.1"
                  step="0.1"
                  value={maxStepDownMm}
                  onChange={(event) => setMaxStepDownMm(event.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700"
                />
              </label>
              <label className="text-xs text-slate-600">
                Stepover (%)
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={stepOverPercent}
                  onChange={(event) => setStepOverPercent(event.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700"
                />
              </label>
            </div>
          </div>

          <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium text-slate-800">Height-field depth control</p>
                <p className="text-xs text-slate-500">
                  Adjust how deep the darkest areas should carve relative to material thickness.
                </p>
              </div>
              <label className="flex items-center gap-2 text-xs text-slate-600">
                <input
                  type="checkbox"
                  checked={heightFieldSmoothingEnabled}
                  onChange={(event) => setHeightFieldSmoothingEnabled(event.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-400"
                />
                Smooth height-field
              </label>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <label className="text-xs text-slate-600 md:col-span-2">
                Max carving depth (mm)
                <input
                  type="range"
                  min="0.1"
                  max={maxDepthLimit}
                  step="0.1"
                  value={heightFieldMaxDepthMm}
                  onChange={(event) => setHeightFieldMaxDepthMm(event.target.value)}
                  className="mt-2 w-full accent-slate-900"
                />
              </label>
              <label className="text-xs text-slate-600">
                Depth value
                <input
                  type="number"
                  min="0.1"
                  step="0.1"
                  max={maxDepthLimit}
                  value={heightFieldMaxDepthMm}
                  onChange={(event) => setHeightFieldMaxDepthMm(event.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700"
                />
              </label>
              <label className="text-xs text-slate-600">
                Preview resolution X (cols)
                <input
                  type="number"
                  min="20"
                  step="1"
                  value={heightFieldResolutionX}
                  onChange={(event) => setHeightFieldResolutionX(event.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700"
                />
              </label>
              <label className="text-xs text-slate-600">
                Preview resolution Y (rows)
                <input
                  type="number"
                  min="20"
                  step="1"
                  value={heightFieldResolutionY}
                  onChange={(event) => setHeightFieldResolutionY(event.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700"
                />
              </label>
              <label className="text-xs text-slate-600">
                Smoothing radius (px)
                <input
                  type="number"
                  min="1"
                  max="6"
                  step="1"
                  value={heightFieldSmoothingRadius}
                  disabled={!heightFieldSmoothingEnabled}
                  onChange={(event) => setHeightFieldSmoothingRadius(event.target.value)}
                  className={`mt-1 w-full rounded-md border px-3 py-2 text-sm ${
                    heightFieldSmoothingEnabled
                      ? 'border-slate-300 text-slate-700'
                      : 'border-slate-200 bg-slate-100 text-slate-500'
                  }`}
                />
              </label>
              <div className="md:col-span-3">
                <p className="text-[11px] text-slate-500">
                  Depth is clamped to material thickness. Smoothing reduces spike artifacts in the
                  simulated relief.
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium text-slate-800">Multi-tool operations</p>
                <p className="text-xs text-slate-500">
                  Assign tools to geometry groups. Use comma-separated polyline indices from the
                  preview (1-based).
                </p>
              </div>
              <button
                type="button"
                onClick={addOperation}
                className="rounded-md border border-slate-300 bg-white px-3 py-1 text-xs text-slate-700 hover:border-slate-400"
              >
                Add operation
              </button>
            </div>
            {operations.length === 0 ? (
              <p className="mt-3 text-xs text-slate-500">
                No operations defined. The selected tool will be used for the entire job.
              </p>
            ) : (
              <div className="mt-4 space-y-3">
                {operations.map((operation) => (
                  <div
                    key={operation.id}
                    className="rounded-md border border-slate-200 bg-white p-3"
                  >
                    <div className="grid gap-3 md:grid-cols-4">
                      <label className="text-xs text-slate-600">
                        Tool
                        <select
                          value={operation.toolId}
                          onChange={(event) =>
                            updateOperation(operation.id, { toolId: event.target.value })
                          }
                          className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-2 text-sm text-slate-700"
                        >
                          {toolLibrary.map((tool) => (
                            <option key={tool.id} value={tool.id}>
                              {tool.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="text-xs text-slate-600">
                        Strategy
                        <input
                          type="text"
                          value={operation.strategy}
                          onChange={(event) =>
                            updateOperation(operation.id, { strategy: event.target.value })
                          }
                          className="mt-1 w-full rounded-md border border-slate-300 px-2 py-2 text-sm text-slate-700"
                        />
                      </label>
                      <label className="text-xs text-slate-600 md:col-span-2">
                        Geometry subset (indices)
                        <input
                          type="text"
                          placeholder="e.g. 1, 2, 5"
                          value={operation.geometrySubset}
                          onChange={(event) =>
                            updateOperation(operation.id, { geometrySubset: event.target.value })
                          }
                          className="mt-1 w-full rounded-md border border-slate-300 px-2 py-2 text-sm text-slate-700"
                        />
                      </label>
                    </div>
                    <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                      <span>ID: {operation.id}</span>
                      <button
                        type="button"
                        onClick={() => removeOperation(operation.id)}
                        className="text-rose-600 hover:text-rose-700"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {isBusy && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>Processing...</span>
                <span>{progress}%</span>
              </div>
              <div className="h-2 w-full rounded-full bg-slate-200">
                <div
                  className="h-2 rounded-full bg-slate-900 transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

      {status === 'success' && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          <p className="font-medium">Conversion complete.</p>
          {download?.url ? (
                <a
                  href={download.url}
                  download={download.filename}
                  className="mt-2 inline-flex items-center text-emerald-700 underline underline-offset-2 hover:text-emerald-900"
                >
                  Download {download.filename}
                </a>
              ) : (
                <p className="mt-2">Your file is ready. Check with the backend for the download link.</p>
              )}
        </div>
      )}

      {hasPreview && (
        <div className="rounded-md border border-slate-200 bg-white p-4 text-sm text-slate-700">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-slate-900">Output previews</p>
              <p className="text-xs text-slate-500">
                Showing results for {activeConversionLabel}. Tap any preview to open a larger view.
              </p>
            </div>
            {activeConversionType === '2d_outline' && (
              <label className="flex items-center gap-2 text-xs text-slate-500">
                <input
                  type="checkbox"
                  checked={animatePreview}
                  onChange={(event) => setAnimatePreview(event.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-400"
                />
                Animate toolpath
              </label>
            )}
          </div>
          {(materialSummary || toolSummary) && (
            <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
              <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                <ToolShapePreview
                  shape={selectedTool?.shape}
                  diameterMm={effectiveToolDiameter || selectedTool?.diameterMm}
                  className="h-10 w-10"
                />
                <div>
                  <p className="text-xs font-semibold text-slate-700">Cutter</p>
                  <p className="text-[11px] text-slate-500">{toolSummary}</p>
                </div>
              </div>
              {materialSummary && (
                <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                  <p className="text-xs font-semibold text-slate-700">Material</p>
                  <p className="text-[11px] text-slate-500">{materialSummary}</p>
                </div>
              )}
              {preview?.outputWidthMm && preview?.outputHeightMm && (
                <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                  <p className="text-xs font-semibold text-slate-700">Output</p>
                  <p className="text-[11px] text-slate-500">
                    {formatDimension(preview.outputWidthMm)} ×{' '}
                    {formatDimension(preview.outputHeightMm)} mm
                  </p>
                </div>
              )}
            </div>
          )}
          {previewOperations.length > 1 && (
            <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
              {previewOperations.map((operation) => (
                <div key={operation.id} className="flex items-center gap-2">
                  <span
                    className="inline-flex h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: operation.color || '#0f172a' }}
                  />
                  <span>{operation.toolName || 'Tool'} ({operation.strategy || 'outline'})</span>
                </div>
              ))}
            </div>
          )}
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {activeConversionType === '2d_outline' && (
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-medium text-slate-600">Toolpath preview</p>
                <p className="mt-1 text-[11px] text-slate-500">
                  Tap to open a larger toolpath view.
                </p>
                <button
                  type="button"
                  onClick={() => setPreviewModal('toolpath')}
                  className="mt-3 w-full overflow-hidden rounded-md border border-slate-200 bg-white transition hover:border-slate-300"
                  aria-label="Open toolpath preview"
                >
                  <div className="aspect-[16/9] w-full">
                    <svg
                      viewBox={preview.viewBox}
                      className="h-full w-full"
                      preserveAspectRatio="xMidYMid meet"
                    >
                      {viewBox && (
                        <defs>
                          <clipPath id={toolpathClipId}>
                            <rect
                              x={viewBox.minX}
                              y={viewBox.minY}
                              width={viewBox.width}
                              height={viewBox.height}
                            />
                          </clipPath>
                        </defs>
                      )}
                      {viewBox && (
                        <rect
                          x={viewBox.minX}
                          y={viewBox.minY}
                          width={viewBox.width}
                          height={viewBox.height}
                          fill="none"
                          stroke="rgba(15, 23, 42, 0.4)"
                          strokeWidth="0.8"
                        />
                      )}
                      <g clipPath={viewBox ? `url(#${toolpathClipId})` : undefined}>
                        {previewOperations.map((operation) =>
                          operation.polylines.map((polyline, index) => (
                            <polyline
                              key={`${operation.id}-${index + 1}`}
                              points={polyline.map((point) => `${point.x},${point.y}`).join(' ')}
                              fill="none"
                              stroke={operation.color || '#0f172a'}
                              strokeWidth={getToolStrokeWidth(operation.toolDiameterMm)}
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              pathLength="1"
                              style={
                                animatePreview
                                  ? {
                                      strokeDasharray: 1,
                                      strokeDashoffset: 1,
                                      animation: 'cnc-draw 3s ease forwards',
                                    }
                                  : undefined
                              }
                            />
                          )),
                        )}
                      </g>
                    </svg>
                  </div>
                </button>
              </div>
            )}
            {showWoodPreview && (
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-medium text-slate-600">
                      Imitated wood carving result (based on the processed file)
                    </p>
                    <p className="mt-1 text-[11px] text-slate-500">
                      Carved impression preview over a wood surface.
                    </p>
                  </div>
                  <label className="flex items-center gap-2 text-[11px] text-slate-500">
                    <span>Surface</span>
                    <select
                      value={woodSurface}
                      onChange={(event) => setWoodSurface(event.target.value)}
                      className="rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] text-slate-700"
                    >
                      {woodSurfaceOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <button
                  type="button"
                  onClick={() => setPreviewModal('carving')}
                  className="mt-3 w-full overflow-hidden rounded-md border border-slate-200 bg-white transition hover:border-slate-300"
                  aria-label="Open carved wood preview"
                >
                  <div className="aspect-[16/9] w-full">
                    <canvas
                      ref={woodCanvasRef}
                      className="h-full w-full"
                      role="img"
                      aria-label="Simulated wood carving preview"
                    />
                  </div>
                </button>
              </div>
            )}
            {showHeightmapPreview && (
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-medium text-slate-600">2.5D heightmap preview</p>
                <p className="mt-1 text-[11px] text-slate-500">
                  Height impressions derived from the processed outlines.
                </p>
                <button
                  type="button"
                  onClick={() => setPreviewModal('heightmap')}
                  className="mt-3 w-full overflow-hidden rounded-md border border-slate-200 bg-white transition hover:border-slate-300"
                  aria-label="Open heightmap preview"
                >
                  <div className="aspect-[16/9] w-full">
                    <canvas
                      ref={heightmapCanvasRef}
                      className="h-full w-full"
                      role="img"
                      aria-label="2.5D heightmap preview"
                    />
                  </div>
                </button>
              </div>
            )}
            {showModelPreview && (
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-medium text-slate-600">3D model preview</p>
                <p className="mt-1 text-[11px] text-slate-500">
                  Relief shading to visualize raised/lowered surfaces.
                </p>
                <button
                  type="button"
                  onClick={() => setPreviewModal('model')}
                  className="mt-3 w-full overflow-hidden rounded-md border border-slate-200 bg-white transition hover:border-slate-300"
                  aria-label="Open 3D model preview"
                >
                  <div className="aspect-[16/9] w-full">
                    <canvas
                      ref={modelCanvasRef}
                      className="h-full w-full"
                      role="img"
                      aria-label="3D model preview"
                    />
                  </div>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

          {error && (
            <div className="rounded-md border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
              {error}
            </div>
          )}

          <div className="flex items-center justify-between gap-4">
            <button
              type="submit"
              onClick={handleSubmit}
              disabled={!canSubmit}
              title={disabledReason}
              className="inline-flex items-center justify-center rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              {isBusy ? 'Processing…' : 'Start conversion'}
            </button>
            <p className="text-xs text-slate-500">
              Supported formats: PNG, JPG, SVG, DXF, and STL files.
            </p>
          </div>
        </form>
      </div>
      <div className="mt-6 space-y-6">
        <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Process steps</h2>
          <p className="mt-1 text-sm text-slate-500">
            Every step is logged from page load through success or failure.
          </p>
          <div className="mt-4 space-y-3">
            {steps.length === 0 ? (
              <p className="text-sm text-slate-500">No steps recorded yet.</p>
            ) : (
              steps.map((step) => (
                <div
                  key={step.id}
                  className="rounded-md border border-slate-200 p-3 text-sm text-slate-700"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">{step.label}</span>
                    <span
                      className={
                        step.status === 'success'
                          ? 'text-emerald-600'
                          : step.status === 'fail'
                            ? 'text-rose-600'
                            : 'text-slate-500'
                      }
                    >
                      {step.status.toUpperCase()}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-slate-500">{step.timestamp}</div>
                  {step.details && (
                    <div className="mt-2 text-xs text-slate-600">{step.details}</div>
                  )}
                </div>
              ))
            )}
          </div>
        </section>
        <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">API requests &amp; responses</h2>
          <p className="mt-1 text-sm text-slate-500">
            Full request/response details are shown for every API call.
          </p>
          <div className="mt-4 space-y-4">
            {apiLogs.length === 0 ? (
              <p className="text-sm text-slate-500">No API calls yet.</p>
            ) : (
              apiLogs.map((log) => (
                <div key={log.id} className="rounded-md border border-slate-200 p-4 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium text-slate-800">{log.name}</span>
                    <span className="text-xs text-slate-500">{log.timestamp}</span>
                  </div>
                  <div className="mt-3 grid gap-4 md:grid-cols-2">
                    <div>
                      <h3 className="text-xs font-semibold uppercase text-slate-500">Request</h3>
                      <pre className="mt-2 max-h-64 overflow-auto rounded-md bg-slate-900 p-3 text-xs text-slate-100">
                        {JSON.stringify(log.request, null, 2)}
                      </pre>
                    </div>
                    <div>
                      <h3 className="text-xs font-semibold uppercase text-slate-500">Response</h3>
                      <pre className="mt-2 max-h-64 overflow-auto rounded-md bg-slate-900 p-3 text-xs text-slate-100">
                        {JSON.stringify(log.response, null, 2)}
                      </pre>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
      {previewModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-4xl rounded-lg bg-white p-4 shadow-xl">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-800">
                {previewModal === 'toolpath' && 'Toolpath preview'}
                {previewModal === 'carving' && 'Imitated wood carving result'}
                {previewModal === 'heightmap' && '2.5D heightmap preview'}
                {previewModal === 'model' && '3D model preview'}
                {previewModal === 'source' && 'Initial image preview'}
              </p>
              <button
                type="button"
                onClick={() => setPreviewModal(null)}
                className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:border-slate-300 hover:text-slate-800"
              >
                Close
              </button>
            </div>
            <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-4">
              {previewModal === 'toolpath' && (
                <svg
                  viewBox={preview?.viewBox}
                  className="h-[60vh] w-full"
                  preserveAspectRatio="xMidYMid meet"
                >
                  {viewBox && (
                    <defs>
                      <clipPath id={toolpathModalClipId}>
                        <rect
                          x={viewBox.minX}
                          y={viewBox.minY}
                          width={viewBox.width}
                          height={viewBox.height}
                        />
                      </clipPath>
                    </defs>
                  )}
                  {viewBox && (
                    <rect
                      x={viewBox.minX}
                      y={viewBox.minY}
                      width={viewBox.width}
                      height={viewBox.height}
                      fill="none"
                      stroke="rgba(15, 23, 42, 0.4)"
                      strokeWidth="1"
                    />
                  )}
                  <g clipPath={viewBox ? `url(#${toolpathModalClipId})` : undefined}>
                    {previewOperations.map((operation) =>
                      operation.polylines.map((polyline, index) => (
                        <polyline
                          key={`${operation.id}-${index + 1}`}
                          points={polyline.map((point) => `${point.x},${point.y}`).join(' ')}
                          fill="none"
                          stroke={operation.color || '#0f172a'}
                          strokeWidth={getToolStrokeWidth(operation.toolDiameterMm)}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      )),
                    )}
                  </g>
                </svg>
              )}
              {previewModal === 'carving' && (
                <div className="flex h-[60vh] items-center justify-center">
                  <canvas
                    ref={modalWoodCanvasRef}
                    className="h-full w-full max-h-[60vh]"
                    role="img"
                    aria-label="Simulated wood carving preview"
                  />
                </div>
              )}
              {previewModal === 'heightmap' && (
                <div className="flex h-[60vh] items-center justify-center">
                  <canvas
                    ref={modalHeightmapCanvasRef}
                    className="h-full w-full max-h-[60vh]"
                    role="img"
                    aria-label="2.5D heightmap preview"
                  />
                </div>
              )}
              {previewModal === 'model' && (
                <div className="flex h-[60vh] items-center justify-center">
                  <canvas
                    ref={modalModelCanvasRef}
                    className="h-full w-full max-h-[60vh]"
                    role="img"
                    aria-label="3D model preview"
                  />
                </div>
              )}
              {previewModal === 'source' && (
                <div className="flex h-[60vh] items-center justify-center">
                  <img
                    src={sourcePreviewUrl}
                    alt="Initial uploaded file preview"
                    className="h-full max-h-[60vh] w-full object-contain"
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default CncProcessingPage;
export { CncProcessingPage };
