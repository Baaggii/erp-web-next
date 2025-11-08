import React, { useEffect, useMemo, useState } from 'react';
import { API_BASE } from '../utils/apiBase.js';

const EMPTY_ENDPOINT = {
  id: '',
  name: '',
  method: 'GET',
  path: '',
  parametersText: '[]',
  requestDescription: '',
  requestSchemaText: '{}',
  responseDescription: '',
  responseSchemaText: '{}',
  fieldDescriptionsText: '{}',
  testable: false,
  testServerUrl: '',
  docUrl: '',
  requestSampleText: '',
  responseSampleText: '',
};

function showToast(message, type = 'info') {
  if (!message) return;
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(
      new CustomEvent('toast', { detail: { message: String(message), type } }),
    );
  }
}

function toPrettyJson(value, fallback = '') {
  if (!value || (typeof value === 'object' && Object.keys(value).length === 0)) {
    return fallback;
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return fallback || '';
  }
}

function toSampleText(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  return toPrettyJson(value, '');
}

function createFormState(definition) {
  if (!definition) return { ...EMPTY_ENDPOINT };
  return {
    id: definition.id || '',
    name: definition.name || '',
    method: definition.method || 'GET',
    path: definition.path || '',
    parametersText: toPrettyJson(definition.parameters, '[]'),
    requestDescription: definition.requestBody?.description || '',
    requestSchemaText: toPrettyJson(definition.requestBody?.schema, '{}'),
    responseDescription: definition.responseBody?.description || '',
    responseSchemaText: toPrettyJson(definition.responseBody?.schema, '{}'),
    fieldDescriptionsText: toPrettyJson(definition.fieldDescriptions, '{}'),
    testable: Boolean(definition.testable),
    testServerUrl: definition.testServerUrl || '',
    docUrl: '',
    requestSampleText: toSampleText(definition.requestBody?.sample),
    responseSampleText: toSampleText(definition.responseBody?.sample),
  };
}

function findMatchingBracket(text, start) {
  const open = text[start];
  const close = open === '{' ? '}' : ']';
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === '\\') {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === open) depth += 1;
    if (ch === close) {
      depth -= 1;
      if (depth === 0) {
        return i;
      }
    }
  }
  return -1;
}

function findFirstJsonSubstring(text) {
  if (!text) return '';
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '{' || ch === '[') {
      const end = findMatchingBracket(text, i);
      if (end !== -1) {
        return text.slice(i, end + 1);
      }
    }
  }
  return '';
}

function extractJsonCandidates(text) {
  if (!text) return [];
  const candidates = [];
  const trimmed = text.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    candidates.push(trimmed);
  }

  const codeBlockRegex = /```(?:json)?\s*([\s\S]*?)```/gi;
  let match;
  while ((match = codeBlockRegex.exec(text))) {
    candidates.push(match[1].trim());
  }

  const singleQuoteDataRegex = /--data(?:-raw)?\s+'([\s\S]*?)'/gi;
  while ((match = singleQuoteDataRegex.exec(text))) {
    candidates.push(match[1].trim());
  }

  const doubleQuoteDataRegex = /--data(?:-raw)?\s+"([\s\S]*?)"/gi;
  while ((match = doubleQuoteDataRegex.exec(text))) {
    let unescaped = match[1];
    try {
      unescaped = JSON.parse(`"${match[1]}"`);
    } catch {
      // Ignore failures and fall back to raw match
    }
    candidates.push(unescaped.trim());
  }

  const balanced = findFirstJsonSubstring(text);
  if (balanced) {
    candidates.push(balanced.trim());
  }

  return Array.from(
    new Set(
      candidates
        .map((candidate) => candidate.trim())
        .filter((candidate) => candidate.length > 0),
    ),
  );
}

function parseSampleJson(sampleText, label = 'sample') {
  const candidates = extractJsonCandidates(sampleText);
  for (const candidate of candidates) {
    try {
      const json = JSON.parse(candidate);
      return { json, pretty: JSON.stringify(json, null, 2) };
    } catch {
      // Try next candidate
    }
  }
  throw new Error(`No JSON data found in the ${label}`);
}

function selectDocBlock(blocks, target) {
  if (!Array.isArray(blocks) || blocks.length === 0) {
    return null;
  }
  if (target === 'response') {
    return (
      blocks.find(
        (block) =>
          block &&
          typeof block === 'object' &&
          !Array.isArray(block) &&
          ('status' in block || 'message' in block || 'statusCode' in block),
      ) || blocks[1] || blocks[0]
    );
  }
  if (target === 'fields') {
    return (
      blocks.find(
        (block) =>
          block &&
          typeof block === 'object' &&
          !Array.isArray(block) &&
          Object.values(block).every((value) => typeof value === 'string'),
      ) || blocks[blocks.length - 1] || blocks[0]
    );
  }
  return (
    blocks.find(
      (block) =>
        block &&
        typeof block === 'object' &&
        (Array.isArray(block.receipts) || Array.isArray(block.items)),
    ) || blocks[0]
  );
}

function buildDefaultUrl(formState) {
  const base = (formState.testServerUrl || '').trim();
  const path = (formState.path || '').trim();
  if (!base || !path) return '';
  const normalizedBase = base.endsWith('/') ? base.slice(0, -1) : base;
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
}

function parseRequestSample(sampleText, formState) {
  const sample = (sampleText || '').trim();
  if (!sample) {
    throw new Error('Request sample cannot be empty');
  }

  const headers = {};
  let url = '';
  let method = (formState.method || 'GET').toUpperCase();
  let body;
  let parsedJson = null;

  if (sample.toLowerCase().startsWith('curl')) {
    const urlMatch =
      sample.match(/--url\s+([^\s\\]+)/i) || sample.match(/curl\s+([^\s\\]+)/i);
    if (urlMatch) {
      url = urlMatch[1].replace(/\\$/, '');
    }

    const methodMatch =
      sample.match(/--request\s+([A-Z]+)/i) || sample.match(/-X\s+([A-Z]+)/i);
    if (methodMatch) {
      method = methodMatch[1].toUpperCase();
    }

    const headerRegex = /--header\s+['"]([^'"\n]+)['"]/gi;
    let headerMatch;
    while ((headerMatch = headerRegex.exec(sample))) {
      const [key, ...rest] = headerMatch[1].split(':');
      if (!key) continue;
      headers[key.trim()] = rest.join(':').trim();
    }

    const candidates = extractJsonCandidates(sample);
    let fallbackBody = null;
    for (const candidate of candidates) {
      try {
        const json = JSON.parse(candidate);
        parsedJson = json;
        body = json;
        break;
      } catch {
        fallbackBody = candidate;
      }
    }
    if (body === undefined && fallbackBody !== null) {
      body = fallbackBody;
    }
    if (body === undefined) {
      const dataMatch = sample.match(/--data(?:-raw)?\s+([^\s]+)/i);
      if (dataMatch) {
        body = dataMatch[1];
      }
    }
  } else {
    const parsed = parseSampleJson(sample, 'request sample');
    parsedJson = parsed.json;
    body = parsed.json;
  }

  if (!url) {
    url = buildDefaultUrl(formState);
  }
  if (!url) {
    throw new Error(
      'Unable to determine request URL. Provide --url in the sample or set the Test server URL.',
    );
  }

  if (parsedJson && !headers['Content-Type'] && !headers['content-type']) {
    headers['Content-Type'] = 'application/json';
  }

  return {
    method,
    url,
    headers,
    body,
    parsedJson,
  };
}

function parseJsonInput(label, text, defaultValue) {
  const trimmed = (text || '').trim();
  if (!trimmed) return defaultValue;
  try {
    return JSON.parse(trimmed);
  } catch (err) {
    const error = new Error(`${label} must be valid JSON`);
    error.cause = err;
    throw error;
  }
}

function parseSampleForPersistence(sampleText) {
  const trimmed = (sampleText || '').trim();
  if (!trimmed) return undefined;
  try {
    return JSON.parse(trimmed);
  } catch (err) {
    return trimmed;
  }
}

async function extractErrorMessage(response, fallback) {
  try {
    const data = await response.clone().json();
    if (data && typeof data.message === 'string' && data.message.trim()) {
      return data.message.trim();
    }
  } catch {
    // Ignore JSON parsing failures and fall through to text parsing
  }
  try {
    const text = await response.text();
    if (text) {
      return text.slice(0, 200);
    }
  } catch {
    // Swallow errors and use fallback
  }
  return fallback;
}

function validateEndpoint(endpoint, existingIds, originalId) {
  const id = (endpoint.id || '').trim();
  if (!id) throw new Error('ID is required');
  if (existingIds.has(id) && id !== originalId) {
    throw new Error(`An endpoint with id "${id}" already exists`);
  }
  if (!endpoint.name) throw new Error('Name is required');
  if (!endpoint.method) throw new Error('HTTP method is required');
  if (!endpoint.path) throw new Error('Path is required');
}

export default function PosApiAdmin() {
  const [endpoints, setEndpoints] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [formState, setFormState] = useState({ ...EMPTY_ENDPOINT });
  const [pendingAction, setPendingAction] = useState('');
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [testResult, setTestResult] = useState(null);

  const isBusy = Boolean(pendingAction);

  const sortedEndpoints = useMemo(() => {
    return [...endpoints].sort((a, b) => {
      const left = a.name || a.id || '';
      const right = b.name || b.id || '';
      return left.localeCompare(right);
    });
  }, [endpoints]);

  useEffect(() => {
    async function fetchEndpoints() {
      try {
        setError('');
        const res = await fetch(`${API_BASE}/posapi/endpoints`, {
          credentials: 'include',
          skipErrorToast: true,
        });
        if (!res.ok) {
          const message = await extractErrorMessage(
            res,
            'Failed to load POSAPI endpoints',
          );
          throw new Error(message);
        }
        const data = await res.json();
        setEndpoints(Array.isArray(data) ? data : []);
        if (Array.isArray(data) && data.length > 0) {
          setSelectedId(data[0].id);
          setFormState(createFormState(data[0]));
          setTestResult(null);
        }
      } catch (err) {
        console.error(err);
        setError(err.message || 'Failed to load endpoints');
      }
    }
    fetchEndpoints();
  }, []);

  function handleSelect(id) {
    setStatus('');
    setError('');
    setSelectedId(id);
    const definition = endpoints.find((ep) => ep.id === id);
    setFormState(createFormState(definition));
    setTestResult(null);
  }

  function handleChange(field, value) {
    setFormState((prev) => ({ ...prev, [field]: value }));
  }

  function buildDefinition() {
    const parameters = parseJsonInput('Parameters', formState.parametersText, []);
    if (!Array.isArray(parameters)) {
      throw new Error('Parameters must be a JSON array');
    }
    const requestSchema = parseJsonInput(
      'Request body schema',
      formState.requestSchemaText,
      {},
    );
    const responseSchema = parseJsonInput(
      'Response body schema',
      formState.responseSchemaText,
      {},
    );
    const fieldDescriptions = parseJsonInput(
      'Field descriptions',
      formState.fieldDescriptionsText,
      {},
    );
    if (fieldDescriptions && typeof fieldDescriptions !== 'object') {
      throw new Error('Field descriptions must be a JSON object');
    }

    const endpoint = {
      id: formState.id.trim(),
      name: formState.name.trim(),
      method: formState.method.trim().toUpperCase(),
      path: formState.path.trim(),
      parameters,
      requestBody: {
        schema: requestSchema,
        description: (formState.requestDescription || '').trim(),
      },
      responseBody: {
        schema: responseSchema,
        description: (formState.responseDescription || '').trim(),
      },
      fieldDescriptions: fieldDescriptions || {},
      testable: Boolean(formState.testable),
      testServerUrl: formState.testServerUrl.trim(),
    };

    const requestSample = parseSampleForPersistence(formState.requestSampleText);
    if (requestSample !== undefined) {
      endpoint.requestBody.sample = requestSample;
    }

    const responseSample = parseSampleForPersistence(formState.responseSampleText);
    if (responseSample !== undefined) {
      endpoint.responseBody.sample = responseSample;
    }

    const existingIds = new Set(endpoints.map((ep) => ep.id));
    validateEndpoint(endpoint, existingIds, selectedId);

    return endpoint;
  }

  async function handleSave() {
    try {
      setPendingAction('save');
      setError('');
      setStatus('');
      const definition = buildDefinition();
      const updated = endpoints.some((ep) => ep.id === selectedId)
        ? endpoints.map((ep) => (ep.id === selectedId ? definition : ep))
        : [...endpoints, definition];

      const res = await fetch(`${API_BASE}/posapi/endpoints`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        skipErrorToast: true,
        body: JSON.stringify({ endpoints: updated }),
      });
      if (!res.ok) {
        const message = await extractErrorMessage(res, 'Failed to save endpoints');
        throw new Error(message);
      }
      const saved = await res.json();
      const nextEndpoints = Array.isArray(saved) ? saved : updated;
      setEndpoints(nextEndpoints);
      const canonical =
        nextEndpoints.find((ep) => ep.id === definition.id) || definition;
      setSelectedId(canonical.id);
      setFormState(createFormState(canonical));
      setTestResult(null);
      setStatus('Changes saved');
      showToast(`Endpoint "${definition.name || definition.id}" saved`, 'success');
    } catch (err) {
      console.error(err);
      setError(err.message || 'Failed to save endpoints');
      showToast(err.message || 'Failed to save endpoints', 'error');
    } finally {
      setPendingAction('');
    }
  }

  async function handleDelete() {
    if (!selectedId) {
      setFormState({ ...EMPTY_ENDPOINT });
      return;
    }
    const existing = endpoints.find((ep) => ep.id === selectedId);
    if (!existing) {
      setFormState({ ...EMPTY_ENDPOINT });
      setSelectedId('');
      return;
    }
    const confirmed = window.confirm(
      `Delete endpoint "${existing.name || existing.id}"?`,
    );
    if (!confirmed) return;
    try {
      setPendingAction('delete');
      setError('');
      setStatus('');
      const updated = endpoints.filter((ep) => ep.id !== selectedId);
      const res = await fetch(`${API_BASE}/posapi/endpoints`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        skipErrorToast: true,
        body: JSON.stringify({ endpoints: updated }),
      });
      if (!res.ok) {
        const message = await extractErrorMessage(
          res,
          'Failed to delete endpoint',
        );
        throw new Error(message);
      }
      const saved = await res.json();
      const nextEndpoints = Array.isArray(saved) ? saved : updated;
      setEndpoints(nextEndpoints);
      if (nextEndpoints.length > 0) {
        setSelectedId(nextEndpoints[0].id);
        setFormState(createFormState(nextEndpoints[0]));
      } else {
        setSelectedId('');
        setFormState({ ...EMPTY_ENDPOINT });
      }
      setStatus('Endpoint deleted');
      showToast(`Endpoint "${existing.name || existing.id}" deleted`, 'success');
    } catch (err) {
      console.error(err);
      setError(err.message || 'Failed to delete endpoint');
      showToast(err.message || 'Failed to delete endpoint', 'error');
    } finally {
      setPendingAction('');
    }
  }

  async function handleFetchDoc(target) {
    if (!formState.docUrl.trim()) {
      setError('Documentation URL is required');
      showToast('Documentation URL is required', 'error');
      return;
    }
    try {
      setPendingAction('fetch-doc');
      setError('');
      setStatus('');
      const res = await fetch(`${API_BASE}/posapi/endpoints/fetch-doc`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        skipErrorToast: true,
        body: JSON.stringify({ url: formState.docUrl.trim() }),
      });
      if (!res.ok) {
        const message = await extractErrorMessage(
          res,
          'Failed to fetch documentation',
        );
        throw new Error(message);
      }
      const data = await res.json();
      if (!data.blocks || data.blocks.length === 0) {
        throw new Error('No JSON examples were found in the documentation');
      }
      const selectedBlock = selectDocBlock(data.blocks, target);
      if (!selectedBlock) {
        throw new Error('No matching JSON example found for this section');
      }
      const pretty = JSON.stringify(selectedBlock, null, 2);
      if (target === 'request') {
        setFormState((prev) => ({
          ...prev,
          requestSchemaText: pretty,
          requestSampleText: pretty,
        }));
      } else if (target === 'response') {
        setFormState((prev) => ({
          ...prev,
          responseSchemaText: pretty,
          responseSampleText: pretty,
        }));
      } else {
        setFormState((prev) => ({ ...prev, fieldDescriptionsText: pretty }));
      }
      setStatus('Documentation fetched and applied');
      setTestResult(null);
      showToast('Documentation fetched', 'success');
    } catch (err) {
      console.error(err);
      setError(err.message || 'Failed to fetch documentation');
      showToast(err.message || 'Failed to fetch documentation', 'error');
    } finally {
      setPendingAction('');
    }
  }

  function handleApplyRequestSample() {
    try {
      const parsed = parseSampleJson(formState.requestSampleText, 'request sample');
      setFormState((prev) => ({
        ...prev,
        requestSchemaText: parsed.pretty,
        requestSampleText: parsed.pretty,
      }));
      setStatus('Request schema updated from sample');
      setError('');
      showToast('Request sample parsed into schema', 'success');
    } catch (err) {
      console.error(err);
      const message = err.message || 'Failed to parse request sample';
      setError(message);
      showToast(message, 'error');
    }
  }

  function handleApplyResponseSample() {
    try {
      const parsed = parseSampleJson(formState.responseSampleText, 'response sample');
      setFormState((prev) => ({
        ...prev,
        responseSchemaText: parsed.pretty,
        responseSampleText: parsed.pretty,
      }));
      setStatus('Response schema updated from sample');
      setError('');
      showToast('Response sample parsed into schema', 'success');
    } catch (err) {
      console.error(err);
      const message = err.message || 'Failed to parse response sample';
      setError(message);
      showToast(message, 'error');
    }
  }

  async function handleTestSample() {
    try {
      const request = parseRequestSample(formState.requestSampleText, formState);
      setPendingAction('test');
      setError('');
      setStatus('');
      setTestResult(null);
      const res = await fetch(`${API_BASE}/posapi/endpoints/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        skipErrorToast: true,
        body: JSON.stringify({ request }),
      });
      let result;
      try {
        result = await res.json();
      } catch {
        result = {
          ok: res.ok,
          status: res.status,
          statusText: res.statusText,
          rawBody: '',
        };
      }
      setTestResult(result);
      if (result.body) {
        const pretty = JSON.stringify(result.body, null, 2);
        setFormState((prev) => ({
          ...prev,
          responseSampleText: pretty,
          responseSchemaText: pretty,
        }));
      } else if (result.rawBody) {
        setFormState((prev) => ({
          ...prev,
          responseSampleText: result.rawBody,
        }));
      }
      if (res.ok && result.ok !== false) {
        setStatus(`Test call succeeded (${result.status})`);
        showToast(`Test request succeeded (${result.status})`, 'success');
      } else {
        const message =
          result?.message || `Test call returned status ${result.status || res.status}`;
        setError(message);
        showToast(message, 'error');
      }
    } catch (err) {
      console.error(err);
      const message = err.message || 'Failed to test request sample';
      setError(message);
      setTestResult(null);
      showToast(message, 'error');
    } finally {
      setPendingAction('');
    }
  }

  function handleNew() {
    setSelectedId('');
    setFormState({ ...EMPTY_ENDPOINT });
    setStatus('');
    setError('');
    setTestResult(null);
  }

  return (
    <div style={styles.container}>
      <div style={styles.sidebar}>
        <div style={styles.sidebarHeader}>
          <h2 style={{ margin: 0 }}>POSAPI Endpoints</h2>
          <button onClick={handleNew} style={styles.newButton}>
            + New
          </button>
        </div>
        <ul style={styles.list}>
          {sortedEndpoints.map((ep) => (
            <li key={ep.id}>
              <button
                type="button"
                onClick={() => handleSelect(ep.id)}
                style={{
                  ...styles.listButton,
                  ...(selectedId === ep.id ? styles.listButtonActive : {}),
                }}
              >
                <strong>{ep.name}</strong>
                <br />
                <span style={{ fontSize: '0.8rem', color: '#555' }}>{ep.id}</span>
              </button>
            </li>
          ))}
          {sortedEndpoints.length === 0 && (
            <li style={{ color: '#666', padding: '0.5rem 0' }}>
              No endpoints configured yet
            </li>
          )}
        </ul>
      </div>
      <div style={styles.formContainer}>
        <h1>POSAPI Endpoint Registry</h1>
        <p style={{ maxWidth: '720px' }}>
          Manage the list of available POSAPI endpoints. Paste JSON samples
          directly into the fields below or fetch them from a documentation URL.
        </p>
        {error && <div style={styles.error}>{error}</div>}
        {status && <div style={styles.status}>{status}</div>}
        <div style={styles.formGrid}>
          <label style={styles.label}>
            Endpoint ID
            <input
              type="text"
              value={formState.id}
              onChange={(e) => handleChange('id', e.target.value)}
              style={styles.input}
              placeholder="saveReceipt"
            />
          </label>
          <label style={styles.label}>
            Name
            <input
              type="text"
              value={formState.name}
              onChange={(e) => handleChange('name', e.target.value)}
              style={styles.input}
              placeholder="Save B2C/B2B Receipt"
            />
          </label>
          <label style={styles.label}>
            Method
            <select
              value={formState.method}
              onChange={(e) => handleChange('method', e.target.value)}
              style={styles.input}
            >
              {['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].map((method) => (
                <option key={method} value={method}>
                  {method}
                </option>
              ))}
            </select>
          </label>
          <label style={styles.label}>
            Path
            <input
              type="text"
              value={formState.path}
              onChange={(e) => handleChange('path', e.target.value)}
              style={styles.input}
              placeholder="/rest/receipt"
            />
          </label>
          <label style={styles.labelFull}>
            Parameters (JSON array)
            <textarea
              value={formState.parametersText}
              onChange={(e) => handleChange('parametersText', e.target.value)}
              style={styles.textarea}
              rows={6}
            />
          </label>
          <label style={styles.labelFull}>
            Request description
            <textarea
              value={formState.requestDescription}
              onChange={(e) => handleChange('requestDescription', e.target.value)}
              style={styles.longTextarea}
              rows={6}
              placeholder="Batch of receipts with payments and items"
            />
          </label>
          <label style={styles.labelFull}>
            Request body schema (JSON)
            <textarea
              value={formState.requestSchemaText}
              onChange={(e) => handleChange('requestSchemaText', e.target.value)}
              style={styles.textarea}
              rows={10}
            />
          </label>
          <label style={styles.labelFull}>
            Response description
            <textarea
              value={formState.responseDescription}
              onChange={(e) => handleChange('responseDescription', e.target.value)}
              style={styles.longTextarea}
              rows={6}
              placeholder="Receipt submission response"
            />
          </label>
          <label style={styles.labelFull}>
            Response body schema (JSON)
            <textarea
              value={formState.responseSchemaText}
              onChange={(e) => handleChange('responseSchemaText', e.target.value)}
              style={styles.textarea}
              rows={10}
            />
          </label>
          <label style={styles.labelFull}>
            Field descriptions (JSON object)
            <textarea
              value={formState.fieldDescriptionsText}
              onChange={(e) => handleChange('fieldDescriptionsText', e.target.value)}
              style={styles.textarea}
              rows={8}
            />
          </label>
          <div style={styles.inlineFields}>
            <label style={{ ...styles.label, flex: 1 }}>
              Test server URL
              <input
                type="text"
                value={formState.testServerUrl}
                onChange={(e) => handleChange('testServerUrl', e.target.value)}
                style={styles.input}
                placeholder="https://posapi-test.tax.gov.mn"
              />
            </label>
            <label style={{ ...styles.checkboxLabel, marginTop: '1.5rem' }}>
              <input
                type="checkbox"
                checked={formState.testable}
                onChange={(e) => handleChange('testable', e.target.checked)}
              />
              Testable endpoint
            </label>
          </div>
        </div>

        <div style={styles.docFetcher}>
          <label style={{ ...styles.label, flex: 1 }}>
            Documentation URL
            <input
              type="url"
              value={formState.docUrl}
              onChange={(e) => handleChange('docUrl', e.target.value)}
              style={styles.input}
              placeholder="https://developer.itc.gov.mn/docs/..."
            />
          </label>
          <div style={styles.docButtons}>
            <button
              type="button"
              onClick={() => handleFetchDoc('request')}
              disabled={isBusy}
            >
              {pendingAction === 'fetch-doc' ? 'Fetching…' : 'Fetch request JSON'}
            </button>
            <button
              type="button"
              onClick={() => handleFetchDoc('response')}
              disabled={isBusy}
            >
              {pendingAction === 'fetch-doc' ? 'Fetching…' : 'Fetch response JSON'}
            </button>
            <button
              type="button"
              onClick={() => handleFetchDoc('fields')}
              disabled={isBusy}
            >
              {pendingAction === 'fetch-doc' ? 'Fetching…' : 'Fetch field descriptions'}
            </button>
          </div>
        </div>

        <div style={styles.sectionHeader}>
          <h2 style={styles.sectionTitle}>Samples &amp; testing</h2>
          <p style={styles.sectionDescription}>
            Paste request/response examples, run a live call against the configured test
            server, and promote parsed JSON into the schema editors.
          </p>
        </div>

        <div style={styles.sampleSection}>
          <div style={styles.sampleColumn}>
            <label style={styles.labelFull}>
              Request sample / script
              <textarea
                value={formState.requestSampleText}
                onChange={(e) => handleChange('requestSampleText', e.target.value)}
                style={styles.textarea}
                rows={12}
                placeholder="Paste JSON or cURL sample here"
              />
            </label>
            <div style={styles.sampleButtons}>
              <button type="button" onClick={handleApplyRequestSample} disabled={isBusy}>
                Use sample for request schema
              </button>
              <button
                type="button"
                onClick={handleTestSample}
                disabled={isBusy || !formState.requestSampleText.trim()}
              >
                {pendingAction === 'test' ? 'Testing…' : 'Test sample'}
              </button>
            </div>
          </div>
          <div style={styles.sampleColumn}>
            <label style={styles.labelFull}>
              Response sample
              <textarea
                value={formState.responseSampleText}
                onChange={(e) => handleChange('responseSampleText', e.target.value)}
                style={styles.textarea}
                rows={12}
                placeholder="Paste expected response JSON here"
              />
            </label>
            <div style={styles.sampleButtons}>
              <button
                type="button"
                onClick={handleApplyResponseSample}
                disabled={isBusy || !formState.responseSampleText.trim()}
              >
                Use sample for response schema
              </button>
            </div>
          </div>
        </div>

        <div style={styles.testResultBox}>
          <div style={styles.testResultHeader}>
            <strong>
              {testResult
                ? `HTTP ${testResult.status}${
                    testResult.statusText ? ` – ${testResult.statusText}` : ''
                  }`
                : 'Test result preview'}
            </strong>
            {testResult && typeof testResult.durationMs === 'number' && (
              <span style={{ color: '#475569', marginLeft: '0.5rem' }}>
                {testResult.durationMs} ms
              </span>
            )}
          </div>
          {testResult ? (
            <pre style={styles.codeBlock}>
              {testResult.body
                ? JSON.stringify(testResult.body, null, 2)
                : testResult.rawBody || '(empty body)'}
            </pre>
          ) : (
            <p style={styles.testResultEmpty}>
              Run “Test sample” to preview the POSAPI response payload here.
            </p>
          )}
        </div>

        <div style={styles.actions}>
          <button type="button" onClick={handleSave} disabled={isBusy}>
            {pendingAction === 'save' ? 'Saving…' : 'Save changes'}
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={isBusy || (!selectedId && !formState.id)}
            style={styles.deleteButton}
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

const styles = {
  container: {
    display: 'flex',
    gap: '1.5rem',
    alignItems: 'flex-start',
  },
  sidebar: {
    width: '280px',
    background: '#f8fafc',
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    padding: '1rem',
    maxHeight: 'calc(100vh - 140px)',
    overflowY: 'auto',
  },
  sidebarHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '1rem',
  },
  newButton: {
    background: '#2563eb',
    color: '#fff',
    border: 'none',
    borderRadius: '4px',
    padding: '0.25rem 0.75rem',
    cursor: 'pointer',
  },
  list: {
    listStyle: 'none',
    padding: 0,
    margin: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  listButton: {
    width: '100%',
    textAlign: 'left',
    border: '1px solid transparent',
    background: '#fff',
    borderRadius: '6px',
    padding: '0.5rem',
    cursor: 'pointer',
  },
  listButtonActive: {
    borderColor: '#2563eb',
    background: '#dbeafe',
  },
  formContainer: {
    flex: 1,
    background: '#fff',
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    padding: '1.5rem',
    maxWidth: '900px',
  },
  formGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
    gap: '1rem 1.5rem',
    marginTop: '1rem',
  },
  label: {
    display: 'flex',
    flexDirection: 'column',
    fontWeight: 600,
    gap: '0.5rem',
  },
  labelFull: {
    gridColumn: '1 / -1',
    display: 'flex',
    flexDirection: 'column',
    fontWeight: 600,
    gap: '0.5rem',
  },
  input: {
    padding: '0.5rem',
    borderRadius: '4px',
    border: '1px solid #cbd5f5',
    fontSize: '0.95rem',
  },
  textarea: {
    minHeight: '140px',
    padding: '0.5rem',
    borderRadius: '4px',
    border: '1px solid #cbd5f5',
    fontFamily: 'monospace',
    fontSize: '0.9rem',
    lineHeight: 1.4,
  },
  longTextarea: {
    padding: '0.5rem',
    borderRadius: '4px',
    border: '1px solid #cbd5f5',
    fontSize: '0.95rem',
    minHeight: '160px',
    lineHeight: 1.5,
  },
  inlineFields: {
    gridColumn: '1 / -1',
    display: 'flex',
    gap: '1rem',
    alignItems: 'center',
  },
  checkboxLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    fontWeight: 600,
  },
  docFetcher: {
    marginTop: '1.5rem',
    display: 'flex',
    gap: '1rem',
    alignItems: 'flex-end',
  },
  docButtons: {
    display: 'flex',
    gap: '0.5rem',
    flexWrap: 'wrap',
  },
  sectionHeader: {
    marginTop: '2rem',
    marginBottom: '0.75rem',
  },
  sectionTitle: {
    margin: 0,
    fontSize: '1.25rem',
    fontWeight: 700,
    color: '#0f172a',
  },
  sectionDescription: {
    margin: '0.25rem 0 0',
    color: '#475569',
    fontSize: '0.95rem',
  },
  sampleSection: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
    gap: '1.5rem',
    marginTop: '1rem',
  },
  sampleColumn: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
  },
  sampleButtons: {
    display: 'flex',
    gap: '0.75rem',
    flexWrap: 'wrap',
  },
  testResultBox: {
    marginTop: '1.5rem',
    border: '1px solid #cbd5f5',
    borderRadius: '6px',
    background: '#f8fafc',
    padding: '1rem',
  },
  testResultHeader: {
    display: 'flex',
    alignItems: 'center',
    fontSize: '0.95rem',
    marginBottom: '0.75rem',
    color: '#0f172a',
    gap: '0.25rem',
  },
  codeBlock: {
    margin: 0,
    padding: '0.75rem',
    background: '#0f172a',
    color: '#f8fafc',
    borderRadius: '6px',
    overflowX: 'auto',
    maxHeight: '320px',
    whiteSpace: 'pre',
  },
  testResultEmpty: {
    margin: 0,
    color: '#475569',
    fontStyle: 'italic',
  },
  actions: {
    marginTop: '1.5rem',
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '0.75rem',
  },
  error: {
    background: '#fee2e2',
    border: '1px solid #fca5a5',
    color: '#991b1b',
    padding: '0.75rem 1rem',
    borderRadius: '6px',
    marginBottom: '1rem',
  },
  status: {
    background: '#dcfce7',
    border: '1px solid #86efac',
    color: '#166534',
    padding: '0.75rem 1rem',
    borderRadius: '6px',
    marginBottom: '1rem',
  },
  deleteButton: {
    background: '#f87171',
    color: '#fff',
    border: 'none',
    borderRadius: '4px',
    padding: '0.5rem 1rem',
    cursor: 'pointer',
  },
};
