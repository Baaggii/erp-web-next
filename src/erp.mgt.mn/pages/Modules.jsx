import React, { useEffect, useState } from 'react';
import { refreshModules } from '../hooks/useModules.js';
import { API_BASE } from '../utils/apiBase.js';

export default function ModulesPage() {
  const [modules, setModules] = useState([]);

  function loadModules() {
    fetch(`${API_BASE}/modules`, { credentials: 'include' })
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch modules');
        return res.json();
      })
      .then(setModules)
      .catch(err => console.error('Error fetching modules:', err));
  }

  useEffect(() => {
    loadModules();
  }, []);

  async function handleAdd() {
    const moduleKey = prompt('Module key?');
    if (!moduleKey) return;
    const label = prompt('Label?');
    if (!label) return;
    const parentKey = prompt('Parent key (optional)?', '');
    const showInSidebar = window.confirm('Show in sidebar?');
    const showInHeader = window.confirm('Show in header?');
    const res = await fetch(`${API_BASE}/modules`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        moduleKey,
        label,
        parentKey: parentKey || null,
        showInSidebar,
        showInHeader,
      }),
    });
    if (!res.ok) {
      alert('Failed to save module');
      return;
    }
    loadModules();
    refreshModules();
  }

  async function handleEdit(m) {
    const label = prompt('Label?', m.label);
    if (!label) return;
    const parentKey = prompt('Parent key (optional)?', m.parent_key || '');
    const showInSidebar = window.confirm('Show in sidebar?');
    const showInHeader = window.confirm('Show in header?');
    const res = await fetch(`${API_BASE}/modules/${m.module_key}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        label,
        parentKey: parentKey || null,
        showInSidebar,
        showInHeader,
      }),
    });
    if (!res.ok) {
      alert('Failed to update module');
      return;
    }
    loadModules();
    refreshModules();
  }

  async function handlePopulate() {
    const res = await fetch(`${API_BASE}/modules/populate`, {
      method: 'POST',
      credentials: 'include'
    });
    if (!res.ok) {
      alert('Failed to populate permissions');
      return;
    }
    alert('Permissions populated');
  }

  return (
    <div>
      <h2>Modules</h2>
      <button onClick={handleAdd}>Add Module</button>
      <button onClick={handlePopulate} style={{ marginLeft: '0.5rem' }}>
        Populate Permissions
      </button>
      <button onClick={refreshModules} style={{ marginLeft: '0.5rem' }}>
        Refresh Menus
      </button>
      {modules.length === 0 ? (
        <p>No modules.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '0.5rem' }}>
          <thead>
            <tr style={{ backgroundColor: '#e5e7eb' }}>
              <th style={{ padding: '0.5rem', border: '1px solid #d1d5db' }}>Key</th>
              <th style={{ padding: '0.5rem', border: '1px solid #d1d5db' }}>Label</th>
              <th style={{ padding: '0.5rem', border: '1px solid #d1d5db' }}>Parent</th>
              <th style={{ padding: '0.5rem', border: '1px solid #d1d5db' }}>Sidebar</th>
              <th style={{ padding: '0.5rem', border: '1px solid #d1d5db' }}>Header</th>
              <th style={{ padding: '0.5rem', border: '1px solid #d1d5db' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {modules.map(m => (
              <tr key={m.module_key}>
                <td style={{ padding: '0.5rem', border: '1px solid #d1d5db' }}>{m.module_key}</td>
                <td style={{ padding: '0.5rem', border: '1px solid #d1d5db' }}>{m.label}</td>
                <td style={{ padding: '0.5rem', border: '1px solid #d1d5db' }}>{m.parent_key || ''}</td>
                <td style={{ padding: '0.5rem', border: '1px solid #d1d5db', textAlign: 'center' }}>{m.show_in_sidebar ? '✓' : ''}</td>
                <td style={{ padding: '0.5rem', border: '1px solid #d1d5db', textAlign: 'center' }}>{m.show_in_header ? '✓' : ''}</td>
                <td style={{ padding: '0.5rem', border: '1px solid #d1d5db' }}>
                  <button onClick={() => handleEdit(m)}>Edit</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
