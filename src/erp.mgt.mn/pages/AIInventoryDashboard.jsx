import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import useGeneralConfig from '../hooks/useGeneralConfig.js';

export default function AIInventoryDashboard() {
  const [data, setData] = useState({});
  const [error, setError] = useState('');
  const generalConfig = useGeneralConfig();
  const { t } = useTranslation();

  async function fetchData() {
    try {
      const res = await fetch('/api/ai_inventory/results', { credentials: 'include' });
      const json = await res.json();
      setData(json);
      setError('');
    } catch (err) {
      console.error(err);
      setError(t('ai_inventory.failed_to_load', 'Failed to load results'));
      setData({});
    }
  }

  useEffect(() => {
    fetchData();
  }, []);

  async function confirm(id) {
    await fetch(`/api/ai_inventory/results/${id}/confirm`, {
      method: 'POST',
      credentials: 'include',
    });
    fetchData();
  }

  if (!generalConfig.general?.aiInventoryApiEnabled) {
    return <p>{t('ai_inventory.api_disabled', 'AI Inventory API disabled.')}</p>;
  }

  const entries = Object.entries(data);
  return (
    <div>
      <h2>{t('ai_inventory.results_heading', 'AI Inventory Results')}</h2>
      <button onClick={fetchData}>{t('ai_inventory.refresh', 'Refresh')}</button>
      {error && <p className="text-red-600 mt-1">{error}</p>}
      {entries.length === 0 ? (
        <p className="mt-2">{t('ai_inventory.no_results', 'No AI inventory results.')}</p>
      ) : (
        <table className="min-w-full border mt-2 text-sm">
          <thead>
            <tr>
              <th className="border px-2">{t('ai_inventory.id', 'ID')}</th>
              <th className="border px-2">{t('ai_inventory.employee', 'Employee')}</th>
              <th className="border px-2">{t('ai_inventory.items', 'Items')}</th>
              <th className="border px-2">{t('ai_inventory.confirmed', 'Confirmed')}</th>
              <th className="border px-2">{t('ai_inventory.actions', 'Actions')}</th>
            </tr>
          </thead>
          <tbody>
            {entries.map(([id, rec]) => (
              <tr key={id} className="odd:bg-gray-50">
                <td className="border px-2">{id}</td>
                <td className="border px-2">{rec.empid}</td>
                <td className="border px-2">
                  {rec.items.map((it, idx) => (
                    <div key={idx}>{`${it.code} - ${it.qty}`}</div>
                  ))}
                </td>
                <td className="border px-2">{rec.confirmed ? t('common.yes', 'Yes') : t('common.no', 'No')}</td>
                <td className="border px-2">
                  {!rec.confirmed && (
                    <button onClick={() => confirm(id)}>
                      {t('ai_inventory.confirm', 'Confirm')}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
