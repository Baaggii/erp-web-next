import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { usePendingRequests } from '../context/PendingRequestContext.jsx';

export default function PendingRequestWidget() {
  const navigate = useNavigate();
  const { incoming } = usePendingRequests();
  const count = incoming.pending.count;
  const { t } = useTranslation();

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
        {t('pending_requests.heading', 'Incoming requests')}
        {count > 0 && <span style={badgeStyle}>{count}</span>}
      </h3>
      {count > 0 ? (
        <p>
          {t('pending_requests.count', `${count} incoming request`, { count })}
        </p>
      ) : (
        <p>{t('pending_requests.none', 'No incoming requests')}</p>
      )}
      <button onClick={() => navigate('/requests?tab=incoming')}>
        {t('requests.view', 'View requests')}
      </button>
    </div>
  );
}
