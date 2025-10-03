import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { usePendingRequests } from '../context/PendingRequestContext.jsx';

export default function PendingRequestWidget() {
  const navigate = useNavigate();
  const { categories, order, incoming } = usePendingRequests();
  const { t } = useTranslation();

  const totalPending = incoming?.pending?.count ?? 0;
  const totalNew = incoming?.pending?.newCount ?? 0;

  const headerBadgeStyle = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1d4ed8',
    color: '#fff',
    borderRadius: '999px',
    padding: '0.1rem 0.6rem',
    fontSize: '0.75rem',
    marginLeft: '0.4rem',
  };

  const newBadgeStyle = {
    backgroundColor: '#dc2626',
    color: '#fff',
    borderRadius: '999px',
    padding: '0 0.4rem',
    fontSize: '0.7rem',
    marginLeft: '0.35rem',
  };

  const categoryButtonStyle = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    border: '1px solid #cbd5f5',
    borderRadius: '0.5rem',
    padding: '0.6rem 0.85rem',
    background: '#fff',
    cursor: 'pointer',
    fontSize: '0.9rem',
    fontWeight: 500,
  };

  const goToView = (key) => {
    const category = categories?.[key];
    category?.markSeen?.();
    navigate(`/requests?tab=incoming&view=${key}`);
  };

  return (
    <div>
      <h3 style={{ display: 'flex', alignItems: 'center' }}>
        {t('pendingRequestWidget.incomingRequestsHeading', 'Incoming requests')}
        {totalPending > 0 && (
          <span style={headerBadgeStyle}>{totalPending}</span>
        )}
        {totalNew > 0 && <span style={newBadgeStyle}>+{totalNew}</span>}
      </h3>
      {totalPending > 0 ? (
        <p>
          {t('pendingRequestWidget.incomingRequestCount', {
            count: totalPending,
            defaultValue: '{{count}} incoming request',
            defaultValue_plural: '{{count}} incoming requests',
          })}
        </p>
      ) : (
        <p>
          {t('pendingRequestWidget.noIncomingRequests', 'No incoming requests')}
        </p>
      )}
      <div style={{ display: 'grid', gap: '0.5rem', margin: '0.75rem 0' }}>
        {order.map((key) => {
          const category = categories?.[key];
          if (!category) return null;
          const pendingEntry = category.incoming?.pending || {
            count: 0,
            hasNew: false,
            newCount: 0,
          };
          return (
            <button
              type="button"
              key={key}
              onClick={() => goToView(key)}
              style={categoryButtonStyle}
            >
              <span>{category.label}</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <span style={{ fontWeight: 600 }}>{pendingEntry.count}</span>
                {pendingEntry.hasNew && pendingEntry.newCount > 0 ? (
                  <span style={newBadgeStyle}>+{pendingEntry.newCount}</span>
                ) : null}
              </span>
            </button>
          );
        })}
      </div>
      <button onClick={() => navigate('/requests?tab=incoming')}>
        {t('requestWidget.viewRequestsButton', 'View requests')}
      </button>
    </div>
  );
}
