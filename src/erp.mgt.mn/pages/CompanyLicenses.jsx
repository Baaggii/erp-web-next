// src/erp.mgt.mn/pages/CompanyLicenses.jsx
import React, { useState } from 'react';

export default function CompanyLicenses() {
  const [licenses, setLicenses] = useState([]);
  const [filterCompanyId, setFilterCompanyId] = useState('');

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
    const res = await fetch('/api/company_modules', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        companyId: l.company_id || filterCompanyId,
        moduleKey: l.module_key,
        licensed: l.licensed ? 0 : 1,
      }),
    });
    if (!res.ok) {
      alert('Failed to update license');
      return;
    }
    loadLicenses(filterCompanyId);
  }

  return (
    <div>
      <h2>Company Licenses</h2>
      <input
        type="text"
        placeholder="Filter by Company ID"
        value={filterCompanyId}
        onChange={(e) => setFilterCompanyId(e.target.value)}
        style={{ marginRight: '0.5rem' }}
      />
      <button onClick={handleFilter}>Apply</button>
      {licenses.length === 0 ? (
        <p>No licenses.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '0.5rem' }}>
          <thead>
            <tr style={{ backgroundColor: '#e5e7eb' }}>
              <th style={{ padding: '0.5rem', border: '1px solid #d1d5db' }}>Company</th>
              <th style={{ padding: '0.5rem', border: '1px solid #d1d5db' }}>Module</th>
              <th style={{ padding: '0.5rem', border: '1px solid #d1d5db' }}>Licensed</th>
              <th style={{ padding: '0.5rem', border: '1px solid #d1d5db' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {licenses.map((l) => (
              <tr key={l.company_id + '-' + l.module_key}>
                <td style={{ padding: '0.5rem', border: '1px solid #d1d5db' }}>{l.company_name}</td>
                <td style={{ padding: '0.5rem', border: '1px solid #d1d5db' }}>{l.label}</td>
                <td style={{ padding: '0.5rem', border: '1px solid #d1d5db' }}>{l.licensed ? 'Yes' : 'No'}</td>
                <td style={{ padding: '0.5rem', border: '1px solid #d1d5db' }}>
                  <button onClick={() => handleToggle(l)}>
                    {l.licensed ? 'Disable' : 'Enable'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
