import React from 'react';

export default function PolicySimulationPanel({ simulationInput, onInputChange, onRun, result }) {
  return (
    <div style={{ marginTop: 12 }}>
      <h3>Test Sandbox</h3>
      <label>Event Type<input value={simulationInput.eventType} onChange={(e) => onInputChange('eventType', e.target.value)} /></label>
      <label>Company<input value={simulationInput.companyId} onChange={(e) => onInputChange('companyId', e.target.value)} /></label>
      <label>Branch<input value={simulationInput.branchId} onChange={(e) => onInputChange('branchId', e.target.value)} /></label>
      <label>Event Payload JSON<textarea value={simulationInput.payloadText} onChange={(e) => onInputChange('payloadText', e.target.value)} rows={6} /></label>
      <button type="button" onClick={onRun}>Run Simulation</button>
      {result ? (
        <div>
          <h4>Execution Path</h4>
          <div>{Array.isArray(result.executionPath) ? result.executionPath.join(' → ') : 'No path'}</div>
          {Array.isArray(result.delays) && result.delays.length ? (
            <ul>{result.delays.map((delay) => <li key={delay.nodeId}>Wait {delay.duration || delay.delay || 'configured time'} then continue</li>)}</ul>
          ) : null}
          <pre>{JSON.stringify(result, null, 2)}</pre>
        </div>
      ) : null}
    </div>
  );
}
