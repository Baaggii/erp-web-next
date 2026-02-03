import React, { useEffect, useState, useContext } from 'react';
import useGeneralConfig, { updateCache } from '../hooks/useGeneralConfig.js';
import { useToast } from '../context/ToastContext.jsx';
import { AuthContext } from '../context/AuthContext.jsx';
import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import TooltipWrapper from '../components/TooltipWrapper.jsx';
import normalizeBoolean from '../utils/normalizeBoolean.js';

export default function GeneralConfiguration() {
  const initial = useGeneralConfig();
  const [cfg, setCfg] = useState(null);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState('forms');
  const [isDefault, setIsDefault] = useState(false);
  const { addToast } = useToast();
  const { session, permissions, company } = useContext(AuthContext);
  const { t } = useTranslation(['translation', 'tooltip']);
  const hasAdmin =
    permissions?.permissions?.system_settings ||
    session?.permissions?.system_settings;
  if (!hasAdmin) {
    return <Navigate to="/" replace />;
  }

  useEffect(() => {
    if (initial && Object.keys(initial).length) setCfg(initial);
    fetch('/api/general_config', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : { isDefault: true }))
      .then((data) => {
        const { isDefault: def, ...rest } = data || {};
        if (rest?.plan && typeof rest.plan === 'object') {
          const { dutyTableName, dutyTransactionTable, ...planRest } = rest.plan;
          rest.plan = planRest;
        }
        setCfg(rest);
        setIsDefault(!!def);
      })
      .catch(() => {
        setCfg({});
        setIsDefault(true);
      });
  }, [initial]);

  function handleChange(e) {
    const { name, value, type, checked } = e.target;
    setCfg(c => ({
      ...c,
      [tab]: {
        ...(c?.[tab] || {}),
        [name]: type === 'number' ? Number(value) : type === 'checkbox' ? checked : value,
      },
    }));
  }

  async function handleSave() {
    if (tab === 'system') {
      addToast(
        'System paths are controlled by the server configuration.',
        'info',
      );
      return;
    }
    setSaving(true);
    try {
      if (isDefault) {
        const resImport = await fetch(
          `/api/config/import?companyId=${encodeURIComponent(company ?? '')}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ files: ['generalConfig.json'] }),
          },
        );
        if (!resImport.ok) throw new Error('import failed');
        setIsDefault(false);
      }
      let payload = { [tab]: cfg[tab] };
      if (tab === 'plan' && payload.plan && typeof payload.plan === 'object') {
        const { dutyTableName, dutyTransactionTable, ...planRest } = payload.plan;
        payload = { plan: planRest };
      }
      const res = await fetch('/api/general_config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const data = await res.json();
        setCfg(data);
        setIsDefault(false);
        updateCache(data);
        addToast(t('saved', 'Saved'), 'success');
      } else {
        addToast(t('failedToSave', 'Failed to save'), 'error');
      }
    } catch (err) {
      addToast(err.message || t('failedToSave', 'Failed to save'), 'error');
    }
    setSaving(false);
  }

  async function handleImport() {
    if (
      !window.confirm(
        'Importing defaults will overwrite the current configuration. Continue?'
      )
    )
      return;
    try {
      const res = await fetch(
        `/api/config/import?companyId=${encodeURIComponent(company ?? '')}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ files: ['generalConfig.json'] }),
        },
      );
      if (!res.ok) throw new Error('failed');
      const dataRes = await fetch('/api/general_config', { credentials: 'include' });
      const data = dataRes.ok ? await dataRes.json() : {};
      const { isDefault: def, ...rest } = data || {};
      setCfg(rest);
      setIsDefault(!!def);
      updateCache(rest);
      addToast('Imported', 'success');
    } catch (err) {
      addToast(`Import failed: ${err.message}`, 'error');
    }
  }

  if (!cfg) return <p>{t('loading', 'Loading…')}</p>;

  const active = cfg?.[tab] || {};
  const canSave = tab !== 'system';

  return (
    <div>
      <TooltipWrapper title={t('general_configuration', { ns: 'tooltip', defaultValue: 'Configure global settings' })}>
        <h2>{t('generalConfiguration', 'General Configuration')}</h2>
      </TooltipWrapper>
      <div className="tab-button-group" style={{ marginBottom: '0.5rem' }}>
        <TooltipWrapper title={t('tab_forms', { ns: 'tooltip', defaultValue: 'Form options' })}>
          <button
            className={`tab-button ${tab === 'forms' ? 'active' : ''}`}
            onClick={() => setTab('forms')}
          >
            Forms
          </button>
        </TooltipWrapper>
        <TooltipWrapper title={t('tab_pos', { ns: 'tooltip', defaultValue: 'Point of sale settings' })}>
          <button
            className={`tab-button ${tab === 'pos' ? 'active' : ''}`}
            onClick={() => setTab('pos')}
          >
            POS
          </button>
        </TooltipWrapper>
        <TooltipWrapper title={t('tab_general', { ns: 'tooltip', defaultValue: 'Miscellaneous settings' })}>
          <button
            className={`tab-button ${tab === 'general' ? 'active' : ''}`}
            onClick={() => setTab('general')}
          >
            General
          </button>
        </TooltipWrapper>
        <TooltipWrapper title={t('tab_reports', { ns: 'tooltip', defaultValue: 'Report settings' })}>
          <button
            className={`tab-button ${tab === 'reports' ? 'active' : ''}`}
            onClick={() => setTab('reports')}
          >
            Reports
          </button>
        </TooltipWrapper>
        <TooltipWrapper title={t('tab_plan', { ns: 'tooltip', defaultValue: 'Plan settings' })}>
          <button
            className={`tab-button ${tab === 'plan' ? 'active' : ''}`}
            onClick={() => setTab('plan')}
          >
            Plan
          </button>
        </TooltipWrapper>
        <TooltipWrapper title={t('tab_print', { ns: 'tooltip', defaultValue: 'Receipt print settings' })}>
          <button
            className={`tab-button ${tab === 'print' ? 'active' : ''}`}
            onClick={() => setTab('print')}
          >
            Print
          </button>
        </TooltipWrapper>
        <TooltipWrapper title={t('tab_images', { ns: 'tooltip', defaultValue: 'Image options' })}>
          <button
            className={`tab-button ${tab === 'images' ? 'active' : ''}`}
            onClick={() => setTab('images')}
          >
            Images
          </button>
        </TooltipWrapper>
        <TooltipWrapper title={t('tab_system', { ns: 'tooltip', defaultValue: 'Server paths and configuration' })}>
          <button
            className={`tab-button ${tab === 'system' ? 'active' : ''}`}
            onClick={() => setTab('system')}
          >
            System
          </button>
        </TooltipWrapper>
      </div>
      <div style={{ marginBottom: '0.5rem' }}>
        <button onClick={() => setTab('forms')} disabled={tab === 'forms'}>
          Forms
        </button>
        <button onClick={() => setTab('pos')} disabled={tab === 'pos'} style={{ marginLeft: '0.5rem' }}>
          POS
        </button>
        <button onClick={() => setTab('general')} disabled={tab === 'general'} style={{ marginLeft: '0.5rem' }}>
          General
        </button>
        <button onClick={() => setTab('reports')} disabled={tab === 'reports'} style={{ marginLeft: '0.5rem' }}>
          Reports
        </button>
        <button onClick={() => setTab('plan')} disabled={tab === 'plan'} style={{ marginLeft: '0.5rem' }}>
          Plan
        </button>
        <button onClick={() => setTab('print')} disabled={tab === 'print'} style={{ marginLeft: '0.5rem' }}>
          Print
        </button>
        <button onClick={() => setTab('images')} disabled={tab === 'images'} style={{ marginLeft: '0.5rem' }}>
          Images
        </button>
        <button onClick={() => setTab('system')} disabled={tab === 'system'} style={{ marginLeft: '0.5rem' }}>
          System
        </button>
      </div>
      {tab === 'forms' || tab === 'pos' ? (
        <>
          <div style={{ marginBottom: '0.5rem' }}>
            <TooltipWrapper title={t('label_font_size', { ns: 'tooltip', defaultValue: 'Font size for labels' })}>
              <label>
                Label Font Size{' '}
                <input
                  name="labelFontSize"
                  type="number"
                  inputMode="decimal"
                  value={active.labelFontSize ?? ''}
                  onChange={handleChange}
                />
              </label>
            </TooltipWrapper>
          </div>
          <div style={{ marginBottom: '0.5rem' }}>
            <TooltipWrapper title={t('box_width', { ns: 'tooltip', defaultValue: 'Input box width' })}>
              <label>
                Box Width{' '}
                <input
                  name="boxWidth"
                  type="number"
                  inputMode="decimal"
                  value={active.boxWidth ?? ''}
                  onChange={handleChange}
                />
              </label>
            </TooltipWrapper>
          </div>
          <div style={{ marginBottom: '0.5rem' }}>
            <TooltipWrapper
              title={t('box_height', { ns: 'tooltip', defaultValue: 'Input box height' })}
            >
              <label>
                Box Height{' '}
                <input
                  name="boxHeight"
                  type="number"
                  inputMode="decimal"
                  value={active.boxHeight ?? ''}
                  onChange={handleChange}
                />
              </label>
            </TooltipWrapper>
          </div>
          <div style={{ marginBottom: '0.5rem' }}>
            <TooltipWrapper
              title={t('box_max_width', {
                ns: 'tooltip',
                defaultValue: 'Max input box width',
              })}
            >
              <label>
                Box Max Width{' '}
                <input
                  name="boxMaxWidth"
                  type="number"
                  inputMode="decimal"
                  value={active.boxMaxWidth ?? ''}
                  onChange={handleChange}
                />
              </label>
            </TooltipWrapper>
          </div>
          <div style={{ marginBottom: '0.5rem' }}>
            <TooltipWrapper
              title={t('box_max_height', {
                ns: 'tooltip',
                defaultValue: 'Max input box height',
              })}
            >
              <label>
                Box Max Height{' '}
                <input
                  name="boxMaxHeight"
                  type="number"
                  inputMode="decimal"
                  value={active.boxMaxHeight ?? ''}
                  onChange={handleChange}
                />
              </label>
            </TooltipWrapper>
          </div>
        </>
      ) : tab === 'print' ? (
        <>
          <div style={{ marginBottom: '0.5rem' }}>
            <TooltipWrapper
              title={t('print_font_size', { ns: 'tooltip', defaultValue: 'Print font size (px)' })}
            >
              <label>
                Print Font Size (px){' '}
                <input
                  name="printFontSize"
                  type="number"
                  inputMode="decimal"
                  value={active.printFontSize ?? ''}
                  onChange={handleChange}
                />
              </label>
            </TooltipWrapper>
          </div>
          <div style={{ marginBottom: '0.5rem' }}>
            <TooltipWrapper
              title={t('print_margin', { ns: 'tooltip', defaultValue: 'Print margin (mm)' })}
            >
              <label>
                Print Margin (mm){' '}
                <input
                  name="printMargin"
                  type="number"
                  inputMode="decimal"
                  value={active.printMargin ?? ''}
                  onChange={handleChange}
                />
              </label>
            </TooltipWrapper>
          </div>
          <div style={{ marginBottom: '0.5rem' }}>
            <TooltipWrapper title={t('print_gap', { ns: 'tooltip', defaultValue: 'Print gap (mm)' })}>
              <label>
                Print Gap (mm){' '}
                <input
                  name="printGap"
                  type="number"
                  inputMode="decimal"
                  value={active.printGap ?? ''}
                  onChange={handleChange}
                />
              </label>
            </TooltipWrapper>
          </div>
          <div style={{ marginBottom: '0.5rem' }}>
            <TooltipWrapper title={t('receipt_font_size', { ns: 'tooltip', defaultValue: 'Receipt font size' })}>
              <label>
                Receipt Font Size{' '}
                <input
                  name="receiptFontSize"
                  type="number"
                  inputMode="decimal"
                  value={active.receiptFontSize ?? ''}
                  onChange={handleChange}
                />
              </label>
            </TooltipWrapper>
          </div>
          <div style={{ marginBottom: '0.5rem' }}>
            <TooltipWrapper title={t('receipt_width', { ns: 'tooltip', defaultValue: 'Receipt width (mm)' })}>
              <label>
                Receipt Width (mm){' '}
                <input
                  name="receiptWidth"
                  type="number"
                  inputMode="decimal"
                  value={active.receiptWidth ?? ''}
                  onChange={handleChange}
                />
              </label>
            </TooltipWrapper>
          </div>
          <div style={{ marginBottom: '0.5rem' }}>
            <TooltipWrapper title={t('receipt_height', { ns: 'tooltip', defaultValue: 'Receipt height (mm)' })}>
              <label>
                Receipt Height (mm){' '}
                <input
                  name="receiptHeight"
                  type="number"
                  inputMode="decimal"
                  value={active.receiptHeight ?? ''}
                  onChange={handleChange}
                />
              </label>
            </TooltipWrapper>
          </div>
          <div style={{ marginBottom: '0.5rem' }}>
            <TooltipWrapper title={t('receipt_margin', { ns: 'tooltip', defaultValue: 'Receipt margin (mm)' })}>
              <label>
                Receipt Margin (mm){' '}
                <input
                  name="receiptMargin"
                  type="number"
                  inputMode="decimal"
                  value={active.receiptMargin ?? ''}
                  onChange={handleChange}
                />
              </label>
            </TooltipWrapper>
          </div>
        </>
      ) : tab === 'images' ? (
        <>
          <div style={{ marginBottom: '0.5rem' }}>
            <TooltipWrapper
              title={t('base_path', {
                ns: 'tooltip',
                defaultValue: 'Base path for images',
              })}
            >
              <label>
                Base Path{' '}
                <input
                  name="basePath"
                  type="text"
                  value={active.basePath ?? ''}
                  onChange={handleChange}
                />
              </label>
            </TooltipWrapper>
          </div>
          <div style={{ marginBottom: '0.5rem' }}>
            <TooltipWrapper
              title={t('cleanup_days', {
                ns: 'tooltip',
                defaultValue: 'Days to retain images',
              })}
            >
              <label>
                Cleanup Days{' '}
                <input
                  name="cleanupDays"
                  type="number"
                  inputMode="decimal"
                  value={active.cleanupDays ?? ''}
                  onChange={handleChange}
                  style={{ width: '4rem' }}
                />
              </label>
            </TooltipWrapper>
          </div>
          <div style={{ marginBottom: '0.5rem' }}>
            <TooltipWrapper
              title={t('ignore_on_search', {
                ns: 'tooltip',
                defaultValue: 'Images to ignore during search',
              })}
            >
              <label>
                Ignore on Search
                <textarea
                  name="ignoreOnSearch"
                  value={(active.ignoreOnSearch || []).join('\n')}
                  onChange={(e) => {
                    const list = e.target.value
                      .split('\n')
                      .map((s) => s.trim())
                      .filter(Boolean);
                    setCfg((c) => ({
                      ...c,
                      images: { ...(c.images || {}), ignoreOnSearch: list },
                    }));
                  }}
                  rows={3}
                  style={{ display: 'block', width: '100%', marginTop: '0.25rem' }}
                />
              </label>
            </TooltipWrapper>
          </div>
        </>
      ) : tab === 'reports' ? (
        <>
          <div style={{ marginBottom: '0.5rem' }}>
            <TooltipWrapper
              title={t('show_report_lineage_info', {
                ns: 'tooltip',
                defaultValue: 'Display report field lineage details in report tables',
              })}
            >
              <label>
                Show Report Lineage Info{' '}
                <input
                  name="showReportLineageInfo"
                  type="checkbox"
                  checked={active.showReportLineageInfo ?? false}
                  onChange={handleChange}
                />
              </label>
            </TooltipWrapper>
          </div>
          <div style={{ marginBottom: '0.5rem' }}>
            <TooltipWrapper
              title={t('show_bulk_edit_request_info', {
                ns: 'tooltip',
                defaultValue:
                  'Show bulk edit request payload details before confirmation',
              })}
            >
              <label>
                Show Bulk Edit Request Info{' '}
                <input
                  name="showBulkEditRequestInfo"
                  type="checkbox"
                  checked={active.showBulkEditRequestInfo ?? false}
                  onChange={handleChange}
                />
              </label>
            </TooltipWrapper>
          </div>
          <div style={{ marginBottom: '0.5rem' }}>
            <TooltipWrapper
              title={t('bulk_update_requires_request', {
                ns: 'tooltip',
                defaultValue:
                  'Require approval requests for report bulk updates instead of applying them immediately',
              })}
            >
              <label>
                Require Bulk Update Requests{' '}
                <input
                  name="bulkUpdateRequiresRequest"
                  type="checkbox"
                  checked={active.bulkUpdateRequiresRequest ?? true}
                  onChange={handleChange}
                />
              </label>
            </TooltipWrapper>
          </div>
        </>
      ) : tab === 'plan' ? (
        <>
          <div style={{ marginBottom: '0.5rem' }}>
            <TooltipWrapper
              title={t('plan_id_field_name', {
                ns: 'tooltip',
                defaultValue: 'Field name used to link plan transactions',
              })}
            >
              <label>
                Plan ID Field Name{' '}
                <input
                  name="planIdFieldName"
                  type="text"
                  value={active.planIdFieldName ?? ''}
                  onChange={handleChange}
                />
              </label>
            </TooltipWrapper>
          </div>
          <div style={{ marginBottom: '0.5rem' }}>
            <TooltipWrapper
              title={t('plan_notification_fields', {
                ns: 'tooltip',
                defaultValue:
                  'Comma-separated code_transaction fields used to route notifications to the Plans tab',
              })}
            >
              <label>
                Plan Notification Fields{' '}
                <input
                  name="notificationFields"
                  type="text"
                  value={active.notificationFields ?? ''}
                  onChange={handleChange}
                />
              </label>
            </TooltipWrapper>
            <div style={{ fontSize: '0.8rem' }}>
              Example: is_plan, is_plan_completion
            </div>
          </div>
          <div style={{ marginBottom: '0.5rem' }}>
            <TooltipWrapper
              title={t('plan_notification_values', {
                ns: 'tooltip',
                defaultValue:
                  'Comma-separated values to match against plan notification fields',
              })}
            >
              <label>
                Plan Notification Values{' '}
                <input
                  name="notificationValues"
                  type="text"
                  value={active.notificationValues ?? ''}
                  onChange={handleChange}
                />
              </label>
            </TooltipWrapper>
            <div style={{ fontSize: '0.8rem' }}>
              Leave blank to use the default value of 1.
            </div>
          </div>
          <div style={{ marginBottom: '0.5rem' }}>
            <TooltipWrapper
              title={t('duty_notification_fields', {
                ns: 'tooltip',
                defaultValue:
                  'Comma-separated code_transaction fields used to route duty notifications to the Plans tab',
              })}
            >
              <label>
                Duty Notification Fields{' '}
                <input
                  name="dutyNotificationFields"
                  type="text"
                  value={active.dutyNotificationFields ?? ''}
                  onChange={handleChange}
                />
              </label>
            </TooltipWrapper>
            <div style={{ fontSize: '0.8rem' }}>Example: is_duty</div>
          </div>
          <div style={{ marginBottom: '0.5rem' }}>
            <TooltipWrapper
              title={t('duty_notification_values', {
                ns: 'tooltip',
                defaultValue:
                  'Comma-separated values to match against duty notification fields',
              })}
            >
              <label>
                Duty Notification Values{' '}
                <input
                  name="dutyNotificationValues"
                  type="text"
                  value={active.dutyNotificationValues ?? ''}
                  onChange={handleChange}
                />
              </label>
            </TooltipWrapper>
            <div style={{ fontSize: '0.8rem' }}>
              Leave blank to use the default value of 1.
            </div>
          </div>
          <div style={{ marginBottom: '0.5rem' }}>
            <TooltipWrapper
              title={t('duty_transaction_table', {
                ns: 'tooltip',
                defaultValue: 'Table name used to pull duty assignments',
              })}
            >
              <label>
                Duty Transaction Table{' '}
                <input
                  name="dutyTableName"
                  type="text"
                  value={active.dutyTableName ?? ''}
                  onChange={handleChange}
                />
              </label>
            </TooltipWrapper>
          </div>
          <div style={{ marginBottom: '0.5rem' }}>
            <TooltipWrapper
              title={t('duty_position_field_name', {
                ns: 'tooltip',
                defaultValue:
                  'Position field name used to match duty assignments to the current user',
              })}
            >
              <label>
                Duty Position Field Name{' '}
                <input
                  name="dutyPositionFieldName"
                  type="text"
                  value={active.dutyPositionFieldName ?? ''}
                  onChange={handleChange}
                />
              </label>
            </TooltipWrapper>
          </div>
        </>
      ) : tab === 'system' ? (
        <div>
          <p>
            Configuration and tenant data are grouped under a single folder per
            company. Set the <code>CONFIG_BASE_PATH</code> environment variable
            on the server to change where these files are stored.
          </p>
          <div style={{ marginBottom: '0.5rem' }}>
            <label>
              Config base path{' '}
              <input
                type="text"
                value={cfg?.system?.configBasePath || ''}
                readOnly
              />
            </label>
          </div>
          <div style={{ marginBottom: '0.5rem' }}>
            <label>
              Tenant folder{' '}
              <input
                type="text"
                value={cfg?.system?.tenantFolder || ''}
                readOnly
              />
            </label>
          </div>
          <p>
            To move the application, copy the tenant folder to the new server
            and point <code>CONFIG_BASE_PATH</code> (or <code>CONFIG_ROOT</code>)
            to its parent directory.
          </p>
        </div>
      ) : tab === 'general' ? (
        <>
          <div style={{ marginBottom: '0.5rem' }}>
            <TooltipWrapper
              title={t('report_proc_prefix', {
                ns: 'tooltip',
                defaultValue: 'Prefix for report stored procedures',
              })}
            >
              <label>
                Stored Procedure Prefix{' '}
                <input
                  name="reportProcPrefix"
                  type="text"
                  value={active.reportProcPrefix ?? ''}
                  onChange={handleChange}
                  style={{ width: '8rem' }}
                />
              </label>
            </TooltipWrapper>
            <div style={{ fontSize: '0.8rem' }}>Prepended to report stored procedure names</div>
          </div>
          <div style={{ marginBottom: '0.5rem' }}>
            <TooltipWrapper
              title={t('report_view_prefix', {
                ns: 'tooltip',
                defaultValue: 'Prefix for report views',
              })}
            >
              <label>
                View Prefix{' '}
                <input
                  name="reportViewPrefix"
                  type="text"
                  value={active.reportViewPrefix ?? ''}
                  onChange={handleChange}
                  style={{ width: '8rem' }}
                />
              </label>
            </TooltipWrapper>
            <div style={{ fontSize: '0.8rem' }}>Prepended to report view names</div>
          </div>
          <div style={{ marginBottom: '0.5rem' }}>
            <TooltipWrapper
              title={t('ai_api_enabled', {
                ns: 'tooltip',
                defaultValue: 'Enable AI API',
              })}
            >
              <label>
                Enable AI API{' '}
                <input
                  name="aiApiEnabled"
                  type="checkbox"
                  checked={active.aiApiEnabled ?? false}
                  onChange={handleChange}
                />
              </label>
            </TooltipWrapper>
          </div>
          <div style={{ marginBottom: '0.5rem' }}>
            <TooltipWrapper
              title={t('ai_inventory_api_enabled', {
                ns: 'tooltip',
                defaultValue: 'Enable AI inventory API',
              })}
            >
              <label>
                Enable AI Inventory API{' '}
                <input
                  name="aiInventoryApiEnabled"
                  type="checkbox"
                  checked={active.aiInventoryApiEnabled ?? false}
                  onChange={handleChange}
                />
              </label>
            </TooltipWrapper>
          </div>
          <div style={{ marginBottom: '0.5rem' }}>
            <TooltipWrapper
              title={t('trigger_toast_enabled', {
                ns: 'tooltip',
                defaultValue: 'Display trigger messages as toasts',
              })}
            >
              <label>
                Show Trigger Toasts{' '}
                <input
                  name="triggerToastEnabled"
                  type="checkbox"
                  checked={active.triggerToastEnabled ?? false}
                  onChange={handleChange}
                />
              </label>
            </TooltipWrapper>
          </div>
          <div style={{ marginBottom: '0.5rem' }}>
            <TooltipWrapper
              title={t('txn_toast_enabled', {
                ns: 'tooltip',
                defaultValue: 'Display debug toasts for transaction fetches',
              })}
            >
              <label>
                Show Transaction Toasts{' '}
                <input
                  name="txnToastEnabled"
                  type="checkbox"
                  checked={active.txnToastEnabled ?? false}
                  onChange={handleChange}
                />
              </label>
            </TooltipWrapper>
          </div>
          <div style={{ marginBottom: '0.5rem' }}>
            <TooltipWrapper
              title={t('pos_guard_toast_enabled', {
                ns: 'tooltip',
                defaultValue: 'Display reasons when POS fields are read-only',
              })}
            >
              <label>
                Show POS Guard Toasts{' '}
                <input
                  name="posGuardToastEnabled"
                  type="checkbox"
                  checked={active.posGuardToastEnabled ?? false}
                  onChange={handleChange}
                />
              </label>
            </TooltipWrapper>
          </div>
          <div style={{ marginBottom: '0.5rem' }}>
            <TooltipWrapper
              title={t('ebarimt_toast_enabled', {
                ns: 'tooltip',
                defaultValue: 'Display POSAPI request and response toasts',
              })}
            >
              <label>
                Show Ebarimt Toasts{' '}
                <input
                  name="ebarimtToastEnabled"
                  type="checkbox"
                  checked={active.ebarimtToastEnabled ?? false}
                  onChange={handleChange}
                />
              </label>
            </TooltipWrapper>
          </div>
          <div style={{ marginBottom: '0.5rem' }}>
            <TooltipWrapper
              title={t('workplace_toast_enabled', {
                ns: 'tooltip',
                defaultValue:
                  'Display workplace fetch diagnostics in Reports, including parameters, SQL, and counts',
              })}
            >
              <label>
                Show Workplace Fetch Toasts{' '}
                <input
                  name="workplaceFetchToastEnabled"
                  type="checkbox"
                  checked={normalizeBoolean(
                    active.workplaceFetchToastEnabled,
                    true,
                  )}
                  onChange={handleChange}
                />
              </label>
            </TooltipWrapper>
          </div>
          <div style={{ marginBottom: '0.5rem' }}>
            <TooltipWrapper
              title={t('proc_toast_enabled', {
                ns: 'tooltip',
                defaultValue: 'Display procedure messages as toasts',
              })}
            >
              <label>
                Show Procedure Toasts{' '}
                <input
                  name="procToastEnabled"
                  type="checkbox"
                  checked={active.procToastEnabled ?? false}
                  onChange={handleChange}
                />
              </label>
            </TooltipWrapper>
          </div>
          <div style={{ marginBottom: '0.5rem' }}>
            <TooltipWrapper
              title={t('view_toast_enabled', {
                ns: 'tooltip',
                defaultValue: 'Display view lookup toasts',
              })}
            >
              <label>
                Show View Lookup Toasts{' '}
                <input
                  name="viewToastEnabled"
                  type="checkbox"
                  checked={active.viewToastEnabled ?? false}
                  onChange={handleChange}
                />
              </label>
            </TooltipWrapper>
          </div>
          <div style={{ marginBottom: '0.5rem' }}>
            <TooltipWrapper
              title={t('report_row_toast_enabled', {
                ns: 'tooltip',
                defaultValue: 'Display report row toasts',
              })}
            >
              <label>
                Show Report Row Toasts{' '}
                <input
                  name="reportRowToastEnabled"
                  type="checkbox"
                  checked={active.reportRowToastEnabled ?? false}
                  onChange={handleChange}
                />
              </label>
            </TooltipWrapper>
          </div>
          <div style={{ marginBottom: '0.5rem' }}>
            <TooltipWrapper
              title={t('image_toast_enabled', {
                ns: 'tooltip',
                defaultValue: 'Display image toasts',
              })}
            >
              <label>
                Show Image Toasts{' '}
                <input
                  name="imageToastEnabled"
                  type="checkbox"
                  checked={active.imageToastEnabled ?? false}
                  onChange={handleChange}
                />
              </label>
            </TooltipWrapper>
          </div>
          <div style={{ marginBottom: '0.5rem' }}>
            <TooltipWrapper
              title={t('edit_labels_enabled', {
                ns: 'tooltip',
                defaultValue: 'Allow editing field labels',
              })}
            >
              <label>
                Enable Field Label Editing{' '}
                <input
                  name="editLabelsEnabled"
                  type="checkbox"
                  checked={active.editLabelsEnabled ?? false}
                  onChange={handleChange}
                />
              </label>
            </TooltipWrapper>
          </div>
          <div style={{ marginBottom: '0.5rem' }}>
            <TooltipWrapper
              title={t(
                'tooltip:show_tour_buttons',
                'Display tour action buttons in the window header',
              )}
            >
              <label>
                {t('show_tour_buttons', 'Show tour buttons')}{' '}
                <input
                  name="showTourButtons"
                  type="checkbox"
                  checked={active.showTourButtons ?? true}
                  onChange={handleChange}
                />
              </label>
            </TooltipWrapper>
          </div>
          <div style={{ marginBottom: '0.5rem' }}>
            <TooltipWrapper
              title={t(
                'tooltip:tour_builder_enabled',
                'Allow administrators to create or edit guided tours',
              )}
            >
              <label>
                {t('tour_builder_enabled', 'Enable tour builder')}{' '}
                <input
                  name="tourBuilderEnabled"
                  type="checkbox"
                  checked={active.tourBuilderEnabled ?? true}
                  onChange={handleChange}
                />
              </label>
            </TooltipWrapper>
          </div>
          <div style={{ marginBottom: '0.5rem' }}>
            <TooltipWrapper
              title={t('show_report_params', {
                ns: 'tooltip',
                defaultValue: 'Display report parameters',
              })}
            >
              <label>
                Show Report Parameters{' '}
                <input
                  name="showReportParams"
                  type="checkbox"
                  checked={active.showReportParams ?? false}
                  onChange={handleChange}
                />
              </label>
            </TooltipWrapper>
          </div>
          <div style={{ marginBottom: '0.5rem' }}>
            <TooltipWrapper
              title={t('debug_logging_enabled', {
                ns: 'tooltip',
                defaultValue: 'Enable debug logging',
              })}
            >
              <label>
                Enable Debug Logging{' '}
                <input
                  name="debugLoggingEnabled"
                  type="checkbox"
                  checked={active.debugLoggingEnabled ?? false}
                  onChange={handleChange}
                />
              </label>
            </TooltipWrapper>
          </div>
          <div style={{ marginBottom: '0.5rem' }}>
            <TooltipWrapper
              title={t('request_polling_enabled', {
                ns: 'tooltip',
                defaultValue: 'Periodically fetch pending requests',
              })}
            >
              <label>
                Enable Request Polling{' '}
                <input
                  name="requestPollingEnabled"
                  type="checkbox"
                  checked={active.requestPollingEnabled ?? false}
                  onChange={handleChange}
                />
              </label>
            </TooltipWrapper>
          </div>
          <div style={{ marginBottom: '0.5rem' }}>
            <TooltipWrapper
              title={t('request_polling_interval', {
                ns: 'tooltip',
                defaultValue: 'Seconds between request polls',
              })}
            >
              <label>
                Request Polling Interval (seconds){' '}
                <input
                  name="requestPollingIntervalSeconds"
                  type="number"
                  min={1}
                  value={active.requestPollingIntervalSeconds ?? 30}
                  onChange={handleChange}
                  style={{ width: '4rem' }}
                />
              </label>
            </TooltipWrapper>
          </div>
        </>
      ) : null}
      <div>
        <button onClick={handleImport} style={{ marginRight: '0.5rem' }}>
          Import Defaults
        </button>
        <button onClick={handleSave} disabled={saving || !canSave}>
          {canSave ? 'Save' : 'Managed by server'}
        </button>
      </div>
    </div>
  );
}
