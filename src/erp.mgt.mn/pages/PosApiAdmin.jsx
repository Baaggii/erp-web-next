import React, { useContext, useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import I18nContext from '../context/I18nContext.jsx';
import { AuthContext } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { API_BASE } from '../utils/apiBase.js';

function formatJson(value, fallback = '{}') {
  if (value === undefined || value === null) return fallback;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return fallback;
  }
}

function createFormState(endpoint = {}) {
  return {
    id: endpoint.id || '',
    name: endpoint.name || '',
    method: endpoint.method || 'GET',
    path: endpoint.path || '',
    parameters: Array.isArray(endpoint.parameters)
      ? endpoint.parameters.map((param) => ({
          name: param.name || '',
          in: param.in || 'path',
          field: param.field || '',
          required: Boolean(param.required),
        }))
      : [],
    requestDescription: endpoint.requestBody?.description || '',
    requestSchemaText: formatJson(endpoint.requestBody?.schema, ''),
    responseDescription: endpoint.responseBody?.description || '',
    responseSchemaText: formatJson(endpoint.responseBody?.schema, ''),
    fieldDescriptionsText:
      endpoint.fieldDescriptions &&
      Object.keys(endpoint.fieldDescriptions).length > 0
        ? formatJson(endpoint.fieldDescriptions, '{}')
        : '',
    testable: Boolean(endpoint.testable),
    testServerUrl: endpoint.testServerUrl || '',
  };
}

function createEmptyForm() {
  return {
    id: '',
    name: '',
    method: 'POST',
    path: '',
    parameters: [],
    requestDescription: '',
    requestSchemaText: '',
    responseDescription: '',
    responseSchemaText: '',
    fieldDescriptionsText: '',
    testable: false,
    testServerUrl: '',
  };
}

function parseJsonInput(text, label, defaultValue = {}) {
  const trimmed = typeof text === 'string' ? text.trim() : '';
  if (!trimmed) return defaultValue;
  try {
    return JSON.parse(trimmed);
  } catch (err) {
    throw new Error(`${label} must be valid JSON`);
  }
}

function buildEndpointFromForm(form) {
  const id = form.id.trim();
  if (!id) throw new Error('Endpoint ID is required');
  const name = form.name.trim() || id;
  const method = (form.method || 'GET').toUpperCase();
  const path = form.path.trim();
  if (!path) throw new Error('Endpoint path is required');

  const parameters = Array.isArray(form.parameters)
    ? form.parameters
        .map((param) => ({
          name: (param.name || '').trim(),
          in: (param.in || 'path').trim() || 'path',
          field: (param.field || '').trim(),
          required: Boolean(param.required),
        }))
        .filter((param) => param.name)
    : [];

  const requestSchema = parseJsonInput(
    form.requestSchemaText,
    'Request body JSON',
    {},
  );
  const responseSchema = parseJsonInput(
    form.responseSchemaText,
    'Response body JSON',
    {},
  );
  const fieldDescriptions = parseJsonInput(
    form.fieldDescriptionsText,
    'Field descriptions JSON',
    {},
  );

  const endpoint = {
    id,
    name,
    method,
    path,
    parameters,
    requestBody: {
      schema: requestSchema,
    },
    responseBody: {
      schema: responseSchema,
    },
    fieldDescriptions,
    testable: Boolean(form.testable),
    testServerUrl: form.testServerUrl.trim(),
  };

  const requestDescription = form.requestDescription?.trim();
  if (requestDescription) {
    endpoint.requestBody.description = requestDescription;
  }
  const responseDescription = form.responseDescription?.trim();
  if (responseDescription) {
    endpoint.responseBody.description = responseDescription;
  }
  if (!endpoint.requestBody.description) {
    delete endpoint.requestBody.description;
  }
  if (!endpoint.responseBody.description) {
    delete endpoint.responseBody.description;
  }
  if (!Object.keys(endpoint.fieldDescriptions || {}).length) {
    endpoint.fieldDescriptions = {};
  }
  if (!endpoint.testServerUrl) {
    delete endpoint.testServerUrl;
  }

  return endpoint;
}

export default function PosApiAdminPage() {
  const { t } = useContext(I18nContext);
  const { session, permissions } = useContext(AuthContext);
  const { addToast } = useToast();

  const hasAdmin = useMemo(
    () =>
      permissions?.permissions?.system_settings ||
      session?.permissions?.system_settings,
    [permissions?.permissions?.system_settings, session?.permissions?.system_settings],
  );

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [endpoints, setEndpoints] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [formValues, setFormValues] = useState(createEmptyForm);
  const [isCreating, setIsCreating] = useState(false);
  const [docUrl, setDocUrl] = useState('');
  const [docSnippets, setDocSnippets] = useState([]);
  const [docRaw, setDocRaw] = useState('');
  const [fetchingDoc, setFetchingDoc] = useState(false);

  useEffect(() => {
    if (!hasAdmin) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await fetch(`${API_BASE}/posapi/endpoints`, {
          credentials: 'include',
        });
        if (!res.ok) {
          throw new Error(`Failed to load registry (${res.status})`);
        }
        const data = await res.json();
        if (cancelled) return;
        const list = Array.isArray(data.endpoints) ? data.endpoints : [];
        setEndpoints(list);
        if (list.length) {
          setSelectedId(list[0].id);
          setFormValues(createFormState(list[0]));
          setIsCreating(false);
        } else {
          setSelectedId('');
          setFormValues(createEmptyForm());
          setIsCreating(true);
        }
      } catch (err) {
        if (!cancelled) {
          console.error(err);
          addToast(
            t(
              'posapi_admin_load_failed',
              'Failed to load POSAPI endpoints',
            ),
            'error',
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [hasAdmin, addToast, t]);

  useEffect(() => {
    if (selectedId) {
      const endpoint = endpoints.find((ep) => ep.id === selectedId);
      if (endpoint) {
        setFormValues(createFormState(endpoint));
        setIsCreating(false);
      }
    }
  }, [selectedId, endpoints]);

  if (!hasAdmin) {
    return <Navigate to="/" replace />;
  }

  function handleFieldChange(field, value) {
    setFormValues((prev) => ({ ...prev, [field]: value }));
  }

  function handleParameterChange(index, field, value) {
    setFormValues((prev) => {
      const params = prev.parameters ? [...prev.parameters] : [];
      params[index] = { ...params[index], [field]: value };
      return { ...prev, parameters: params };
    });
  }

  function handleToggleParamRequired(index) {
    setFormValues((prev) => {
      const params = prev.parameters ? [...prev.parameters] : [];
      params[index] = {
        ...params[index],
        required: !params[index]?.required,
      };
      return { ...prev, parameters: params };
    });
  }

  function handleAddParameter() {
    setFormValues((prev) => ({
      ...prev,
      parameters: [...(prev.parameters || []), { name: '', in: 'path', field: '', required: false }],
    }));
  }

  function handleRemoveParameter(index) {
    setFormValues((prev) => {
      const params = prev.parameters ? [...prev.parameters] : [];
      params.splice(index, 1);
      return { ...prev, parameters: params };
    });
  }

  function handleSelect(endpointId) {
    setDocSnippets([]);
    setDocRaw('');
    if (!endpointId) {
      setSelectedId('');
      setFormValues(createEmptyForm());
      setIsCreating(true);
      return;
    }
    setSelectedId(endpointId);
  }

  function applySnippet(snippet, target) {
    if (!snippet || typeof snippet !== 'object') return;
    const jsonText = JSON.stringify(snippet, null, 2);
    setFormValues((prev) => {
      if (target === 'request') {
        return { ...prev, requestSchemaText: jsonText };
      }
      if (target === 'response') {
        return { ...prev, responseSchemaText: jsonText };
      }
      if (target === 'fields') {
        return { ...prev, fieldDescriptionsText: jsonText };
      }
      return prev;
    });
  }

  async function handleFetchDoc(event) {
    event.preventDefault();
    if (!docUrl.trim()) return;
    setFetchingDoc(true);
    setDocSnippets([]);
    setDocRaw('');
    try {
      const res = await fetch(`${API_BASE}/posapi/endpoints/scrape`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: docUrl.trim() }),
        credentials: 'include',
      });
      if (!res.ok) {
        throw new Error(`Failed to fetch documentation (${res.status})`);
      }
      const data = await res.json();
      const snippets = Array.isArray(data.blocks) ? data.blocks : [];
      setDocSnippets(snippets);
      if (data.raw) {
        setDocRaw(data.raw);
      }
      if (snippets.length) {
        if (snippets[0]?.json) {
          applySnippet(snippets[0].json, 'request');
        }
        if (snippets[1]?.json) {
          applySnippet(snippets[1].json, 'response');
        }
        addToast(
          t(
            'posapi_admin_doc_success',
            'Fetched documentation snippets. Review before saving.',
          ),
          'success',
        );
      } else if (data.raw) {
        addToast(
          t(
            'posapi_admin_doc_no_json',
            'Fetched documentation but no JSON snippets were detected.',
          ),
          'info',
        );
      }
    } catch (err) {
      console.error(err);
      addToast(
        t(
          'posapi_admin_doc_failed',
          'Failed to fetch documentation',
        ),
        'error',
      );
    } finally {
      setFetchingDoc(false);
    }
  }

  function updateEndpointList(updatedEndpoint) {
    const next = [];
    let inserted = false;
    endpoints.forEach((ep) => {
      if (ep.id === updatedEndpoint.id) {
        next.push(updatedEndpoint);
        inserted = true;
      } else {
        next.push(ep);
      }
    });
    if (!inserted) {
      next.push(updatedEndpoint);
    }
    return next;
  }

  async function handleSave(event) {
    event.preventDefault();
    try {
      setSaving(true);
      const updatedEndpoint = buildEndpointFromForm(formValues);
      if (
        isCreating &&
        endpoints.some((ep) => ep.id === updatedEndpoint.id)
      ) {
        throw new Error('An endpoint with this ID already exists');
      }
      const nextEndpoints = isCreating
        ? [...endpoints, updatedEndpoint]
        : updateEndpointList(updatedEndpoint);
      const res = await fetch(`${API_BASE}/posapi/endpoints`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoints: nextEndpoints }),
        credentials: 'include',
      });
      if (!res.ok) {
        throw new Error(`Failed to save endpoints (${res.status})`);
      }
      const data = await res.json();
      const savedList = Array.isArray(data.endpoints)
        ? data.endpoints
        : nextEndpoints;
      setEndpoints(savedList);
      setSelectedId(updatedEndpoint.id);
      setIsCreating(false);
      addToast(
        t('posapi_admin_save_success', 'Endpoint saved successfully'),
        'success',
      );
    } catch (err) {
      console.error(err);
      addToast(err.message || 'Failed to save endpoint', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (isCreating || !selectedId) {
      setFormValues(createEmptyForm());
      setIsCreating(true);
      return;
    }
    const endpoint = endpoints.find((ep) => ep.id === selectedId);
    if (!endpoint) return;
    if (!window.confirm(t('posapi_admin_confirm_delete', 'Delete this endpoint?'))) {
      return;
    }
    try {
      setSaving(true);
      const nextEndpoints = endpoints.filter((ep) => ep.id !== selectedId);
      const res = await fetch(`${API_BASE}/posapi/endpoints`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoints: nextEndpoints }),
        credentials: 'include',
      });
      if (!res.ok) {
        throw new Error(`Failed to delete endpoint (${res.status})`);
      }
      const data = await res.json();
      const savedList = Array.isArray(data.endpoints)
        ? data.endpoints
        : nextEndpoints;
      setEndpoints(savedList);
      if (savedList.length) {
        setSelectedId(savedList[0].id);
        setIsCreating(false);
      } else {
        setSelectedId('');
        setFormValues(createEmptyForm());
        setIsCreating(true);
      }
      addToast(
        t('posapi_admin_delete_success', 'Endpoint removed from registry'),
        'success',
      );
    } catch (err) {
      console.error(err);
      addToast(err.message || 'Failed to delete endpoint', 'error');
    } finally {
      setSaving(false);
    }
  }

  const sortedEndpoints = useMemo(
    () =>
      [...endpoints].sort((a, b) => a.name.localeCompare(b.name)),
    [endpoints],
  );

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold mb-1">
          {t('posapi_admin_title', 'POSAPI endpoint registry')}
        </h1>
        <p className="text-slate-600 max-w-3xl">
          {t(
            'posapi_admin_intro',
            'Manage dynamic POSAPI endpoint definitions used by transaction forms.',
          )}
        </p>
      </div>
      <div className="flex flex-col gap-6 lg:flex-row">
        <div className="lg:w-1/3 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium">
              {t('posapi_admin_endpoints', 'Endpoints')}
            </h2>
            <button
              type="button"
              onClick={() => handleSelect('')}
              className="px-3 py-1.5 rounded bg-green-600 text-white hover:bg-green-700"
            >
              {t('posapi_admin_add_endpoint', 'Add endpoint')}
            </button>
          </div>
          <div className="border rounded-md divide-y overflow-hidden">
            {loading && (
              <div className="p-4 text-center text-slate-500">
                {t('loading', 'Loading…')}
              </div>
            )}
            {!loading && !sortedEndpoints.length && (
              <div className="p-4 text-center text-slate-500">
                {t('posapi_admin_no_endpoints', 'No endpoints defined yet.')}
              </div>
            )}
            {sortedEndpoints.map((endpoint) => (
              <button
                key={endpoint.id}
                type="button"
                onClick={() => handleSelect(endpoint.id)}
                className={`w-full text-left px-4 py-3 transition hover:bg-slate-100 ${
                  endpoint.id === selectedId && !isCreating
                    ? 'bg-green-50 border-l-4 border-green-500'
                    : ''
                }`}
              >
                <div className="font-medium">{endpoint.name}</div>
                <div className="text-xs text-slate-500 truncate">
                  {endpoint.method} {endpoint.path}
                </div>
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1">
          <form
            onSubmit={handleSave}
            className="space-y-4 border rounded-lg p-6 bg-white shadow-sm"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="space-y-1">
                <span className="text-sm font-medium">
                  {t('posapi_admin_id', 'Endpoint ID')}
                </span>
                <input
                  type="text"
                  value={formValues.id}
                  onChange={(e) => handleFieldChange('id', e.target.value)}
                  className="w-full border rounded px-3 py-2"
                  placeholder="saveReceipt"
                  required
                />
              </label>
              <label className="space-y-1">
                <span className="text-sm font-medium">
                  {t('posapi_admin_name', 'Display name')}
                </span>
                <input
                  type="text"
                  value={formValues.name}
                  onChange={(e) => handleFieldChange('name', e.target.value)}
                  className="w-full border rounded px-3 py-2"
                  placeholder="Save B2C/B2B Receipt"
                />
              </label>
              <label className="space-y-1">
                <span className="text-sm font-medium">
                  {t('posapi_admin_method', 'HTTP method')}
                </span>
                <select
                  value={formValues.method}
                  onChange={(e) => handleFieldChange('method', e.target.value)}
                  className="w-full border rounded px-3 py-2"
                >
                  <option value="GET">GET</option>
                  <option value="POST">POST</option>
                  <option value="DELETE">DELETE</option>
                  <option value="PUT">PUT</option>
                  <option value="PATCH">PATCH</option>
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-sm font-medium">
                  {t('posapi_admin_path', 'Path')}
                </span>
                <input
                  type="text"
                  value={formValues.path}
                  onChange={(e) => handleFieldChange('path', e.target.value)}
                  className="w-full border rounded px-3 py-2"
                  placeholder="/rest/receipt"
                  required
                />
              </label>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">
                  {t('posapi_admin_parameters', 'Parameters')}
                </span>
                <button
                  type="button"
                  onClick={handleAddParameter}
                  className="px-3 py-1 rounded bg-slate-100 hover:bg-slate-200"
                >
                  {t('posapi_admin_add_parameter', 'Add parameter')}
                </button>
              </div>
              {!formValues.parameters?.length && (
                <p className="text-sm text-slate-500">
                  {t('posapi_admin_no_parameters', 'No parameters configured.')}
                </p>
              )}
              <div className="space-y-3">
                {formValues.parameters?.map((param, index) => (
                  <div
                    key={index}
                    className="grid grid-cols-1 lg:grid-cols-5 gap-3 border rounded-md p-3"
                  >
                    <label className="lg:col-span-1 space-y-1">
                      <span className="text-xs font-medium uppercase text-slate-500">
                        {t('posapi_admin_param_name', 'Name')}
                      </span>
                      <input
                        type="text"
                        value={param.name}
                        onChange={(e) =>
                          handleParameterChange(index, 'name', e.target.value)
                        }
                        className="w-full border rounded px-2 py-1"
                        placeholder="billId"
                      />
                    </label>
                    <label className="lg:col-span-1 space-y-1">
                      <span className="text-xs font-medium uppercase text-slate-500">
                        {t('posapi_admin_param_in', 'In')}
                      </span>
                      <select
                        value={param.in}
                        onChange={(e) =>
                          handleParameterChange(index, 'in', e.target.value)
                        }
                        className="w-full border rounded px-2 py-1"
                      >
                        <option value="path">path</option>
                        <option value="query">query</option>
                      </select>
                    </label>
                    <label className="lg:col-span-2 space-y-1">
                      <span className="text-xs font-medium uppercase text-slate-500">
                        {t('posapi_admin_param_field', 'Form field key')}
                      </span>
                      <input
                        type="text"
                        value={param.field}
                        onChange={(e) =>
                          handleParameterChange(index, 'field', e.target.value)
                        }
                        className="w-full border rounded px-2 py-1"
                        placeholder="receipt.billId"
                      />
                    </label>
                    <div className="flex items-end gap-2 lg:col-span-1">
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={Boolean(param.required)}
                          onChange={() => handleToggleParamRequired(index)}
                        />
                        {t('posapi_admin_param_required', 'Required')}
                      </label>
                      <button
                        type="button"
                        onClick={() => handleRemoveParameter(index)}
                        className="px-2 py-1 text-sm text-red-600 hover:bg-red-50 rounded"
                      >
                        {t('remove', 'Remove')}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="space-y-1">
                <span className="text-sm font-medium">
                  {t('posapi_admin_request_desc', 'Request description')}
                </span>
                <input
                  type="text"
                  value={formValues.requestDescription}
                  onChange={(e) =>
                    handleFieldChange('requestDescription', e.target.value)
                  }
                  className="w-full border rounded px-3 py-2"
                />
              </label>
              <label className="space-y-1">
                <span className="text-sm font-medium">
                  {t('posapi_admin_response_desc', 'Response description')}
                </span>
                <input
                  type="text"
                  value={formValues.responseDescription}
                  onChange={(e) =>
                    handleFieldChange('responseDescription', e.target.value)
                  }
                  className="w-full border rounded px-3 py-2"
                />
              </label>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <label className="space-y-2">
                <span className="text-sm font-medium">
                  {t('posapi_admin_request_json', 'Request body (JSON)')}
                </span>
                <textarea
                  value={formValues.requestSchemaText}
                  onChange={(e) =>
                    handleFieldChange('requestSchemaText', e.target.value)
                  }
                  className="w-full border rounded px-3 py-2 font-mono text-xs"
                  rows={12}
                  placeholder={`{
  "receipts": []
}`}
                />
              </label>
              <label className="space-y-2">
                <span className="text-sm font-medium">
                  {t('posapi_admin_response_json', 'Response body (JSON)')}
                </span>
                <textarea
                  value={formValues.responseSchemaText}
                  onChange={(e) =>
                    handleFieldChange('responseSchemaText', e.target.value)
                  }
                  className="w-full border rounded px-3 py-2 font-mono text-xs"
                  rows={12}
                  placeholder={`{
  "status": "SUCCESS"
}`}
                />
              </label>
            </div>

            <label className="space-y-2 block">
              <span className="text-sm font-medium">
                {t('posapi_admin_field_descriptions', 'Field descriptions (JSON map)')}
              </span>
              <textarea
                value={formValues.fieldDescriptionsText}
                onChange={(e) =>
                  handleFieldChange('fieldDescriptionsText', e.target.value)
                }
                className="w-full border rounded px-3 py-2 font-mono text-xs"
                rows={6}
                placeholder="{\n  \"totalAmount\": \"Total receipt amount\"\n}"
              />
            </label>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={Boolean(formValues.testable)}
                  onChange={(e) => handleFieldChange('testable', e.target.checked)}
                />
                <span className="text-sm">
                  {t('posapi_admin_testable', 'Supports test server')}
                </span>
              </label>
              <label className="space-y-1">
                <span className="text-sm font-medium">
                  {t('posapi_admin_test_url', 'Test server URL')}
                </span>
                <input
                  type="text"
                  value={formValues.testServerUrl}
                  onChange={(e) =>
                    handleFieldChange('testServerUrl', e.target.value)
                  }
                  className="w-full border rounded px-3 py-2"
                  placeholder="https://posapi-test.tax.gov.mn"
                />
              </label>
            </div>

            <div className="border rounded-md p-4 space-y-3 bg-slate-50">
              <h3 className="text-sm font-semibold">
                {t('posapi_admin_fetch_doc', 'Fetch from documentation')}
              </h3>
              <p className="text-xs text-slate-600">
                {t(
                  'posapi_admin_fetch_doc_hint',
                  'Provide a Stoplight or API documentation URL containing JSON examples. The tool will attempt to extract request and response payloads automatically.',
                )}
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                <input
                  type="url"
                  value={docUrl}
                  onChange={(e) => setDocUrl(e.target.value)}
                  className="flex-1 border rounded px-3 py-2"
                  placeholder="https://developer.itc.gov.mn/docs/ebarimt-api/..."
                />
                <button
                  type="button"
                  onClick={handleFetchDoc}
                  disabled={fetchingDoc || !docUrl.trim()}
                  className="px-4 py-2 rounded bg-blue-600 text-white disabled:opacity-60"
                >
                  {fetchingDoc
                    ? t('posapi_admin_fetching', 'Fetching…')
                    : t('posapi_admin_fetch_button', 'Fetch JSON')}
                </button>
              </div>
              {docSnippets.length > 0 && (
                <div className="space-y-3">
                  <p className="text-xs text-slate-600">
                    {t(
                      'posapi_admin_apply_snippet',
                      'Click a button below to apply the fetched JSON to the request, response or field descriptions.',
                    )}
                  </p>
                  {docSnippets.map((snippet, index) => (
                    <div
                      key={index}
                      className="border rounded bg-white p-3 space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">
                          {snippet.label || t('snippet', 'Snippet')} #{index + 1}
                        </span>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => applySnippet(snippet.json, 'request')}
                            className="px-2 py-1 text-xs rounded bg-green-100 text-green-700"
                          >
                            {t('posapi_admin_use_request', 'Use as request')}
                          </button>
                          <button
                            type="button"
                            onClick={() => applySnippet(snippet.json, 'response')}
                            className="px-2 py-1 text-xs rounded bg-blue-100 text-blue-700"
                          >
                            {t('posapi_admin_use_response', 'Use as response')}
                          </button>
                          <button
                            type="button"
                            onClick={() => applySnippet(snippet.json, 'fields')}
                            className="px-2 py-1 text-xs rounded bg-amber-100 text-amber-700"
                          >
                            {t('posapi_admin_use_fields', 'Use as field descriptions')}
                          </button>
                        </div>
                      </div>
                      <pre className="bg-slate-900 text-slate-100 text-xs rounded p-3 overflow-auto max-h-48">
                        {JSON.stringify(snippet.json, null, 2)}
                      </pre>
                    </div>
                  ))}
                </div>
              )}
              {!docSnippets.length && docRaw && (
                <div className="text-xs text-slate-600 whitespace-pre-wrap border rounded bg-white p-3">
                  {docRaw}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between pt-4 border-t">
              <button
                type="button"
                onClick={handleDelete}
                className="px-4 py-2 rounded border border-red-200 text-red-600 hover:bg-red-50"
                disabled={saving}
              >
                {isCreating
                  ? t('posapi_admin_clear', 'Clear form')
                  : t('delete', 'Delete')}
              </button>
              <div className="flex gap-3">
                <button
                  type="submit"
                  className="px-4 py-2 rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-60"
                  disabled={saving}
                >
                  {saving
                    ? t('posapi_admin_saving', 'Saving…')
                    : t('save', 'Save')}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
