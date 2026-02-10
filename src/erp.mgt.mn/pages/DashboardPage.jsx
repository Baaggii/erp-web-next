import React, { useContext, useState, useEffect, useRef } from 'react';
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

export default function DashboardPage() {
  const { user, session } = useContext(AuthContext);
  const { hasNew, markSeen, outgoing } = usePendingRequests();
  const { unreadCount } = useTransactionNotifications();
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

  return (
    <div style={{ padding: '1rem' }}>
      <div style={{ display: 'flex', borderBottom: '1px solid #ddd', marginBottom: '1rem' }}>
        {tabButton('general', t('general', 'General'))}
        {tabButton('activity', t('activity', 'Activity'), unreadCount, unreadCount > 0)}
        {tabButton(
          'audition',
          t('audition', 'Audition'),
          acceptedNewCount + declinedNewCount,
          hasNew,
        )}
        {tabButton('plans', t('plans', 'Plans'))}
      </div>

      {active === 'general' && (
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
      )}

      {active === 'activity' && (
        <div>
          <TransactionNotificationWidget filterMode="activity" />
          <NotificationsPage
            embedded
            showPageTitle={false}
            sectionTabs={workflowSectionTabs}
            activeDashboardTab="activity"
          />
        </div>
      )}

      {active === 'audition' && (
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <div style={{ ...cardStyle, flex: '1 1 300px' }}>
            <PendingRequestWidget />
          </div>
          <div style={{ ...cardStyle, flex: '1 1 300px' }}>
            <OutgoingRequestWidget />
          </div>
          <div style={{ flexBasis: '100%' }}>
            <NotificationsPage
              embedded
              showPageTitle={false}
              sectionTabs={workflowSectionTabs}
              activeDashboardTab="audition"
            />
          </div>
        </div>
      )}

      {active === 'plans' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <DutyAssignmentsWidget />
          <TransactionNotificationWidget filterMode="plan" />
          <TransactionNotificationWidget filterMode="duty" />
          <NotificationsPage
            embedded
            showPageTitle={false}
            sectionTabs={workflowSectionTabs}
            activeDashboardTab="plans"
          />
        </div>
      )}

      {active === 'general' && (
        <NotificationsPage
          embedded
          showPageTitle={false}
          sectionTabs={workflowSectionTabs}
          activeDashboardTab="general"
        />
      )}
    </div>
  );
}
