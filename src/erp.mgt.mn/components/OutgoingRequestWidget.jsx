import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { usePendingRequests } from '../context/PendingRequestContext.jsx';

export default function OutgoingRequestWidget() {
  const navigate = useNavigate();
  const { outgoing } = usePendingRequests();
  const { t } = useTranslation();

  const badgeStyle = {
    display: 'inline-block',
    backgroundColor: 'red',
    color: 'white',
    borderRadius: '50%',
    padding: '0 0.4rem',
    fontSize: '0.8rem',
    marginLeft: '0.25rem',
  };

  return (
    <div>
      <h3>{t('outgoing_requests.heading', 'Outgoing requests')}</h3>
      <div style={{ display: 'flex', gap: '1rem' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '0.9rem', color: '#555' }}>
            {t('outgoing_requests.pending', 'Pending')}
          </div>
          <div style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>
            {outgoing.pending.count}
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '0.9rem', color: '#555' }}>
            {t('outgoing_requests.accepted', 'Accepted')}
            {outgoing.accepted.hasNew && (
              <span style={badgeStyle}>{outgoing.accepted.newCount}</span>
            )}
          </div>
          <div style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>
            {outgoing.accepted.count}
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '0.9rem', color: '#555' }}>
            {t('outgoing_requests.declined', 'Declined')}
            {outgoing.declined.hasNew && (
              <span style={badgeStyle}>{outgoing.declined.newCount}</span>
            )}
          </div>
          <div style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>
            {outgoing.declined.count}
          </div>
        </div>
      </div>
      <button onClick={() => navigate('/requests?tab=outgoing')}>
        {t('requests.view', 'View requests')}
      </button>
    </div>
  );
}
