import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../context/ToastContext.jsx';
import { useModules } from '../hooks/useModules.js';
import modulePath from '../utils/modulePath.js';

export default function CompaniesPage() {
  const [companies, setCompanies] = useState([]);
  const [filter, setFilter] = useState('');
  const navigate = useNavigate();
  const { addToast } = useToast();
  const modules = useModules();
  const moduleMap = useMemo(() => {
    const map = {};
    modules.forEach((m) => {
      map[m.module_key] = m;
    });
    return map;
  }, [modules]);

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
    const data = await res.json().catch(() => ({}));
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
      window.dispatchEvent(
        new CustomEvent('toast', {
          detail: {
            message: data.message || 'Failed to add company',
            type: 'error'
          }
        })
      );
      return;
    }
    loadCompanies();
    const id = data.id;
    if (
      id != null &&
      window.confirm('Populate seed table records now?')
    ) {
      const registryModule = moduleMap.tenant_tables_registry;
      if (!registryModule) {
        addToast('Tenant Tables Registry module is unavailable.', 'error');
        return;
      }
      const basePath = modulePath(registryModule, moduleMap);
      const params = new URLSearchParams({ seed: '1', companyId: String(id) });
      navigate(`${basePath}?${params.toString()}`);
    }
  }

  async function handleEdit(c) {
    const name = prompt('Company name?', c.name);
    if (!name) return;
    const reg = prompt('Gov registration number?', c.Gov_Registration_number);
    if (reg == null) return;
    const addr = prompt('Address?', c.Address);
    if (addr == null) return;
    const tel = prompt('Telephone?', c.Telephone);
    if (tel == null) return;
    const res = await fetch('/api/companies/' + c.id, {
      method: 'PUT',
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
    const data = await res.json().catch(() => ({}));
    if (res.status === 403) {
      window.dispatchEvent(
        new CustomEvent('toast', {
          detail: {
            message: 'You need System Settings permission to edit a company.',
            type: 'error'
          }
        })
      );
      return;
    }
    if (!res.ok) {
      window.dispatchEvent(
        new CustomEvent('toast', {
          detail: {
            message: data.message || 'Failed to update company',
            type: 'error'
          }
        })
      );
      return;
    }
    loadCompanies();
  }

  async function handleDelete(id) {
    if (!window.confirm('Are you sure you want to delete this company?')) return;
    const res = await fetch('/api/companies/' + id, {
      method: 'DELETE',
      credentials: 'include',
      skipErrorToast: true
    });
    await res.json().catch(() => ({}));
    if (res.status === 403) {
      addToast('You need System Settings permission to delete a company.', 'error');
      return;
    }
    if (!res.ok) {
      addToast('Failed to delete company', 'error');
      return;
    }
    loadCompanies();
    addToast('Company deleted', 'success');
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
                <th style={{ padding: '0.5rem', border: '1px solid #d1d5db' }}>
                  Action
                </th>
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
                  <td
                    style={{
                      padding: '0.5rem',
                      border: '1px solid #d1d5db',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    <button
                      onClick={() => handleEdit(c)}
                      style={{ marginRight: '0.25rem' }}
                    >
                      Edit
                    </button>
                    <button onClick={() => handleDelete(c.id)}>Delete</button>
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

