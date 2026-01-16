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

function buildPreviewFromPolylines(polylines) {
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

function parseGcodeToPolylines(gcodeText) {
  if (!gcodeText) return [];
  const polylines = [];
  let current = [];
  let x = 0;
  let y = 0;

  gcodeText.split(/\r?\n/).forEach((rawLine) => {
    const line = rawLine.trim();
    if (!line || line.startsWith(';')) return;
    const command = line.match(/^(G0|G00|G1|G01)\b/i)?.[0]?.toUpperCase();
    if (!command) return;

    const xMatch = line.match(/X(-?\d+(\.\d+)?)/i);
    const yMatch = line.match(/Y(-?\d+(\.\d+)?)/i);
    const nextX = xMatch ? Number(xMatch[1]) : x;
    const nextY = yMatch ? Number(yMatch[1]) : y;

    if (command === 'G0' || command === 'G00') {
      if (current.length > 1) {
        polylines.push(current);
      }
      current = [];
      if (xMatch || yMatch) {
        current.push({ x: nextX, y: nextY });
      }
    } else if (command === 'G1' || command === 'G01') {
      if (current.length === 0) {
        current.push({ x, y });
      }
      current.push({ x: nextX, y: nextY });
    }

    x = nextX;
    y = nextY;
  });

  if (current.length > 1) {
    polylines.push(current);
  }

  return polylines;
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
  const [showWoodPreview, setShowWoodPreview] = useState(true);
  const [steps, setSteps] = useState([]);
  const [apiLogs, setApiLogs] = useState([]);
  const stepId = useRef(0);
  const logId = useRef(0);
  const woodCanvasRef = useRef(null);

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
    if (status !== 'uploading') return undefined;
    setProgress(10);
    const id = setInterval(() => {
      setProgress((prev) => (prev < 90 ? prev + 5 : prev));
    }, 400);
    return () => clearInterval(id);
  }, [status]);

  useEffect(() => {
    if (!showWoodPreview || !preview?.polylines?.length) return;
    const canvas = woodCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const box = parseViewBox(preview.viewBox);
    if (!box) return;

    const targetWidth = 640;
    const targetHeight = 360;
    canvas.width = targetWidth;
    canvas.height = targetHeight;

    const gradient = ctx.createLinearGradient(0, 0, targetWidth, targetHeight);
    gradient.addColorStop(0, '#f8e7c2');
    gradient.addColorStop(0.5, '#e8c08e');
    gradient.addColorStop(1, '#d1a073');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, targetWidth, targetHeight);

    ctx.globalAlpha = 0.25;
    for (let i = 0; i < 18; i += 1) {
      ctx.fillStyle = i % 2 === 0 ? '#d9b085' : '#e0bf97';
      const y = (targetHeight / 18) * i;
      ctx.fillRect(0, y, targetWidth, targetHeight / 18);
    }
    ctx.globalAlpha = 1;

    const scale = Math.min(
      targetWidth / box.width,
      targetHeight / box.height,
    );
    const offsetX = (targetWidth - box.width * scale) / 2 - box.minX * scale;
    const offsetY = (targetHeight - box.height * scale) / 2 - box.minY * scale;

    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#3f2a19';
    ctx.lineWidth = 1.6;
    ctx.shadowColor = 'rgba(30, 15, 5, 0.35)';
    ctx.shadowBlur = 3;
    ctx.shadowOffsetY = 1;

    preview.polylines.forEach((polyline) => {
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
  }, [preview, showWoodPreview]);

  useEffect(() => {
    if (preview?.polylines?.length) return;
    if (!download?.url || outputFormat !== 'gcode') return;
    let isActive = true;
    fetch(download.url, { credentials: 'include' })
      .then((res) => (res.ok ? res.text() : ''))
      .then((text) => {
        if (!isActive || !text) return;
        const polylines = parseGcodeToPolylines(text);
        const fallbackPreview = buildPreviewFromPolylines(polylines);
        if (fallbackPreview) {
          setPreview(fallbackPreview);
        }
      })
      .catch(() => undefined);
    return () => {
      isActive = false;
    };
  }, [download?.url, outputFormat, preview]);

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
    if (selectedFile) {
      addStep('File selected', 'success', `${selectedFile.name} (${selectedFile.type || 'unknown'})`);
    } else {
      addStep('File cleared', 'success');
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setDownload(null);
    setPreview(null);
    addStep('Validation started', 'success');

    if (!file) {
      const message = 'Please select a file to upload.';
      setError(message);
      addToast(message, 'error');
      addStep('Validation failed', 'fail', message);
      return;
    }
    if (!isSupportedFile(file)) {
      const message = 'Unsupported file type. Please upload a PNG, JPG, SVG, or DXF file.';
      setError(message);
      addToast(message, 'error');
      addStep('Validation failed', 'fail', message);
      return;
    }
    addStep('Validation complete', 'success');

    const formData = new FormData();
    formData.append('file', file);
    formData.append('conversionType', processingType);
    formData.append('outputFormat', outputFormat);

    try {
      setStatus('uploading');
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
      } else {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        setDownload({ url, filename: `cnc-output.${outputFormat}` });
        setPreview(null);
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
    }
  }

  const isBusy = status === 'uploading';
  const hasPreview = preview?.polylines?.length > 0;
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

  return (
    <div className="mx-auto max-w-3xl p-6">
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

      {status === 'success' && (
        <div className="rounded-md border border-slate-200 bg-white p-4 text-sm text-slate-700">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-slate-900">Toolpath preview</p>
              <p className="text-xs text-slate-500">
                {hasPreview
                  ? 'Simulated carving path based on the converted vector data.'
                  : 'Preview will appear once the toolpath data is available.'}
              </p>
            </div>
            <label className="flex items-center gap-2 text-xs text-slate-500">
              <input
                type="checkbox"
                checked={animatePreview}
                onChange={(event) => setAnimatePreview(event.target.checked)}
                disabled={!hasPreview}
                className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-400"
              />
              Animate toolpath
            </label>
          </div>
          {hasPreview ? (
            <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-3">
              <svg
                viewBox={preview.viewBox}
                className="h-64 w-full"
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
          ) : (
            <div className="mt-4 rounded-md border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-xs text-slate-500">
              Toolpath preview pending.
            </div>
          )}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-slate-900">Carved wood simulation</p>
              <p className="text-xs text-slate-500">
                {hasPreview
                  ? 'Imitated real-world finish showing the toolpath carved into wood.'
                  : 'Wood simulation will appear after toolpath data is ready.'}
              </p>
            </div>
            <label className="flex items-center gap-2 text-xs text-slate-500">
              <input
                type="checkbox"
                checked={showWoodPreview}
                onChange={(event) => setShowWoodPreview(event.target.checked)}
                disabled={!hasPreview}
                className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-400"
              />
              Show wood preview
            </label>
          </div>
          {showWoodPreview && hasPreview ? (
            <div className="mt-3 overflow-hidden rounded-md border border-slate-200 bg-white">
              <canvas ref={woodCanvasRef} className="h-64 w-full" />
            </div>
          ) : (
            <div className="mt-3 rounded-md border border-dashed border-slate-200 bg-white p-6 text-center text-xs text-slate-500">
              Carved wood simulation pending.
            </div>
          )}
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
    </div>
  );
}

export default CncProcessingPage;
export { CncProcessingPage };
