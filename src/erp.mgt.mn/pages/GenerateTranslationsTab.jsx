import React, { useContext, useEffect, useState } from 'react';
import I18nContext from '../context/I18nContext.jsx';

export default function GenerateTranslationsTab() {
  const { t } = useContext(I18nContext);
  const [logs, setLogs] = useState([]);
  const [status, setStatus] = useState('');
  const [source, setSource] = useState(null);

  useEffect(() => {
    return () => {
      if (source) source.close();
    };
  }, [source]);

  function start() {
    if (source) return;
    setLogs([]);
    setStatus(t('generationStarted', 'Generation started'));
    const es = new EventSource('/api/translations/generate');
    es.onmessage = (e) => {
      if (e.data === '[DONE]') {
        setStatus(t('generationCompleted', 'Generation completed'));
        es.close();
        setSource(null);
      } else {
        setLogs((prev) => [...prev, e.data]);
      }
    };
    es.onerror = () => {
      es.close();
      setSource(null);
      setStatus(t('generationFailed', 'Generation failed'));
    };
    es.addEventListener('error', (e) => {
      es.onerror();
      setStatus(
        t('generationFailed', 'Generation failed') + ': ' + (e.data || 'Unknown error')
      );
    });
    setSource(es);
  }

  async function cancel() {
    if (!source) return;
    try {
      await fetch('/api/translations/generate/stop', { method: 'POST' });
    } catch {}
    source.close();
    setSource(null);
    setStatus(t('generationCancelled', 'Generation cancelled'));
  }

  return (
    <div>
      <div style={{ marginBottom: '0.5rem' }}>
        <button onClick={start} disabled={!!source}>
          {t('start', 'Start')}
        </button>
        <button onClick={cancel} disabled={!source} style={{ marginLeft: '0.5rem' }}>
          {t('cancel', 'Cancel')}
        </button>
      </div>
      <pre
        style={{
          maxHeight: '300px',
          overflow: 'auto',
          background: '#f5f5f5',
          padding: '0.5rem',
        }}
      >
        {logs.join('\n')}
      </pre>
      {status && <div style={{ marginTop: '0.5rem' }}>{status}</div>}
    </div>
  );
}
