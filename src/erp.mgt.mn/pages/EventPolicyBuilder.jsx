import React, { useContext, useEffect, useState } from 'react';
import { AuthContext } from '../context/AuthContext.jsx';
import PolicyEventSelector from '../components/PolicyEventSelector.jsx';
import ConditionGroupBuilder from '../components/ConditionGroupBuilder.jsx';
import ActionListBuilder from '../components/ActionListBuilder.jsx';
import PolicySimulationPanel from '../components/PolicySimulationPanel.jsx';
import PolicyVersionHistory from '../components/PolicyVersionHistory.jsx';

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

export default function EventPolicyBuilder() {
  const { session } = useContext(AuthContext);
  const canEdit = Boolean(session?.permissions?.system_settings);
  const [draft, setDraft] = useState(defaultDraft);
  const [eventTypes, setEventTypes] = useState([]);
  const [moduleKeys, setModuleKeys] = useState([]);
  const [transactionTypes, setTransactionTypes] = useState([]);
  const [procedureNames, setProcedureNames] = useState([]);
  const [versions, setVersions] = useState([]);
  const [simulationResult, setSimulationResult] = useState(null);
  const [simulationInput, setSimulationInput] = useState({ eventType: '', payloadText: '{"shortageQty":12}', companyId: '', branchId: '' });

  useEffect(() => {
    if (!canEdit) return;
    fetch('/api/event-policies/event-types', { credentials: 'include' })
      .then((res) => res.json())
      .then((rows) => {
        setEventTypes(rows || []);
        if (rows?.[0]) setDraft((prev) => ({ ...prev, event_type: prev.event_type || rows[0] }));
      });
  }, [canEdit]);

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

  const parsePayloadFields = (payloadText) => {
    try {
      const payload = JSON.parse(payloadText || '{}');
      if (!payload || typeof payload !== 'object') return { fields: [], fieldTypes: {} };
      const entries = [];
      const fieldTypes = {};
      const visit = (value, prefix = 'payload') => {
        if (Array.isArray(value)) {
          fieldTypes[prefix] = 'array';
          entries.push(prefix);
          return;
        }
        if (value && typeof value === 'object') {
          Object.entries(value).forEach(([k, v]) => visit(v, `${prefix}.${k}`));
          return;
        }
        const type = value === null ? 'text' : typeof value;
        fieldTypes[prefix] = type;
        entries.push(prefix);
      };
      Object.entries(payload).forEach(([k, v]) => visit(v, `payload.${k}`));
      return { fields: entries.sort(), fieldTypes };
    } catch {
      return { fields: [], fieldTypes: {} };
    }
  };

  const { fields: payloadFields, fieldTypes } = parsePayloadFields(simulationInput.payloadText);

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

  if (!canEdit) return <div>You need system_settings permission to author policies.</div>;

  const updateDraftField = (key, value) => setDraft((prev) => ({ ...prev, [key]: value }));

  const saveDraft = async () => {
    const res = await fetch('/api/event-policies/drafts', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(draft),
    });
    const data = await res.json();
    if (data?.policy_draft_id) {
      const deployRes = await fetch(`/api/event-policies/deploy/${data.policy_draft_id}`, {
        method: 'POST', credentials: 'include',
      });
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
      body: JSON.stringify({ eventType: simulationInput.eventType || draft.event_type, payload, companyId: simulationInput.companyId, branchId: simulationInput.branchId }),
    });
    setSimulationResult(await res.json());
  };

  return (
    <div>
      <h2>Visual Policy Authoring UI</h2>
      <PolicyEventSelector form={draft} eventTypes={eventTypes} moduleKeys={moduleKeys} onChange={updateDraftField} />
      <ConditionGroupBuilder
        condition={draft.condition_json}
        fieldOptions={payloadFields}
        fieldTypes={fieldTypes}
        onChange={(value) => updateDraftField('condition_json', value)}
      />
      <ActionListBuilder
        actionJson={draft.action_json}
        transactionTypes={transactionTypes}
        procedureNames={procedureNames}
        payloadFields={payloadFields}
        onChange={(value) => updateDraftField('action_json', value)}
      />
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
        <summary>Live JSON preview</summary>
        <pre>{JSON.stringify({ condition_json: draft.condition_json, action_json: draft.action_json }, null, 2)}</pre>
      </details>
      <button type="button" onClick={saveDraft}>Save Draft + Deploy</button>
      <PolicyVersionHistory versions={versions} />
    </div>
  );
}
