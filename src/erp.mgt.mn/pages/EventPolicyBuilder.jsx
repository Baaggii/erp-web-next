import React, { useContext, useEffect, useMemo, useState } from 'react';
import { AuthContext } from '../context/AuthContext.jsx';
import PolicyEventSelector from '../components/PolicyEventSelector.jsx';
import PolicySelector from '../components/PolicySelector.jsx';
import PolicySimulationPanel from '../components/PolicySimulationPanel.jsx';
import PolicyVersionHistory from '../components/PolicyVersionHistory.jsx';
import GraphEditor from '../components/GraphEditor.jsx';
import { convertLegacyPolicyToGraph } from '../utils/graphPolicy.js';

const defaultGraph = {
  version: 1,
  nodes: [
    { id: 'node_trigger', type: 'trigger', properties: { eventType: '' }, nextIds: ['node_action_1'] },
    { id: 'node_action_1', type: 'action', properties: { type: 'notify', message: '' }, nextIds: [] },
  ],
};

const defaultDraft = {
  policy_name: '',
  policy_key: '',
  event_type: '',
  module_key: '',
  priority: 100,
  is_active: false,
  condition_json: { logic: 'and', rules: [] },
  action_json: { actions: [] },
  graph_json: defaultGraph,
};

export default function EventPolicyBuilder() {
  const { session } = useContext(AuthContext);
  const canEdit = Boolean(session?.permissions?.system_settings);
  const [draft, setDraft] = useState(defaultDraft);
  const [eventTypes, setEventTypes] = useState([]);
  const [policies, setPolicies] = useState([]);
  const [selectedPolicyId, setSelectedPolicyId] = useState('');
  const [loadingPolicy, setLoadingPolicy] = useState(false);
  const [loadedPolicy, setLoadedPolicy] = useState(null);
  const [moduleKeys, setModuleKeys] = useState([]);
  const [transactionTypes, setTransactionTypes] = useState([]);
  const [procedureNames, setProcedureNames] = useState([]);
  const [versions, setVersions] = useState([]);
  const [simulationResult, setSimulationResult] = useState(null);
  const [simulationInput, setSimulationInput] = useState({ eventType: '', payloadText: '{}', companyId: '', branchId: '' });

  useEffect(() => {
    if (!canEdit) return;
    fetch('/api/events/list', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : []))
      .then((rows) => {
        const types = Array.from(new Set((rows || []).map((row) => row?.event_type).filter(Boolean))).sort();
        setEventTypes(types);
      })
      .catch(() => setEventTypes([]));

    fetch('/api/event-policies/list', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : []))
      .then((rows) => setPolicies(Array.isArray(rows) ? rows : []))
      .catch(() => setPolicies([]));

    fetch('/api/modules', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : []))
      .then((rows) => setModuleKeys(Array.from(new Set((rows || []).map((row) => row?.module_key).filter(Boolean))).sort()))
      .catch(() => setModuleKeys([]));

    fetch('/api/transaction_forms', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : {}))
      .then((data) => setTransactionTypes(Object.keys(data || {}).filter((key) => key !== 'isDefault').sort()))
      .catch(() => setTransactionTypes([]));

    fetch('/api/procedures', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : { procedures: [] }))
      .then((data) => setProcedureNames((data?.procedures || []).map((entry) => (typeof entry === 'string' ? entry : entry?.name)).filter(Boolean)))
      .catch(() => setProcedureNames([]));
  }, [canEdit]);

  const validationMessages = useMemo(() => {
    const messages = [];
    if (!draft.policy_name?.trim()) messages.push('Policy name is required.');
    if (!draft.policy_key?.trim()) messages.push('Policy key is required.');
    const nodes = draft.graph_json?.nodes || [];
    if (!nodes.some((node) => node.type === 'trigger')) messages.push('Graph needs a trigger node.');
    if (!nodes.some((node) => node.type === 'action')) messages.push('Graph needs at least one action node.');
    return messages;
  }, [draft]);

  const updateDraftField = (key, value) => setDraft((prev) => ({ ...prev, [key]: value }));

  const loadSelectedPolicy = async () => {
    if (!selectedPolicyId) return;
    setLoadingPolicy(true);
    try {
      const res = await fetch(`/api/event-policies/${selectedPolicyId}`, { credentials: 'include' });
      if (!res.ok) return;
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
        graph_json: data.graph_json || convertLegacyPolicyToGraph({ eventType: data.event_type, conditionJson: data.condition_json, actionJson: data.action_json }),
      });
      setLoadedPolicy(data);
    } finally {
      setLoadingPolicy(false);
    }
  };

  const convertLegacy = () => {
    const graphJson = convertLegacyPolicyToGraph({ eventType: draft.event_type, conditionJson: draft.condition_json, actionJson: draft.action_json });
    updateDraftField('graph_json', graphJson);
  };

  const saveDraft = async () => {
    const res = await fetch('/api/event-policies/drafts', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(draft),
    });
    const data = await res.json();
    if (data?.policy_draft_id) {
      const deployRes = await fetch(`/api/event-policies/deploy/${data.policy_draft_id}`, { method: 'POST', credentials: 'include' });
      const deploy = await deployRes.json();
      if (deploy.policy_id) {
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
      body: JSON.stringify({ eventType: simulationInput.eventType || draft.event_type, payload, companyId: simulationInput.companyId, branchId: simulationInput.branchId, graph_json: draft.graph_json }),
    });
    setSimulationResult(await res.json());
  };

  if (!canEdit) return <div>You need system_settings permission to author policies.</div>;

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

      <h3>Event Trigger</h3>
      <PolicyEventSelector form={draft} eventTypes={eventTypes} moduleKeys={moduleKeys} onChange={updateDraftField} />

      <button type="button" onClick={convertLegacy} style={{ marginBottom: 10 }}>Convert to Visual Flow</button>

      <GraphEditor
        graphJson={draft.graph_json || defaultGraph}
        eventType={draft.event_type}
        onChange={(value) => updateDraftField('graph_json', value)}
        transactionTypes={transactionTypes}
        procedureNames={procedureNames}
      />

      <PolicySimulationPanel
        simulationInput={simulationInput}
        onInputChange={(key, value) => setSimulationInput((prev) => ({ ...prev, [key]: value }))}
        onRun={runSimulation}
        result={simulationResult}
      />

      {validationMessages.length > 0 ? (
        <div style={{ color: '#b45309', margin: '8px 0' }}><ul>{validationMessages.map((message) => <li key={message}>{message}</li>)}</ul></div>
      ) : <div style={{ color: '#166534', margin: '8px 0' }}>Validation: looks good.</div>}

      <button type="button" onClick={saveDraft} disabled={validationMessages.length > 0}>Save Draft + Deploy</button>
      <h3>Policy Version History</h3>
      <PolicyVersionHistory versions={versions} />
    </div>
  );
}
