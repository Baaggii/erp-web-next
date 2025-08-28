import React, { useEffect, useState } from 'react';

export default function CompaniesPage() {
  const [companies, setCompanies] = useState([]);
  const [filter, setFilter] = useState('');

  function loadCompanies() {
    fetch('/api/companies', { credentials: 'include' })
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch companies');
        return res.json();
      })
      .then(setCompanies)
      .catch((err) => console.error('Error fetching companies:', err));
  }

  useEffect(() => {
    loadCompanies();
  }, []);

  async function handleAdd() {
    const name = prompt('Company name?');
    if (!name) return;
    const res = await fetch('/api/companies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ name })
    });
    if (!res.ok) {
      const { message } = await res
        .json()
        .catch(() => ({ message: 'Failed to add company' }));
      alert(message || 'Failed to add company');
      return;
    }
    loadCompanies();
  }

  const visibleCompanies = companies.filter((c) =>
    c.name.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div>
      <h2>Компаниуд</h2>
      <input
        type="text"
        placeholder="Компанийн нэр шүүх"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        style={{ marginRight: '0.5rem' }}
      />
      <button onClick={handleAdd}>Компани нэмэх</button>
      {visibleCompanies.length === 0 ? (
        <p>Компани олдсонгүй.</p>
      ) : (
        <div className="table-container overflow-x-auto" style={{ maxHeight: '70vh' }}>
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              marginTop: '0.5rem'
            }}
          >
            <thead>
              <tr style={{ backgroundColor: '#e5e7eb' }}>
                <th style={{ padding: '0.5rem', border: '1px solid #d1d5db' }}>ID</th>
                <th style={{ padding: '0.5rem', border: '1px solid #d1d5db' }}>Нэр</th>
              </tr>
            </thead>
            <tbody>
              {visibleCompanies.map((c) => (
                <tr key={c.id}>
                  <td style={{ padding: '0.5rem', border: '1px solid #d1d5db' }}>
                    {c.id != null ? c.id : ''}
                  </td>
                  <td style={{ padding: '0.5rem', border: '1px solid #d1d5db' }}>
                    {c.name != null ? c.name : ''}
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

