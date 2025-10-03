import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { usePendingRequests } from '../context/PendingRequestContext.jsx';

export default function PendingRequestWidget() {
  const navigate = useNavigate();
  const { incoming } = usePendingRequests();
  const { t } = useTranslation();
  const count = incoming.pending.count;

  const badgeStyle = {
    display: 'inline-block',
    backgroundColor: 'red',
    color: 'white',
    borderRadius: '50%',
    padding: '0.25rem 0.5rem',
    minWidth: '1.5rem',
    textAlign: 'center',
    marginLeft: '0.5rem',
  };

  return (
    <div>
      <h3>
        {t('pendingRequestWidget.incomingRequestsHeading', 'Incoming requests')}
        {count > 0 && <span style={badgeStyle}>{count}</span>}
      </h3>
      {count > 0 ? (
        <p>
          {t('pendingRequestWidget.incomingRequestCount', {
            count,
            defaultValue: '{{count}} incoming request',
            defaultValue_plural: '{{count}} incoming requests',
          })}
        </p>
      ) : (
        <p>
          {t('pendingRequestWidget.noIncomingRequests', 'No incoming requests')}
        </p>
      )}
      <button onClick={() => navigate('/requests?tab=incoming')}>
        {t('requestWidget.viewRequestsButton', 'View requests')}
      </button>
    </div>
  );
}
