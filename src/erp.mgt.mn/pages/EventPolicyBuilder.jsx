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
      <PolicyEventSelector form={draft} eventTypes={eventTypes} onChange={updateDraftField} />
      <ConditionGroupBuilder condition={draft.condition_json} onChange={(value) => updateDraftField('condition_json', value)} />
      <ActionListBuilder actionJson={draft.action_json} onChange={(value) => updateDraftField('action_json', value)} />
      <PolicySimulationPanel
        simulationInput={simulationInput}
        onInputChange={(key, value) => setSimulationInput((prev) => ({ ...prev, [key]: value }))}
        onRun={runSimulation}
        result={simulationResult}
      />
      <button type="button" onClick={saveDraft}>Save Draft + Deploy</button>
      <PolicyVersionHistory versions={versions} />
    </div>
  );
}
