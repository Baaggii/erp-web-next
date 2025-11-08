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
};

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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');

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
        description: formState.requestDescription || '',
      },
      responseBody: {
        schema: responseSchema,
        description: formState.responseDescription || '',
      },
      fieldDescriptions: fieldDescriptions || {},
      testable: Boolean(formState.testable),
      testServerUrl: formState.testServerUrl.trim(),
    };

    const existingIds = new Set(endpoints.map((ep) => ep.id));
    validateEndpoint(endpoint, existingIds, selectedId);

    return endpoint;
  }

  async function handleSave() {
    try {
      setLoading(true);
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
      setEndpoints(Array.isArray(saved) ? saved : updated);
      setSelectedId(definition.id);
      setFormState(createFormState(definition));
      setStatus('Changes saved');
    } catch (err) {
      console.error(err);
      setError(err.message || 'Failed to save endpoints');
    } finally {
      setLoading(false);
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
      setLoading(true);
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
    } catch (err) {
      console.error(err);
      setError(err.message || 'Failed to delete endpoint');
    } finally {
      setLoading(false);
    }
  }

  async function handleFetchDoc(target) {
    if (!formState.docUrl.trim()) {
      setError('Documentation URL is required');
      return;
    }
    try {
      setLoading(true);
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
      const pretty = JSON.stringify(data.blocks[0], null, 2);
      if (target === 'request') {
        setFormState((prev) => ({ ...prev, requestSchemaText: pretty }));
      } else if (target === 'response') {
        setFormState((prev) => ({ ...prev, responseSchemaText: pretty }));
      } else {
        setFormState((prev) => ({ ...prev, fieldDescriptionsText: pretty }));
      }
      setStatus('Documentation fetched and applied');
    } catch (err) {
      console.error(err);
      setError(err.message || 'Failed to fetch documentation');
    } finally {
      setLoading(false);
    }
  }

  function handleNew() {
    setSelectedId('');
    setFormState({ ...EMPTY_ENDPOINT });
    setStatus('');
    setError('');
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
            <input
              type="text"
              value={formState.requestDescription}
              onChange={(e) => handleChange('requestDescription', e.target.value)}
              style={styles.input}
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
            <input
              type="text"
              value={formState.responseDescription}
              onChange={(e) => handleChange('responseDescription', e.target.value)}
              style={styles.input}
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
              disabled={loading}
            >
              Fetch request JSON
            </button>
            <button
              type="button"
              onClick={() => handleFetchDoc('response')}
              disabled={loading}
            >
              Fetch response JSON
            </button>
            <button
              type="button"
              onClick={() => handleFetchDoc('fields')}
              disabled={loading}
            >
              Fetch field descriptions
            </button>
          </div>
        </div>

        <div style={styles.actions}>
          <button type="button" onClick={handleSave} disabled={loading}>
            {loading ? 'Saving…' : 'Save changes'}
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={loading || (!selectedId && !formState.id)}
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
