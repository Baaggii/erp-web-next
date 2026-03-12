import React, { useCallback, useContext, useState, useEffect, useRef, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext.jsx';
import PendingRequestWidget from '../components/PendingRequestWidget.jsx';
import TransactionNotificationWidget from '../components/TransactionNotificationWidget.jsx';
import OutgoingRequestWidget from '../components/OutgoingRequestWidget.jsx';
import DutyAssignmentsWidget from '../components/DutyAssignmentsWidget.jsx';
import NotificationsPage from './Notifications.jsx';
import { usePendingRequests } from '../context/PendingRequestContext.jsx';
import { useTransactionNotifications } from '../context/TransactionNotificationContext.jsx';
import LangContext from '../context/I18nContext.jsx';
import { useTour } from '../components/ERPLayout.jsx';
import useGeneralConfig from '../hooks/useGeneralConfig.js';


const TRANSACTION_NAME_KEYS = [
  'UITransTypeName',
  'UITransTypeNameEng',
  'UITransTypeNameEN',
  'UITransTypeNameEn',
  'transactionName',
  'transaction_name',
  'name',
  'Name',
];
const TRANSACTION_TABLE_KEYS = ['transactionTable', 'transaction_table', 'table', 'tableName', 'table_name'];
const DEFAULT_PLAN_NOTIFICATION_FIELDS = ['is_plan', 'is_plan_completion'];
const DEFAULT_PLAN_NOTIFICATION_VALUES = ['1'];
const DEFAULT_DUTY_NOTIFICATION_FIELDS = [];
const DEFAULT_DUTY_NOTIFICATION_VALUES = ['1'];

function normalizeText(value) {
  if (value === undefined || value === null) return '';
  return String(value).trim().toLowerCase();
}

function normalizeFieldName(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function normalizeMatch(value) {
  if (value === undefined || value === null) return '';
  return String(value).trim().toLowerCase();
}

function parseListValue(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry).trim()).filter(Boolean);
  }
  if (value === undefined || value === null) return [];
  if (typeof value === 'number' || typeof value === 'boolean') return [String(value)];
  if (typeof value === 'string') {
    return value.split(',').map((entry) => entry.trim()).filter(Boolean);
  }
  return [];
}

function normalizeFlagValue(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === '') return false;
    if (['1', 'true', 'yes', 'y', 'on', 'enabled'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'n', 'off', 'disabled'].includes(normalized)) return false;
    const num = Number(normalized);
    if (!Number.isNaN(num)) return num !== 0;
    return true;
  }
  return Boolean(value);
}

function getRowValue(row, keys) {
  if (!row || typeof row !== 'object') return null;
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null && row[key] !== '') {
      return row[key];
    }
  }
  return null;
}

function getRowFieldValue(row, fieldName) {
  if (!row || !fieldName) return undefined;
  if (Object.prototype.hasOwnProperty.call(row, fieldName)) return row[fieldName];
  const normalizedTarget = normalizeFieldName(fieldName);
  if (!normalizedTarget) return undefined;
  const matchKey = Object.keys(row).find((key) => normalizeFieldName(key) === normalizedTarget);
  return matchKey ? row[matchKey] : undefined;
}

export default function DashboardPage() {
  const { user, session } = useContext(AuthContext);
  const { hasNew, markSeen, outgoing } = usePendingRequests();
  const { notifications } = useTransactionNotifications();
  const generalConfig = useGeneralConfig();
  const [codeTransactions, setCodeTransactions] = useState([]);
  const { t } = useContext(LangContext);
  const [active, setActive] = useState('general');
  const [workflowSectionTabs, setWorkflowSectionTabs] = useState({
    report: 'audition',
    change: 'audition',
    temporary: 'audition',
  });
  const location = useLocation();
  const navigate = useNavigate();
  useTour('dashboard');

  const prevTab = useRef('general');
  const allowedTabs = useRef(new Set(['general', 'activity', 'audition', 'plans']));
  const acceptedNewCount = outgoing?.accepted?.newCount ?? 0;
  const declinedNewCount = outgoing?.declined?.newCount ?? 0;

  useEffect(() => {
    const params = new URLSearchParams(location.search || '');
    const tabParam = params.get('tab');
    const notifyParam = params.get('notifyGroup');
    const requested = allowedTabs.current.has(tabParam) ? tabParam : notifyParam ? 'activity' : null;
    if (requested && requested !== active) {
      setActive(requested);
    }
  }, [active, location.search]);
  useEffect(() => {
    if (prevTab.current === 'audition' && active !== 'audition') {
      markSeen();
    }
    prevTab.current = active;
  }, [active, markSeen]);

  useEffect(() => () => {
    if (prevTab.current === 'audition') markSeen();
  }, [markSeen]);

  useEffect(() => {
    let cancelled = false;

    const normalizeTab = (tabValue) => {
      const value = String(tabValue || '').trim().toLowerCase();
      return allowedTabs.current.has(value) ? value : 'audition';
    };

    const pickTabFromForms = (forms, predicate) => {
      const entries = Object.entries(forms || {}).filter(
        ([name, info]) => name !== 'isDefault' && info && typeof info === 'object',
      );
      const matching = entries.filter(([, info]) => {
        if (typeof predicate !== 'function') return true;
        return predicate(info);
      });
      const source = matching.length > 0 ? matching : entries;
      for (const [, info] of source) {
        const tab = normalizeTab(info?.notificationRedirectTab ?? info?.notification_redirect_tab);
        if (tab) return tab;
      }
      return 'audition';
    };

    Promise.allSettled([
      fetch('/api/report_access', { credentials: 'include', skipLoader: true }).then((res) =>
        res.ok ? res.json() : {},
      ),
      fetch('/api/transaction_forms', { credentials: 'include', skipLoader: true }).then((res) =>
        res.ok ? res.json() : {},
      ),
    ]).then(([reportResult, transactionResult]) => {
      if (cancelled) return;
      const reportData = reportResult.status === 'fulfilled' ? reportResult.value || {} : {};
      const transactionData =
        transactionResult.status === 'fulfilled' ? transactionResult.value || {} : {};

      const reportTab = normalizeTab(reportData?.reportApprovalsDashboardTab);
      const changeTab = normalizeTab(
        transactionData?.changeRequestsDashboardTab ||
          transactionData?.change_requests_dashboard_tab ||
          pickTabFromForms(transactionData, (info) =>
            Array.isArray(info?.notifyFields)
              ? info.notifyFields.length > 0
              : Array.isArray(info?.notify_fields) && info.notify_fields.length > 0,
          ),
      );
      const temporaryTab = normalizeTab(
        transactionData?.temporaryTransactionsDashboardTab ||
          transactionData?.temporary_transactions_dashboard_tab ||
          pickTabFromForms(
            transactionData,
            (info) =>
              Boolean(info?.allowTemporarySubmission) || Boolean(info?.supportsTemporarySubmission),
          ),
      );

      setWorkflowSectionTabs({
        report: reportTab,
        change: changeTab,
        temporary: temporaryTab,
      });
    });

    return () => {
      cancelled = true;
    };
  }, []);


  useEffect(() => {
    let cancelled = false;
    fetch('/api/tables/code_transaction?perPage=500', {
      credentials: 'include',
      skipErrorToast: true,
      skipLoader: true,
    })
      .then((res) => (res.ok ? res.json() : { rows: [] }))
      .then((data) => {
        if (cancelled) return;
        setCodeTransactions(Array.isArray(data?.rows) ? data.rows : []);
      })
      .catch(() => {
        if (!cancelled) setCodeTransactions([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const dotBadgeStyle = {
    background: 'red',
    borderRadius: '50%',
    width: '8px',
    height: '8px',
    display: 'inline-block',
    marginRight: '4px',
  };
  const numBadgeStyle = {
    display: 'inline-block',
    background: 'red',
    color: 'white',
    borderRadius: '999px',
    padding: '0 0.4rem',
    fontSize: '0.75rem',
    marginRight: '4px',
  };

  const syncTabParam = (nextTab, keepNotify = false) => {
    const params = new URLSearchParams(location.search || '');
    params.set('tab', nextTab);
    if (!keepNotify) {
      params.delete('notifyGroup');
      params.delete('notifyItem');
    }
    navigate({ pathname: location.pathname, search: params.toString() }, { replace: true });
  };

  const tabButton = (key, label, badgeCount = 0, showDot = false) => (
    <button
      key={key}
      onClick={() => {
        setActive(key);
        syncTabParam(key, key === 'activity');
      }}
      style={{
        padding: '0.5rem 1rem',
        border: 'none',
        borderBottom: active === key ? '2px solid #2563eb' : '2px solid transparent',
        background: 'none',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
      }}
    >
      {badgeCount > 0 ? (
        <span style={numBadgeStyle}>{badgeCount}</span>
      ) : (
        showDot && <span style={dotBadgeStyle} />
      )}
      {label}
    </button>
  );

  const cardStyle = {
    background: '#f0f4ff',
    padding: '1rem',
    borderRadius: '4px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
    minWidth: '140px',
  };

  const tabPanelStyle = (key) => ({
    display: active === key ? 'block' : 'none',
  });


  const planNotificationConfig = useMemo(() => {
    const fields = parseListValue(generalConfig?.plan?.notificationFields);
    const values = parseListValue(generalConfig?.plan?.notificationValues);
    return {
      fields: fields.length > 0 ? fields : DEFAULT_PLAN_NOTIFICATION_FIELDS,
      values: values.length > 0 ? values : DEFAULT_PLAN_NOTIFICATION_VALUES,
    };
  }, [generalConfig]);

  const dutyNotificationConfig = useMemo(() => {
    const fields = parseListValue(generalConfig?.plan?.dutyNotificationFields);
    const values = parseListValue(generalConfig?.plan?.dutyNotificationValues);
    return {
      fields: fields.length > 0 ? fields : DEFAULT_DUTY_NOTIFICATION_FIELDS,
      values: values.length > 0 ? values : DEFAULT_DUTY_NOTIFICATION_VALUES,
    };
  }, [generalConfig]);

  const planTransactionsByName = useMemo(() => {
    const map = new Map();
    codeTransactions.forEach((row) => {
      const name = normalizeText(getRowValue(row, TRANSACTION_NAME_KEYS));
      if (name) map.set(name, row);
      const table = normalizeText(getRowValue(row, TRANSACTION_TABLE_KEYS));
      if (table) map.set(`table:${table}`, row);
    });
    return map;
  }, [codeTransactions]);

  const isRuleMatch = useCallback((row, cfg) => {
    if (!row) return false;
    const normalizedValues = cfg.values.map(normalizeMatch);
    return cfg.fields.some((field) => {
      const value = getRowFieldValue(row, field);
      if (value === undefined || value === null || value === '') return false;
      if (normalizedValues.length === 0) return normalizeFlagValue(value);
      return normalizedValues.includes(normalizeMatch(value));
    });
  }, []);

  const categorizedNotificationCounts = useMemo(() => {
    let activityUnread = 0;
    let plansUnread = 0;

    notifications.forEach((item) => {
      if (!item || item.isRead) return;
      const nameKey = normalizeText(item.transactionName);
      const tableKey = normalizeText(item.transactionTable);
      const txRow =
        (nameKey && planTransactionsByName.get(nameKey)) ||
        (tableKey && planTransactionsByName.get(`table:${tableKey}`)) ||
        null;
      const isPlan = isRuleMatch(txRow, planNotificationConfig);
      const isDuty = isRuleMatch(txRow, dutyNotificationConfig);
      if (isPlan || isDuty) {
        plansUnread += 1;
      } else {
        activityUnread += 1;
      }
    });

    return { activityUnread, plansUnread };
  }, [
    notifications,
    planTransactionsByName,
    isRuleMatch,
    planNotificationConfig,
    dutyNotificationConfig,
  ]);

  return (
    <div style={{ padding: '1rem' }}>
      <div style={{ display: 'flex', borderBottom: '1px solid #ddd', marginBottom: '1rem' }}>
        {tabButton('general', t('general', 'General'))}
        {tabButton(
          'activity',
          t('activity', 'Activity'),
          categorizedNotificationCounts.activityUnread,
          categorizedNotificationCounts.activityUnread > 0,
        )}
        {tabButton(
          'audition',
          t('audition', 'Audition'),
          acceptedNewCount + declinedNewCount,
          hasNew,
        )}
        {tabButton(
          'plans',
          t('plans', 'Plans'),
          categorizedNotificationCounts.plansUnread,
          categorizedNotificationCounts.plansUnread > 0,
        )}
      </div>

      <div style={tabPanelStyle('general')}>
        <div>
          <h2 style={{ marginTop: 0 }}>
            {t('welcome', 'Welcome')}, {user?.full_name || user?.username}
            {session && ` (${session.company_name})`}
          </h2>
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            <div style={cardStyle}>
              <div style={{ fontSize: '0.9rem', color: '#555' }}>
                {t('todays_income', "Today's Income")}
              </div>
              <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>$0</div>
            </div>
            <div style={cardStyle}>
              <div style={{ fontSize: '0.9rem', color: '#555' }}>
                {t('low_stock', 'Low Stock')}
              </div>
              <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>0 items</div>
            </div>
            <div style={cardStyle}>
              <div style={{ fontSize: '0.9rem', color: '#555' }}>
                {t('new_orders', 'New Orders')}
              </div>
              <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>0</div>
            </div>
          </div>
        </div>
      </div>

      <div style={tabPanelStyle('activity')}>
        <div>
          <TransactionNotificationWidget filterMode="activity" />
        </div>
      </div>

      <div style={tabPanelStyle('audition')}>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <div style={{ ...cardStyle, flex: '1 1 300px' }}>
            <PendingRequestWidget />
          </div>
          <div style={{ ...cardStyle, flex: '1 1 300px' }}>
            <OutgoingRequestWidget />
          </div>
        </div>
      </div>

      <div style={tabPanelStyle('plans')}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <DutyAssignmentsWidget />
          <TransactionNotificationWidget filterMode="plan" />
          <TransactionNotificationWidget filterMode="duty" />
        </div>
      </div>

      <NotificationsPage
        embedded
        showPageTitle={false}
        sectionTabs={workflowSectionTabs}
        activeDashboardTab={active}
      />
    </div>
  );
}
