import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { refreshModules } from '../hooks/useModules.js';

export default function ModulesPage() {
  const [modules, setModules] = useState([]);
  const { t } = useTranslation();

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

  async function handleAdd() {
    const moduleKeyPrompt = t('modules_prompt_module_key', 'Module key?');
    const moduleKey = prompt(moduleKeyPrompt);
    if (!moduleKey) return;
    const labelPrompt = t('modules_prompt_label', 'Label?');
    const label = prompt(labelPrompt);
    if (!label) return;
    const parentKeyPrompt = t('modules_prompt_parent_key', 'Parent key (optional)?');
    const parentKey = prompt(parentKeyPrompt, '');
    const showInSidebarConfirm = t('modules_confirm_show_in_sidebar', 'Show in sidebar?');
    const showInSidebar = window.confirm(showInSidebarConfirm);
    const showInHeaderConfirm = t('modules_confirm_show_in_header', 'Show in header?');
    const showInHeader = window.confirm(showInHeaderConfirm);
    const res = await fetch('/api/modules', {
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
      const saveFailedMessage = t('modules_alert_save_failed', 'Failed to save module');
      alert(saveFailedMessage);
      return;
    }
    loadModules();
    refreshModules();
  }

  async function handleEdit(m) {
    const labelPrompt = t('modules_prompt_label', 'Label?');
    const label = prompt(labelPrompt, m.label);
    if (!label) return;
    const parentKeyPrompt = t('modules_prompt_parent_key', 'Parent key (optional)?');
    const parentKey = prompt(parentKeyPrompt, m.parent_key || '');
    const showInSidebarConfirm = t('modules_confirm_show_in_sidebar', 'Show in sidebar?');
    const showInSidebar = window.confirm(showInSidebarConfirm);
    const showInHeaderConfirm = t('modules_confirm_show_in_header', 'Show in header?');
    const showInHeader = window.confirm(showInHeaderConfirm);
    const res = await fetch(`/api/modules/${m.module_key}`, {
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
      const updateFailedMessage = t('modules_alert_update_failed', 'Failed to update module');
      alert(updateFailedMessage);
      return;
    }
    loadModules();
    refreshModules();
  }

  async function handlePopulate() {
    const res = await fetch('/api/modules/populate', {
      method: 'POST',
      credentials: 'include'
    });
    if (!res.ok) {
      const populateFailedMessage = t('modules_alert_populate_failed', 'Failed to populate permissions');
      alert(populateFailedMessage);
      return;
    }
    const populateSuccessMessage = t('modules_alert_populate_success', 'Permissions populated');
    alert(populateSuccessMessage);
  }

  const modulesHeading = t('modules_heading', 'Modules');
  const addModuleLabel = t('modules_button_add', 'Add Module');
  const populatePermissionsLabel = t('modules_button_populate', 'Populate Permissions');
  const refreshMenusLabel = t('modules_button_refresh', 'Refresh Menus');
  const noModulesText = t('modules_empty', 'No modules.');
  const keyHeader = t('modules_table_header_key', 'Key');
  const labelHeader = t('modules_table_header_label', 'Label');
  const parentHeader = t('modules_table_header_parent', 'Parent');
  const sidebarHeader = t('modules_table_header_sidebar', 'Sidebar');
  const headerHeader = t('modules_table_header_header', 'Header');
  const actionHeader = t('modules_table_header_action', 'Action');
  const editButtonLabel = t('modules_button_edit', 'Edit');

  return (
    <div>
      <h2>{modulesHeading}</h2>
      <button onClick={handleAdd}>{addModuleLabel}</button>
      <button onClick={handlePopulate} style={{ marginLeft: '0.5rem' }}>
        {populatePermissionsLabel}
      </button>
      <button onClick={refreshModules} style={{ marginLeft: '0.5rem' }}>
        {refreshMenusLabel}
      </button>
      {modules.length === 0 ? (
        <p>{noModulesText}</p>
      ) : (
        <div className="table-container overflow-x-auto" style={{ maxHeight: '70vh' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '0.5rem' }}>
          <thead>
            <tr style={{ backgroundColor: '#e5e7eb' }}>
              <th style={{ padding: '0.5rem', border: '1px solid #d1d5db' }}>{keyHeader}</th>
              <th style={{ padding: '0.5rem', border: '1px solid #d1d5db' }}>{labelHeader}</th>
              <th style={{ padding: '0.5rem', border: '1px solid #d1d5db' }}>{parentHeader}</th>
              <th style={{ padding: '0.5rem', border: '1px solid #d1d5db' }}>{sidebarHeader}</th>
              <th style={{ padding: '0.5rem', border: '1px solid #d1d5db' }}>{headerHeader}</th>
              <th style={{ padding: '0.5rem', border: '1px solid #d1d5db' }}>{actionHeader}</th>
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
                  <button onClick={() => handleEdit(m)}>{editButtonLabel}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
    </div>
  );
}
