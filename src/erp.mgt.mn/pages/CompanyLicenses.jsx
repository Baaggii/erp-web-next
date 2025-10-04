// src/erp.mgt.mn/pages/CompanyLicenses.jsx
import React, { useState, useEffect, useContext } from 'react';
import { AuthContext } from '../context/AuthContext.jsx';
import { refreshCompanyModules } from '../hooks/useCompanyModules.js';
import { refreshModules } from '../hooks/useModules.js';

export default function CompanyLicenses() {
  const [licenses, setLicenses] = useState([]);
  const [filterCompanyId, setFilterCompanyId] = useState('');
  const { company } = useContext(AuthContext);

  useEffect(() => {
    loadLicenses(company || '');
  }, [company]);

  function loadLicenses(companyId) {
    const url = companyId ? `/api/company_modules?companyId=${encodeURIComponent(companyId)}` : '/api/company_modules';
    fetch(url, { credentials: 'include' })
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch licenses');
        return res.json();
      })
      .then(setLicenses)
      .catch(err => console.error('Error fetching licenses:', err));
  }

  function handleFilter() {
    loadLicenses(filterCompanyId);
  }

  async function handleToggle(l) {
    const targetCompanyId =
      l.company_id ?? (filterCompanyId !== '' ? filterCompanyId : undefined);
    const res = await fetch('/api/company_modules', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        companyId: targetCompanyId ?? '',
        moduleKey: l.module_key,
        licensed: l.licensed ? 0 : 1,
      }),
    });
    if (!res.ok) {
      alert('Failed to update license');
      return;
    }
    loadLicenses(filterCompanyId);
    if (targetCompanyId != null && String(targetCompanyId) !== '') {
      refreshCompanyModules(targetCompanyId);
      if (company != null && String(targetCompanyId) === String(company)) {
        refreshModules();
      }
    }
  }

  return (
    <div>
      <h2>Лиценз</h2>
      <p style={{ fontSize: '0.875rem', color: '#4b5563' }}>
        Зөвхөн таны үүсгэсэн компаниудын лицензүүдийг харуулна.
      </p>
      <input
        type="text"
        placeholder="Компанийн ID-р шүүх"
        value={filterCompanyId}
        onChange={(e) => setFilterCompanyId(e.target.value)}
        style={{ marginRight: '0.5rem' }}
      />
      <button onClick={handleFilter}>Шүүх</button>
      {licenses.length === 0 ? (
        <p>
          Лиценз олдсонгүй. Таны үүсгэсэн компаниудад лиценз тохируулаагүй
          байна.
        </p>
      ) : (
        <div className="table-container overflow-x-auto" style={{ maxHeight: '70vh' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '0.5rem' }}>
          <thead>
            <tr style={{ backgroundColor: '#e5e7eb' }}>
              <th style={{ padding: '0.5rem', border: '1px solid #d1d5db' }}>Компани</th>
              <th style={{ padding: '0.5rem', border: '1px solid #d1d5db' }}>Модуль</th>
              <th style={{ padding: '0.5rem', border: '1px solid #d1d5db' }}>Идэвхтэй эсэх</th>
              <th style={{ padding: '0.5rem', border: '1px solid #d1d5db' }}>Үйлдэл</th>
            </tr>
          </thead>
          <tbody>
            {licenses.map((l) => (
              <tr key={l.company_id + '-' + l.module_key}>
                <td style={{ padding: '0.5rem', border: '1px solid #d1d5db' }}>{l.company_name}</td>
                <td style={{ padding: '0.5rem', border: '1px solid #d1d5db' }}>{l.label}</td>
                <td style={{ padding: '0.5rem', border: '1px solid #d1d5db' }}>{l.licensed ? 'Тийм' : 'Үгүй'}</td>
                <td style={{ padding: '0.5rem', border: '1px solid #d1d5db' }}>
                  <button onClick={() => handleToggle(l)}>
                    {l.licensed ? 'Идэвхгүй болгох' : 'Идэвхжүүлэх'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
    </div>
  );
}

