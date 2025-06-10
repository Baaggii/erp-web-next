import React, { useEffect, useState } from 'react';
import { refreshModules } from '../hooks/useModules.js';

export default function ModulesPage() {
  const [modules, setModules] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);

  function loadModules() {
    fetch('/api/modules', { credentials: 'include' })
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

  function handleAdd() {
    setEditing(null);
    setShowForm(true);
  }

  function handleEdit(m) {
    setEditing(m);
    setShowForm(true);
  }

  async function handleFormSubmit({
    moduleKey,
    label,
    parentKey,
    showInSidebar,
    showInHeader,
  }) {
    const isEdit = Boolean(editing);
    const url = isEdit
      ? `/api/modules/${editing.module_key}`
      : '/api/modules';
    const method = isEdit ? 'PUT' : 'POST';
    const body = {
      moduleKey,
      label,
      parentKey: parentKey || null,
      showInSidebar,
      showInHeader,
    };
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      alert(isEdit ? 'Failed to update module' : 'Failed to save module');
      return;
    }
    setShowForm(false);
    setEditing(null);
    loadModules();
    refreshModules();
  }

  async function handlePopulate() {
    const res = await fetch('/api/modules/populate', {
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
      <ModuleFormModal
        visible={showForm}
        onCancel={() => {
          setShowForm(false);
          setEditing(null);
        }}
        onSubmit={handleFormSubmit}
        module={editing}
      />
    </div>
  );
}

function ModuleFormModal({ visible, onCancel, onSubmit, module }) {
  const [moduleKey, setModuleKey] = useState(module?.module_key || '');
  const [label, setLabel] = useState(module?.label || '');
  const [parentKey, setParentKey] = useState(module?.parent_key || '');
  const [showInSidebar, setShowInSidebar] = useState(
    module?.show_in_sidebar || false,
  );
  const [showInHeader, setShowInHeader] = useState(
    module?.show_in_header || false,
  );

  useEffect(() => {
    setModuleKey(module?.module_key || '');
    setLabel(module?.label || '');
    setParentKey(module?.parent_key || '');
    setShowInSidebar(module?.show_in_sidebar || false);
    setShowInHeader(module?.show_in_header || false);
  }, [module]);

  if (!visible) return null;

  const overlay = {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.4)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  };
  const modal = {
    backgroundColor: '#fff',
    padding: '1rem',
    borderRadius: '4px',
    minWidth: '300px',
  };
  const isEdit = Boolean(module);

  return (
    <div style={overlay}>
      <div style={modal}>
        <h3 style={{ marginTop: 0 }}>{isEdit ? 'Edit Module' : 'Add Module'}</h3>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit({
              moduleKey,
              label,
              parentKey,
              showInSidebar,
              showInHeader,
            });
          }}
        >
          <div style={{ marginBottom: '0.75rem' }}>
            <label style={{ display: 'block', marginBottom: '0.25rem' }}>
              Module Key
            </label>
            <input
              type="text"
              value={moduleKey}
              onChange={(e) => setModuleKey(e.target.value)}
              disabled={isEdit}
              required
              style={{ width: '100%', padding: '0.5rem' }}
            />
          </div>
          <div style={{ marginBottom: '0.75rem' }}>
            <label style={{ display: 'block', marginBottom: '0.25rem' }}>
              Label
            </label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              required
              style={{ width: '100%', padding: '0.5rem' }}
            />
          </div>
          <div style={{ marginBottom: '0.75rem' }}>
            <label style={{ display: 'block', marginBottom: '0.25rem' }}>
              Parent Key
            </label>
            <input
              type="text"
              value={parentKey}
              onChange={(e) => setParentKey(e.target.value)}
              style={{ width: '100%', padding: '0.5rem' }}
            />
          </div>
          <div style={{ marginBottom: '0.75rem' }}>
            <label style={{ marginRight: '0.5rem' }}>
              <input
                type="checkbox"
                checked={showInSidebar}
                onChange={(e) => setShowInSidebar(e.target.checked)}
                style={{ marginRight: '0.25rem' }}
              />
              Show in sidebar
            </label>
            <label style={{ marginLeft: '1rem' }}>
              <input
                type="checkbox"
                checked={showInHeader}
                onChange={(e) => setShowInHeader(e.target.checked)}
                style={{ marginRight: '0.25rem' }}
              />
              Show in header
            </label>
          </div>
          <div style={{ textAlign: 'right' }}>
            <button type="button" onClick={onCancel} style={{ marginRight: '0.5rem' }}>
              Cancel
            </button>
            <button type="submit">Save</button>
          </div>
        </form>
      </div>
    </div>
  );
}
