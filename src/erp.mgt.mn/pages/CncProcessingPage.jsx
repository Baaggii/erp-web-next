import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useToast } from '../context/ToastContext.jsx';
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

const supportedExtensions = ['.png', '.jpg', '.jpeg', '.svg', '.dxf'];
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

function drawReliefPreview(ctx, width, height, viewBox, polylines, mode) {
  if (!viewBox || !polylines?.length) return;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = mode === 'model' ? '#e2e8f0' : '#f8fafc';
  ctx.fillRect(0, 0, width, height);

  const scale = Math.min(width / viewBox.width, height / viewBox.height);
  const offsetX = (width - viewBox.width * scale) / 2 - viewBox.minX * scale;
  const offsetY = (height - viewBox.height * scale) / 2 - viewBox.minY * scale;

  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  const depthSteps = mode === 'model' ? 8 : 4;
  const depthOffset = mode === 'model' ? 1.6 : 1;
  const baseStroke = mode === 'model' ? 6 : 4;
  const shadowColor = mode === 'model' ? 'rgba(15, 23, 42, 0.12)' : 'rgba(30, 41, 59, 0.08)';

  for (let layer = depthSteps; layer > 0; layer -= 1) {
    const shift = layer * depthOffset;
    ctx.strokeStyle = shadowColor;
    ctx.lineWidth = baseStroke + layer * 0.4;
    polylines.forEach((polyline) => {
      if (!polyline.length) return;
      ctx.beginPath();
      polyline.forEach((point, index) => {
        const x = point.x * scale + offsetX + shift;
        const y = point.y * scale + offsetY + shift;
        if (index === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
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
      const x = point.x * scale + offsetX;
      const y = point.y * scale + offsetY;
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
      const x = point.x * scale + offsetX - 1;
      const y = point.y * scale + offsetY - 1;
      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.stroke();
  });
}

function loadSourceImage(url) {
  return new Promise((resolve, reject) => {
    if (!url) {
      resolve(null);
      return;
    }
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Unable to load source image'));
    img.src = url;
  });
}

function buildHeightmap(image, width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(image, 0, 0, width, height);
  const imageData = ctx.getImageData(0, 0, width, height);
  const { data } = imageData;
  const heights = new Float32Array(width * height);
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    heights[i / 4] = Math.pow(lum, 1.1);
  }
  return { heights, width, height };
}

function drawHeightmapPreview(ctx, width, height, image) {
  const map = buildHeightmap(image, width, height);
  if (!map) return;
  const imageData = ctx.createImageData(width, height);
  const { data } = imageData;
  map.heights.forEach((value, index) => {
    const shade = Math.round(value * 255);
    const offset = index * 4;
    data[offset] = shade;
    data[offset + 1] = shade;
    data[offset + 2] = shade;
    data[offset + 3] = 255;
  });
  ctx.putImageData(imageData, 0, 0);
}

function drawModelPreview(ctx, width, height, image) {
  const map = buildHeightmap(image, width, height);
  if (!map) return;
  const imageData = ctx.createImageData(width, height);
  const { data } = imageData;
  const { heights } = map;
  const light = { x: 0.6, y: 0.6, z: 0.5 };
  const lightLength = Math.hypot(light.x, light.y, light.z);
  const lx = light.x / lightLength;
  const ly = light.y / lightLength;
  const lz = light.z / lightLength;
  const strength = 3.2;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      const left = heights[index - 1] ?? heights[index];
      const right = heights[index + 1] ?? heights[index];
      const up = heights[index - width] ?? heights[index];
      const down = heights[index + width] ?? heights[index];
      const dx = (right - left) * strength;
      const dy = (down - up) * strength;
      const nx = -dx;
      const ny = -dy;
      const nz = 1;
      const nLength = Math.hypot(nx, ny, nz) || 1;
      const dot = Math.max(0, (nx * lx + ny * ly + nz * lz) / nLength);
      const ambient = 0.35;
      const diffuse = 0.65 * dot;
      const heightBoost = 0.55 + 0.45 * heights[index];
      const shade = Math.min(1, (ambient + diffuse) * heightBoost);
      const base = Math.round(220 * shade);
      const offset = index * 4;
      data[offset] = Math.min(255, Math.round(base * 0.95));
      data[offset + 1] = base;
      data[offset + 2] = Math.min(255, Math.round(base * 1.05));
      data[offset + 3] = 255;
    }
  }
  ctx.putImageData(imageData, 0, 0);
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
  const [status, setStatus] = useState('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [download, setDownload] = useState(null);
  const [preview, setPreview] = useState(null);
  const [animatePreview, setAnimatePreview] = useState(true);
  const [steps, setSteps] = useState([]);
  const [apiLogs, setApiLogs] = useState([]);
  const [sourcePreviewUrl, setSourcePreviewUrl] = useState('');
  const [previewModal, setPreviewModal] = useState(null);
  const [resultConversionType, setResultConversionType] = useState(processingOptions[0].value);
  const [woodSurface, setWoodSurface] = useState(woodSurfaceOptions[0].value);
  const [woodTextures, setWoodTextures] = useState({});
  const [woodTextureRevision, setWoodTextureRevision] = useState(0);
  const stepId = useRef(0);
  const logId = useRef(0);
  const submitLock = useRef(false);
  const woodCanvasRef = useRef(null);
  const modalWoodCanvasRef = useRef(null);
  const heightmapCanvasRef = useRef(null);
  const modalHeightmapCanvasRef = useRef(null);
  const modelCanvasRef = useRef(null);
  const modalModelCanvasRef = useRef(null);
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

  useEffect(() => {
    addStep('Page loaded', 'success');
  }, []);

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

      const targetWidth = 640;
      const targetHeight = 360;
      canvas.width = targetWidth;
      canvas.height = targetHeight;

      drawWoodPattern(ctx, targetWidth, targetHeight, woodSurface, texture);

      const scale = Math.min(
        targetWidth / viewBox.width,
        targetHeight / viewBox.height,
      );
      const offsetX = (targetWidth - viewBox.width * scale) / 2 - viewBox.minX * scale;
      const offsetY = (targetHeight - viewBox.height * scale) / 2 - viewBox.minY * scale;

      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';

      carvedPolylines.forEach((polyline) => {
        if (!polyline.length) return;
        ctx.beginPath();
        polyline.forEach((point, index) => {
          const x = point.x * scale + offsetX;
          const y = point.y * scale + offsetY;
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
    });
  }, [carvedPolylines, showWoodPreview, viewBox, woodSurface, woodTextureRevision]);

  useEffect(() => {
    if (!showHeightmapPreview && !showModelPreview) return;
    const canvases = [
      showHeightmapPreview ? heightmapCanvasRef.current : null,
      showHeightmapPreview ? modalHeightmapCanvasRef.current : null,
      showModelPreview ? modelCanvasRef.current : null,
      showModelPreview ? modalModelCanvasRef.current : null,
    ].filter(Boolean);
    if (canvases.length === 0) return;

    let isActive = true;
    const targetWidth = 640;
    const targetHeight = 360;
    const drawFallback = () => {
      if (!viewBox || !carvedPolylines.length) return;
      const mode = showModelPreview ? 'model' : 'heightmap';
      canvases.forEach((canvas) => {
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        drawReliefPreview(ctx, targetWidth, targetHeight, viewBox, carvedPolylines, mode);
      });
    };

    const drawFromImage = async () => {
      try {
        const image = await loadSourceImage(sourcePreviewUrl);
        if (!isActive || !image) return;
        canvases.forEach((canvas) => {
          const ctx = canvas.getContext('2d');
          if (!ctx) return;
          canvas.width = targetWidth;
          canvas.height = targetHeight;
          if (showModelPreview) {
            drawModelPreview(ctx, targetWidth, targetHeight, image);
          } else {
            drawHeightmapPreview(ctx, targetWidth, targetHeight, image);
          }
        });
      } catch (err) {
        if (isActive) drawFallback();
      }
    };

    if (sourcePreviewUrl) {
      drawFromImage();
    } else {
      drawFallback();
    }

    return () => {
      isActive = false;
    };
  }, [
    carvedPolylines,
    showHeightmapPreview,
    showModelPreview,
    viewBox,
    sourcePreviewUrl,
    resultConversionType,
  ]);

  const selectedFileLabel = useMemo(
    () => (file ? `${file.name} (${Math.round(file.size / 1024)} KB)` : 'No file selected'),
    [file],
  );

  function handleFileChange(event) {
    const selectedFile = event.target.files?.[0] || null;
    setFile(selectedFile);
    setError('');
    setDownload(null);
    setPreview(null);
    setStatus('idle');
    setProgress(0);
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
      const message = 'Unsupported file type. Please upload a PNG, JPG, SVG, or DXF file.';
      setError(message);
      addToast(message, 'error');
      addStep('Validation failed', 'fail', message);
      submitLock.current = false;
      return;
    }
    addStep('Validation complete', 'success');
    setStatus('uploading');
    setProgress(10);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('conversionType', processingType);
    formData.append('outputFormat', outputFormat);

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
          message = 'Unsupported file type. Please upload a PNG, JPG, SVG, or DXF file.';
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
  const disabledReason = useMemo(() => {
    if (isBusy) {
      return 'Conversion in progress. Please wait for it to finish.';
    }
    if (!file) {
      return 'Select a PNG, JPG, SVG, or DXF file to enable conversion.';
    }
    if (!isSupportedFile(file)) {
      return 'Unsupported file type. Please upload a PNG, JPG, SVG, or DXF file.';
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
                accept="image/*,.svg,.dxf"
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
                      {preview.polylines.map((polyline, index) => (
                        <polyline
                          key={`${index + 1}`}
                          points={polyline.map((point) => `${point.x},${point.y}`).join(' ')}
                          fill="none"
                          stroke="#0f172a"
                          strokeWidth="0.7"
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
                      ))}
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
                  Grayscale heightmap derived from the source image or fallback outlines.
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
                  Relief shading derived from the heightmap to visualize depth.
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
              Supported formats: PNG, JPG, SVG, and DXF files.
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
                  {preview?.polylines?.map((polyline, index) => (
                    <polyline
                      key={`${index + 1}`}
                      points={polyline.map((point) => `${point.x},${point.y}`).join(' ')}
                      fill="none"
                      stroke="#0f172a"
                      strokeWidth="0.9"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  ))}
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
