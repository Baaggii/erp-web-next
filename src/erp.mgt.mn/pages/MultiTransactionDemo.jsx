import React, { useState } from 'react';
import MultiTransactionModal from '../components/MultiTransactionModal.jsx';

export default function MultiTransactionDemo() {
  const [show, setShow] = useState(false);
  const fields = ['inventory_code', 'qty', 'employee_id'];

  const relationConfigs = {
    inventory_code: {
      table: 'inventory_items',
      column: 'inventory_code',
      displayFields: ['item_name'],
    },
    employee_id: {
      table: 'employees',
      column: 'employee_id',
      displayFields: ['emp_fname', 'emp_lname'],
    },
  };

  function handleSubmit(rows) {
    // rows contain only codes and numeric values
    console.log('Submitted', rows);
    setShow(false);
  }

  return (
    <div>
      <button onClick={() => setShow(true)}>Add Transactions</button>
      <MultiTransactionModal
        visible={show}
        onClose={() => setShow(false)}
        fields={fields}
        relationConfigs={relationConfigs}
        labels={{ inventory_code: 'Inventory', qty: 'Qty', employee_id: 'Employee' }}
        totalAmountFields={['qty']}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
