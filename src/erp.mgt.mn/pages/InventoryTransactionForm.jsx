import React, { useEffect, useState } from 'react';
import DynamicCodeForm from '../components/DynamicCodeForm.jsx';

export default function InventoryTransactionForm() {
  const [form, setForm] = useState(null);

  useEffect(() => {
    fetch('/api/forms', { credentials: 'include' })
      .then((res) => res.ok ? res.json() : [])
      .then((forms) => {
        const f = forms.find((f) => f.id === 'inventory_transaction');
        if (f) setForm(f);
      })
      .catch(() => {});
  }, []);

  async function handleSubmit(data) {
    await fetch('/api/tables/inventory_transactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(data),
    });
    alert('Saved');
  }

  return (
    <div>
      <h2>Inventory Transaction</h2>
      {form ? (
        <DynamicCodeForm form={form} onSubmit={handleSubmit} />
      ) : (
        <p>Loading...</p>
      )}
    </div>
  );
}
