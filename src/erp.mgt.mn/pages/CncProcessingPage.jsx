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
  const [steps, setSteps] = useState([]);
  const [apiLogs, setApiLogs] = useState([]);
  const stepId = useRef(0);
  const logId = useRef(0);

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

  const selectedFileLabel = useMemo(
    () => (file ? `${file.name} (${Math.round(file.size / 1024)} KB)` : 'No file selected'),
    [file],
  );

  function handleFileChange(event) {
    const selectedFile = event.target.files?.[0] || null;
    setFile(selectedFile);
    setError('');
    setDownload(null);
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

    const buildFormData = () => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('conversionType', processingType);
      formData.append('outputFormat', outputFormat);
      return formData;
    };

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
        if (contentType.includes('text/html')) {
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
      } else {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        setDownload({ url, filename: `cnc-output.${outputFormat}` });
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
