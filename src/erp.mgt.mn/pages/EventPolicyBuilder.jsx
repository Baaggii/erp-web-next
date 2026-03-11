import React, { useContext, useEffect, useMemo, useState } from 'react';
import { useToast } from '../context/ToastContext.jsx';
import useGeneralConfig from '../hooks/useGeneralConfig.js';
import { AuthContext } from '../context/AuthContext.jsx';
import PolicyEventSelector from '../components/PolicyEventSelector.jsx';
import PolicySelector from '../components/PolicySelector.jsx';
import ConditionGroupBuilder from '../components/ConditionGroupBuilder.jsx';
import ActionListBuilder from '../components/ActionListBuilder.jsx';
import PolicySimulationPanel from '../components/PolicySimulationPanel.jsx';
import PolicyVersionHistory from '../components/PolicyVersionHistory.jsx';
import PayloadExplorer from '../components/PayloadExplorer.jsx';
import normalizeBoolean from '../utils/normalizeBoolean.js';

const defaultDraft = {
  policy_name: '',
  policy_key: '',
  event_type: '',
  module_key: '',
  priority: 100,
  is_active: false,
  condition_json: { logic: 'and', rules: [] },
  action_json: { actions: [] },
};

function slugifyPolicyKey(value = '') {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export default function EventPolicyBuilder() {
  const { session } = useContext(AuthContext);
  const { addToast } = useToast();
  const generalConfig = useGeneralConfig();
  const eventsPolicyCfg = generalConfig?.eventsPolicy || {};
  const isSystemAdmin = Boolean(session?.permissions?.system_settings);
  const eventToastEnabled = normalizeBoolean(eventsPolicyCfg.eventToastEnabled, false);
  const policyToastEnabled = normalizeBoolean(eventsPolicyCfg.policyToastEnabled, false);

  const maybeToastEvent = (message, type = 'info') => {
    if (!isSystemAdmin || !eventToastEnabled) return;
    addToast(message, type);
  };

  const maybeToastPolicy = (message, type = 'info') => {
    if (!isSystemAdmin || !policyToastEnabled) return;
    addToast(message, type);
  };
  const canEdit = Boolean(session?.permissions?.system_settings);
  const [draft, setDraft] = useState(defaultDraft);
  const [eventTypes, setEventTypes] = useState([]);
  const [observedEvents, setObservedEvents] = useState([]);
  const [policies, setPolicies] = useState([]);
  const [scenarios, setScenarios] = useState([]);
  const [selectedScenarioKey, setSelectedScenarioKey] = useState('');
  const [selectedPolicyId, setSelectedPolicyId] = useState('');
  const [loadingPolicy, setLoadingPolicy] = useState(false);
  const [loadedPolicy, setLoadedPolicy] = useState(null);
  const [moduleKeys, setModuleKeys] = useState([]);
  const [transactionTypes, setTransactionTypes] = useState([]);
  const [procedureNames, setProcedureNames] = useState([]);
  const [versions, setVersions] = useState([]);
  const [simulationResult, setSimulationResult] = useState(null);
  const [simulationInput, setSimulationInput] = useState({ eventType: '', payloadText: '{}', companyId: '', branchId: '' });
  const [payloadFields, setPayloadFields] = useState([]);
  const [samplePayload, setSamplePayload] = useState({});
  const [selectedField, setSelectedField] = useState('');

  useEffect(() => {
    if (!canEdit) return;

    fetch('/api/events/list', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : []))
      .then((rows) => {
        const list = Array.isArray(rows) ? rows : [];
        setObservedEvents(list);
        const types = Array.from(new Set(list.map((row) => row?.event_type).filter(Boolean))).sort();
        setEventTypes(types);
        if (types?.[0]) setDraft((prev) => ({ ...prev, event_type: prev.event_type || types[0] }));
        maybeToastEvent(`Loaded ${types.length} event types`, 'success');
      })
      .catch(() => {
        setObservedEvents([]);
        setEventTypes([]);
        maybeToastEvent('Failed to load events list', 'error');
      });

    fetch('/api/event-policies/list', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : []))
      .then((rows) => {
        const list = Array.isArray(rows) ? rows : [];
        setPolicies(list);
        maybeToastPolicy(`Loaded ${list.length} policies`, 'success');
      })
      .catch(() => {
        setPolicies([]);
        maybeToastPolicy('Failed to load policies', 'error');
      });

    fetch('/api/event-policies/scenarios', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : []))
      .then((rows) => {
        const list = Array.isArray(rows) ? rows : [];
        setScenarios(list);
        maybeToastPolicy(`Loaded ${list.length} policy scenarios`, 'success');
      })
      .catch(() => {
        setScenarios([]);
        maybeToastPolicy('Failed to load policy scenarios', 'error');
      });
  }, [canEdit, eventToastEnabled, policyToastEnabled, isSystemAdmin]);

  useEffect(() => {
    const fallbackCompanyId = session?.company_id ?? session?.companyId ?? session?.company ?? '';
    const fallbackBranchId = session?.branch_id ?? session?.branchId ?? session?.branch ?? '';
    setSimulationInput((prev) => ({
      ...prev,
      companyId: prev.companyId || String(fallbackCompanyId || ''),
      branchId: prev.branchId || String(fallbackBranchId || ''),
    }));
  }, [session]);

  useEffect(() => {
    if (!canEdit) return;

    fetch('/api/modules', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : []))
      .then((rows) => {
        const keys = Array.from(new Set((rows || []).map((row) => row?.module_key).filter(Boolean))).sort();
        setModuleKeys(keys);
      })
      .catch(() => setModuleKeys([]));

    fetch('/api/transaction_forms', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : {}))
      .then((data) => {
        const items = Object.entries(data || {})
          .filter(([key, value]) => key !== 'isDefault' && value && typeof value === 'object')
          .map(([name]) => name)
          .sort();
        setTransactionTypes(items);
      })
      .catch(() => setTransactionTypes([]));

    fetch('/api/procedures', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : { procedures: [] }))
      .then((data) => {
        const list = Array.isArray(data?.procedures)
          ? data.procedures.map((entry) => (typeof entry === 'string' ? entry : entry?.name)).filter(Boolean)
          : [];
        setProcedureNames(Array.from(new Set(list)).sort());
      })
      .catch(() => setProcedureNames([]));
  }, [canEdit]);

  useEffect(() => {
    if (!canEdit || !draft.event_type) {
      setPayloadFields([]);
      setSamplePayload({});
      return;
    }

    fetch(`/api/events/fields/${encodeURIComponent(draft.event_type)}`, { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : { fields: [] }))
      .then((data) => setPayloadFields(Array.isArray(data?.fields) ? data.fields : []))
      .catch(() => setPayloadFields([]));

    fetch(`/api/events/sample/${encodeURIComponent(draft.event_type)}`, { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : { payload: {} }))
      .then((data) => {
        const payload = data?.payload && typeof data.payload === 'object' ? data.payload : {};
        setSamplePayload(payload);
        setSimulationInput((prev) => ({ ...prev, eventType: draft.event_type, payloadText: JSON.stringify(payload, null, 2) }));
      })
      .catch(() => setSamplePayload({}));
  }, [canEdit, draft.event_type]);

  const highlightedSampleValue = useMemo(() => {
    if (!selectedField) return undefined;
    const normalizedPath = selectedField.startsWith('payload.') ? selectedField.slice('payload.'.length) : selectedField;
    if (!normalizedPath) return samplePayload;
    return normalizedPath
      .split('.')
      .reduce((acc, key) => (acc && typeof acc === 'object' ? acc[key] : undefined), samplePayload);
  }, [samplePayload, selectedField]);

  const fieldTypes = useMemo(() => {
    const map = {};
    payloadFields.forEach((field) => {
      map[field.path] = field.type;
    });
    return map;
  }, [payloadFields]);

  const validationMessages = [];
  if (!draft.policy_name?.trim()) validationMessages.push('Policy name is required.');
  if (!draft.policy_key?.trim()) validationMessages.push('Policy key is required.');
  if (!draft.event_type?.trim()) validationMessages.push('Event type is required.');
  if ((draft.condition_json?.rules || []).some((rule) => !rule?.field || !rule?.operator)) {
    validationMessages.push('Every condition needs a field and operator.');
  }
  if ((draft.action_json?.actions || []).some((action) => !action?.type)) {
    validationMessages.push('Every action needs an action type.');
  }

  const invalidMapping = (draft.action_json?.actions || []).some((action) => {
    const mapping = action?.mapping || {};
    return Object.values(mapping).some((source) => {
      if (!source) return false;
      if (source === 'source.recordId' || source === 'system.now') return false;
      return !payloadFields.some((field) => field.path === source);
    });
  });
  if (invalidMapping) validationMessages.push('Action mapping source fields must exist in Payload Explorer (or be source.recordId/system.now).');

  if (!canEdit) return <div>You need system_settings permission to author policies.</div>;

  const updateDraftField = (key, value) => setDraft((prev) => ({ ...prev, [key]: value }));

  const applyScenario = (scenarioKey) => {
    setSelectedScenarioKey(scenarioKey);
    const selected = scenarios.find((entry) => entry.scenario_key === scenarioKey);
    if (!selected) return;
    setDraft((prev) => ({
      ...prev,
      event_type: selected.event_type || prev.event_type,
      condition_json: selected.default_condition_json || { logic: 'and', rules: [] },
      action_json: selected.default_action_json || { actions: [] },
      policy_name: selected.default_policy_name || selected.scenario_name || prev.policy_name,
      policy_key: selected.default_policy_key || slugifyPolicyKey(selected.scenario_key || selected.scenario_name || prev.policy_key),
      is_active: true,
    }));
  };

  const loadSelectedPolicy = async () => {
    if (!selectedPolicyId) return;
    setLoadingPolicy(true);
    try {
      const res = await fetch(`/api/event-policies/${selectedPolicyId}`, { credentials: 'include' });
      if (!res.ok) {
        maybeToastPolicy('Failed to load selected policy', 'error');
        return;
      }
      const data = await res.json();
      setDraft({
        policy_name: data.policy_name || '',
        policy_key: data.policy_key || '',
        event_type: data.event_type || '',
        module_key: data.module_key || '',
        priority: Number(data.priority || 100),
        is_active: Boolean(data.is_active),
        condition_json: data.condition_json || { logic: 'and', rules: [] },
        action_json: data.action_json || { actions: [] },
      });
      setLoadedPolicy(data);
      setSelectedScenarioKey('');
      maybeToastPolicy(`Loaded policy: ${data.policy_name || data.policy_key || selectedPolicyId}`, 'success');
    } finally {
      setLoadingPolicy(false);
    }
  };

  const saveDraft = async () => {
    const res = await fetch('/api/event-policies/drafts', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(draft),
    });
    if (!res.ok) {
      maybeToastPolicy('Failed to save policy draft', 'error');
      return;
    }
    const data = await res.json();
    if (data?.policy_draft_id) {
      maybeToastPolicy(`Policy draft saved: #${data.policy_draft_id}`, 'success');
      const deployRes = await fetch(`/api/event-policies/deploy/${data.policy_draft_id}`, {
        method: 'POST', credentials: 'include',
      });
      if (!deployRes.ok) {
        maybeToastPolicy('Policy deploy failed', 'error');
        return;
      }
      const deploy = await deployRes.json();
      if (deploy.policy_id) {
        maybeToastPolicy(`Policy deployed: #${deploy.policy_id}`, 'success');
        const versionsRes = await fetch(`/api/event-policies/${deploy.policy_id}/versions`, { credentials: 'include' });
        setVersions(await versionsRes.json());
      }
    }
  };

  const runSimulation = async () => {
    let payload = {};
    try { payload = JSON.parse(simulationInput.payloadText || '{}'); } catch {}
    const res = await fetch('/api/events/simulate', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventType: simulationInput.eventType || draft.event_type, payload, companyId: simulationInput.companyId, branchId: simulationInput.branchId }),
    });
    const body = await res.json();
    setSimulationResult(body);
    if (res.ok) {
      maybeToastEvent('Event simulation completed', 'success');
      maybeToastPolicy('Policy simulation completed', 'success');
    } else {
      maybeToastEvent('Event simulation failed', 'error');
      maybeToastPolicy('Policy simulation failed', 'error');
    }
  };

  return (
    <div>
      <h2>Visual Policy Authoring UI</h2>
      <PolicySelector
        policies={policies}
        selectedPolicyId={selectedPolicyId}
        onSelectPolicy={setSelectedPolicyId}
        onLoadPolicy={loadSelectedPolicy}
        loading={loadingPolicy}
        currentPolicy={loadedPolicy}
      />

      <div style={{ marginBottom: 16, border: '1px solid #e5e7eb', borderRadius: 8, padding: 12, background: '#f8fafc' }}>
        <h3 style={{ marginTop: 0 }}>Event Wizard</h3>
        <div style={{ color: '#4b5563', marginBottom: 8 }}>Choose a scenario to auto-generate event type, conditions, and actions.</div>
        <label>
          Scenario
          <select value={selectedScenarioKey} onChange={(e) => applyScenario(e.target.value)} style={{ display: 'block', width: '100%', maxWidth: 480 }}>
            <option value="">-- Select Scenario --</option>
            {scenarios.map((scenario) => (
              <option key={scenario.scenario_key} value={scenario.scenario_key}>
                {scenario.scenario_name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, alignItems: 'start' }}>
        <div style={{ marginBottom: 16, border: '1px solid #e5e7eb', borderRadius: 8, padding: 12 }}>
          <h3 style={{ marginTop: 0 }}>Existing Policies</h3>
          <div style={{ color: '#6b7280' }}>{policies.length} policies found</div>
        </div>
        <div style={{ marginBottom: 16, border: '1px solid #e5e7eb', borderRadius: 8, padding: 12 }}>
          <h3 style={{ marginTop: 0 }}>Observed Events</h3>
          {observedEvents.length === 0 ? (
            <div style={{ color: '#6b7280' }}>No events found.</div>
          ) : (
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              {observedEvents.map((evt, idx) => (
                <li key={`${evt.event_type}-${idx}`}>
                  <button
                    type="button"
                    style={{ border: 'none', background: 'transparent', color: '#2563eb', cursor: 'pointer', padding: 0 }}
                    onClick={() => updateDraftField('event_type', evt.event_type)}
                  >
                    {evt.event_type}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <PayloadExplorer
          fields={payloadFields}
          selectedField={selectedField}
          onSelectField={(fieldPath) => {
            setSelectedField(fieldPath);
            const currentRules = Array.isArray(draft.condition_json?.rules) ? draft.condition_json.rules : [];
            updateDraftField('condition_json', {
              ...(draft.condition_json || { logic: 'and', rules: [] }),
              rules: [...currentRules, { field: fieldPath, operator: '=', value: '' }],
            });
          }}
        />
      </div>

      <h3>Event Trigger</h3>
      <PolicyEventSelector form={draft} eventTypes={eventTypes} moduleKeys={moduleKeys} onChange={updateDraftField} />

      <ConditionGroupBuilder
        condition={draft.condition_json}
        fields={payloadFields}
        fieldTypes={fieldTypes}
        highlightedField={selectedField}
        onFieldHighlight={setSelectedField}
        onChange={(value) => updateDraftField('condition_json', value)}
      />
      <ActionListBuilder
        actionJson={draft.action_json}
        transactionTypes={transactionTypes}
        procedureNames={procedureNames}
        payloadFields={payloadFields.map((field) => field.path)}
        highlightedField={selectedField}
        onFieldHighlight={setSelectedField}
        onChange={(value) => updateDraftField('action_json', value)}
      />

      <div style={{ marginBottom: 16, border: '1px solid #e5e7eb', borderRadius: 8, padding: 12 }}>
        <h3 style={{ marginTop: 0 }}>Sample Event Payload</h3>
        {selectedField ? <div style={{ marginBottom: 8, color: '#1d4ed8' }}>Highlighted field: <code>{selectedField}</code></div> : null}
        <pre>{JSON.stringify(samplePayload, null, 2)}</pre>
        {selectedField ? <pre style={{ background: '#eff6ff', padding: 8, borderRadius: 6 }}>
{JSON.stringify({ [selectedField]: highlightedSampleValue }, null, 2)}
        </pre> : null}
      </div>

      <h3>Test Sandbox</h3>
      <PolicySimulationPanel
        simulationInput={simulationInput}
        onInputChange={(key, value) => setSimulationInput((prev) => ({ ...prev, [key]: value }))}
        onRun={runSimulation}
        result={simulationResult}
      />
      {validationMessages.length > 0 ? (
        <div style={{ color: '#b45309', margin: '8px 0' }}>
          <strong>Validation:</strong>
          <ul>
            {validationMessages.map((message) => <li key={message}>{message}</li>)}
          </ul>
        </div>
      ) : (
        <div style={{ color: '#166534', margin: '8px 0' }}>Validation: looks good.</div>
      )}
      <details>
        <summary>Live JSON Preview</summary>
        <pre>{JSON.stringify({ condition_json: draft.condition_json, action_json: draft.action_json }, null, 2)}</pre>
      </details>
      <button type="button" onClick={saveDraft}>Save Draft + Deploy</button>
      <h3>Policy Version History</h3>
      <PolicyVersionHistory versions={versions} />
    </div>
  );
}
