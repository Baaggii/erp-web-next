import React, { useRef } from 'react';
import Modal from './Modal.jsx';
import InlineTransactionTable from './InlineTransactionTable.jsx';

export default function MultiTransactionModal({
  visible,
  onClose,
  fields = [],
  relations = {},
  relationConfigs = {},
  labels = {},
  totalAmountFields = [],
  totalCurrencyFields = [],
  onSubmit = () => {},
}) {
  const tableRef = useRef(null);

  function handleSubmit() {
    if (!tableRef.current) return;
    const rows = tableRef.current.getRows();
    const cleaned = rows
      .map((row) => {
        const obj = {};
        fields.forEach((f) => {
          const val = row[f];
          obj[f] = typeof val === 'object' && val !== null && 'value' in val ? val.value : val;
        });
        return obj;
      })
      .filter((r) => Object.values(r).some((v) => v !== '' && v !== null && v !== undefined));
    onSubmit(cleaned);
    tableRef.current.clearRows();
  }

  if (!visible) return null;

  return (
    <Modal visible={visible} title="Transactions" onClose={onClose} width="90%">
      <InlineTransactionTable
        ref={tableRef}
        fields={fields}
        relations={relations}
        relationConfigs={relationConfigs}
        labels={labels}
        totalAmountFields={totalAmountFields}
        totalCurrencyFields={totalCurrencyFields}
        collectRows={true}
      />
      <div style={{ marginTop: '0.5rem', textAlign: 'right' }}>
        <button onClick={onClose} style={{ marginRight: '0.5rem' }}>
          Cancel
        </button>
        <button onClick={handleSubmit}>Submit</button>
      </div>
    </Modal>
  );
}
