import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import useGeneralConfig from '../hooks/useGeneralConfig.js';
import { useTransactionNotifications } from '../context/TransactionNotificationContext.jsx';

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
const TRANSACTION_TABLE_KEYS = [
  'transactionTable',
  'transaction_table',
  'table',
  'tableName',
  'table_name',
];
const DEFAULT_PLAN_NOTIFICATION_FIELDS = ['is_plan', 'is_plan_completion'];
const DEFAULT_PLAN_NOTIFICATION_VALUES = ['1'];
const DEFAULT_DUTY_NOTIFICATION_FIELDS = [];
const DEFAULT_DUTY_NOTIFICATION_VALUES = ['1'];

function normalizeText(value) {
  if (value === undefined || value === null) return '';
  return String(value).trim().toLowerCase();
}

function normalizeFieldName(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
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
  if (typeof value === 'number' || typeof value === 'boolean') {
    return [String(value)];
  }
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);
  }
  return [];
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

function getRowFieldValue(row, fieldName) {
  if (!row || !fieldName) return undefined;
  if (Object.prototype.hasOwnProperty.call(row, fieldName)) {
    return row[fieldName];
  }
  const normalizedTarget = normalizeFieldName(fieldName);
  if (!normalizedTarget) return undefined;
  const matchKey = Object.keys(row).find(
    (key) => normalizeFieldName(key) === normalizedTarget,
  );
  return matchKey ? row[matchKey] : undefined;
}

function getActionMeta(action) {
  const normalized = typeof action === 'string' ? action.trim().toLowerCase() : '';
  if (normalized === 'excluded' || normalized === 'exclude') {
    return { label: 'Excluded', accent: '#ea580c' };
  }
  if (normalized === 'included' || normalized === 'include') {
    return { label: 'Included', accent: '#059669' };
  }
  if (normalized === 'deleted' || normalized === 'delete') {
    return { label: 'Deleted', accent: '#dc2626' };
  }
  if (normalized === 'edited' || normalized === 'edit' || normalized === 'update') {
    return { label: 'Edited', accent: '#2563eb' };
  }
  if (normalized === 'changed' || normalized === 'change') {
    return { label: 'Changed', accent: '#d97706' };
  }
  if (normalized) {
    return { label: normalized.charAt(0).toUpperCase() + normalized.slice(1), accent: '#059669' };
  }
  return { label: 'New', accent: '#059669' };
}

function buildPreviewText(item) {
  if (!item) return 'Transaction update';
  if (item.summaryText) return item.summaryText;
  const meta = getActionMeta(item.action);
  if (meta.label === 'Deleted') return 'Transaction deleted';
  if (meta.label === 'Edited') return 'Transaction edited';
  if (meta.label === 'Changed') return 'Transaction changed';
  return 'Transaction update';
}

function getNotificationTimestamp(notification) {
  if (!notification) return 0;
  const raw = notification.updatedAt || notification.createdAt || 0;
  const ts = new Date(raw).getTime();
  return Number.isFinite(ts) ? ts : 0;
}

export default function TransactionNotificationDropdown() {
  const { notifications, unreadCount, markRead } = useTransactionNotifications();
  const [open, setOpen] = useState(false);
  const [codeTransactions, setCodeTransactions] = useState([]);
  const containerRef = useRef(null);
  const navigate = useNavigate();
  const generalConfig = useGeneralConfig();

  const sortedNotifications = useMemo(
    () =>
      [...notifications]
        .sort((a, b) => getNotificationTimestamp(b) - getNotificationTimestamp(a))
        .slice(0, 8),
    [notifications],
  );

  useEffect(() => {
    const handleClick = (event) => {
      if (!containerRef.current) return;
      if (containerRef.current.contains(event.target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  useEffect(() => {
    let canceled = false;
    fetch('/api/tables/code_transaction?perPage=500', {
      credentials: 'include',
      skipErrorToast: true,
      skipLoader: true,
    })
      .then((res) => (res.ok ? res.json() : { rows: [] }))
      .then((data) => {
        if (canceled) return;
        setCodeTransactions(Array.isArray(data?.rows) ? data.rows : []);
      })
      .catch(() => {
        if (!canceled) setCodeTransactions([]);
      });
    return () => {
      canceled = true;
    };
  }, []);

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

  const isPlanNotificationRow = useCallback(
    (row) => {
      if (!row) return false;
      const normalizedValues = planNotificationConfig.values.map(normalizeMatch);
      return planNotificationConfig.fields.some((field) => {
        const value = getRowFieldValue(row, field);
        if (value === undefined || value === null || value === '') return false;
        if (normalizedValues.length === 0) return normalizeFlagValue(value);
        return normalizedValues.includes(normalizeMatch(value));
      });
    },
    [planNotificationConfig],
  );

  const isDutyNotificationRow = useCallback(
    (row) => {
      if (!row) return false;
      const normalizedValues = dutyNotificationConfig.values.map(normalizeMatch);
      return dutyNotificationConfig.fields.some((field) => {
        const value = getRowFieldValue(row, field);
        if (value === undefined || value === null || value === '') return false;
        if (normalizedValues.length === 0) return normalizeFlagValue(value);
        return normalizedValues.includes(normalizeMatch(value));
      });
    },
    [dutyNotificationConfig],
  );

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

  const findTransactionRow = useCallback(
    (item) => {
      if (!item) return null;
      const nameKey = normalizeText(item.transactionName);
      if (nameKey && planTransactionsByName.has(nameKey)) {
        return planTransactionsByName.get(nameKey);
      }
      const tableKey = normalizeText(item.transactionTable);
      if (tableKey && planTransactionsByName.has(`table:${tableKey}`)) {
        return planTransactionsByName.get(`table:${tableKey}`);
      }
      return null;
    },
    [planTransactionsByName],
  );

  const isPlanNotificationItem = useCallback(
    (item) => {
      if (!item) return false;
      const row = findTransactionRow(item);
      return isPlanNotificationRow(row);
    },
    [findTransactionRow, isPlanNotificationRow],
  );

  const isDutyNotificationItem = useCallback(
    (item) => {
      if (!item) return false;
      const row = findTransactionRow(item);
      return isDutyNotificationRow(row);
    },
    [findTransactionRow, isDutyNotificationRow],
  );

  const handleNotificationClick = async (item) => {
    if (!item) return;
    setOpen(false);
    await markRead([item.id]);
    const groupKey = encodeURIComponent(item.transactionName || 'Transaction');
    const tab = isPlanNotificationItem(item) || isDutyNotificationItem(item) ? 'plans' : 'activity';
    const params = new URLSearchParams({
      tab,
      notifyGroup: groupKey,
      notifyItem: item.id,
    });
    navigate(`/?${params.toString()}`);
  };

  return (
    <div style={styles.wrapper} ref={containerRef}>
      <button
        type="button"
        style={styles.button}
        onClick={() => setOpen((prev) => !prev)}
      >
        <span aria-hidden="true">🔔</span>
        {unreadCount > 0 && <span style={styles.badge}>{unreadCount}</span>}
      </button>
      {open && (
        <div style={styles.dropdown}>
          <div style={styles.list}>
            {sortedNotifications.length === 0 && (
              <div style={styles.empty}>No notifications yet</div>
            )}
            {sortedNotifications.map((item) => {
              const itemMeta = getActionMeta(item?.action);
              return (
                <button
                  key={item.id}
                  type="button"
                  style={styles.notificationItem(item?.isRead === false)}
                  onClick={() => handleNotificationClick(item)}
                >
                  <div style={styles.notificationTitle}>
                    <span>{item.transactionName || 'Transaction'}</span>
                    <span style={styles.actionBadge(itemMeta.accent)}>{itemMeta.label}</span>
                  </div>
                  <div style={styles.notificationPreview}>{buildPreviewText(item)}</div>
                </button>
              );
            })}
          </div>
          <button
            type="button"
            style={styles.footer}
            onClick={() => {
              setOpen(false);
              navigate('/?tab=activity');
            }}
          >
            Open dashboard
          </button>
        </div>
      )}
    </div>
  );
}

const styles = {
  wrapper: {
    position: 'relative',
    marginLeft: '0.75rem',
  },
  button: {
    position: 'relative',
    background: 'transparent',
    border: 'none',
    color: '#fff',
    cursor: 'pointer',
    fontSize: '1.05rem',
    padding: '0.35rem 0.5rem',
    borderRadius: '999px',
  },
  badge: {
    position: 'absolute',
    top: '-4px',
    right: '-2px',
    background: '#e11d48',
    color: '#fff',
    borderRadius: '999px',
    fontSize: '0.7rem',
    padding: '0 0.4rem',
    lineHeight: '1.3rem',
  },
  dropdown: {
    position: 'absolute',
    right: 0,
    marginTop: '0.4rem',
    width: '320px',
    background: '#fff',
    borderRadius: '12px',
    boxShadow: '0 12px 30px rgba(15,23,42,0.2)',
    overflow: 'hidden',
    zIndex: 60,
  },
  list: {
    maxHeight: '360px',
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.6rem',
    padding: '0.75rem 1rem 1rem',
  },
  empty: {
    padding: '1rem',
    color: '#64748b',
    textAlign: 'center',
  },
  notificationItem: (isUnread) => ({
    width: '100%',
    textAlign: 'left',
    border: '1px solid #e2e8f0',
    borderRadius: '10px',
    background: isUnread ? '#eff6ff' : '#fff',
    padding: '0.6rem 0.75rem',
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.35rem',
  }),
  notificationTitle: {
    fontWeight: 600,
    color: '#0f172a',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.5rem',
  },
  actionBadge: (accent) => ({
    background: accent || '#2563eb',
    color: '#fff',
    borderRadius: '999px',
    padding: '0.1rem 0.45rem',
    fontSize: '0.65rem',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  }),
  notificationPreview: {
    fontSize: '0.8rem',
    color: '#334155',
  },
  footer: {
    width: '100%',
    border: 'none',
    background: '#f1f5f9',
    padding: '0.75rem',
    fontWeight: 600,
    cursor: 'pointer',
  },
};
