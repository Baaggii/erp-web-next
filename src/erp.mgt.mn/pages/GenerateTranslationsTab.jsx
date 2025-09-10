import React, { useContext, useEffect, useState } from 'react';
import I18nContext from '../context/I18nContext.jsx';

export default function GenerateTranslationsTab() {
  const { t } = useContext(I18nContext);
  const [logs, setLogs] = useState([]);
  const [status, setStatus] = useState('');
  const [source, setSource] = useState(null);
  const [filePath, setFilePath] = useState('');

  useEffect(() => {
    window.addEventListener('beforeunload', cancel);
    return () => {
      window.removeEventListener('beforeunload', cancel);
      if (source) cancel();
    };
  }, [source]);

  function start() {
    if (source) return;
    setLogs([]);
    setStatus(t('generationStarted', 'Generation started'));
    const url = filePath
      ? `/api/translations/generate?file=${encodeURIComponent(filePath)}`
      : '/api/translations/generate';
    const es = new EventSource(url);
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
    es.addEventListener('generator_error', (e) => {
      es.close();
      setSource(null);
      setStatus(
        `${t('generationFailed', 'Generation failed')}: ${e.data}`
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
        <input
          type="text"
          placeholder={t('exportedFilePath', 'Exported texts JSON path')}
          value={filePath}
          onChange={(e) => setFilePath(e.target.value)}
          style={{ marginRight: '0.5rem' }}
        />
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
