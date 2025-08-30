import React, { useEffect, useMemo, useState } from 'react';

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
    const reg = prompt('Gov registration number?');
    if (reg == null) return;
    const addr = prompt('Address?');
    if (addr == null) return;
    const tel = prompt('Telephone?');
    if (tel == null) return;
    const res = await fetch('/api/companies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      skipErrorToast: true,
      body: JSON.stringify({
        name,
        Gov_Registration_number: reg,
        Address: addr,
        Telephone: tel
      })
    });
    if (res.status === 403) {
      window.dispatchEvent(
        new CustomEvent('toast', {
          detail: {
            message: 'You need System Settings permission to add a company.',
            type: 'error'
          }
        })
      );
      return;
    }
    if (!res.ok) {
      const { message } = await res
        .json()
        .catch(() => ({ message: 'Failed to add company' }));
      window.dispatchEvent(
        new CustomEvent('toast', {
          detail: { message: message || 'Failed to add company', type: 'error' }
        })
      );
      return;
    }
    loadCompanies();
  }

  const visibleCompanies = companies.filter((c) =>
    (c.name || '').toLowerCase().includes(filter.toLowerCase())
  );

  const columns = useMemo(() => {
    const set = new Set(['id', 'name']);
    companies.forEach((c) => {
      Object.keys(c).forEach((k) => set.add(k));
    });
    return Array.from(set);
  }, [companies]);

  return (
    <div>
      <h2>Компаниуд</h2>
      <p style={{ fontSize: '0.875rem', color: '#4b5563' }}>
        Зөвхөн таны үүсгэсэн компаниудыг харуулна.
      </p>
      <input
        type="text"
        placeholder="Компанийн нэр шүүх"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        style={{ marginRight: '0.5rem' }}
      />
      <button onClick={handleAdd}>Компани нэмэх</button>
      {visibleCompanies.length === 0 ? (
        <p>
          Таны үүсгэсэн компани олдсонгүй. Компани нэмэх товчийг ашиглан шинэ
          компани үүсгэнэ үү.
        </p>
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
                {columns.map((col) => (
                  <th
                    key={col}
                    style={{ padding: '0.5rem', border: '1px solid #d1d5db' }}
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleCompanies.map((c, i) => (
                <tr key={c.id ?? i}>
                  {columns.map((col) => (
                    <td
                      key={col}
                      style={{
                        padding: '0.5rem',
                        border: '1px solid #d1d5db'
                      }}
                    >
                      {c[col] != null ? c[col] : ''}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

