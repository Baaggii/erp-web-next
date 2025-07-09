# POS Transaction Configuration

The file `config/posTransactionConfigs.json` defines how a POS transaction is
composed from multiple table transactions. Each entry uses the following
structure:

```json
{
  "Transaction Name": {
    "moduleKey": "pos_transaction_management",
    "masterTable": "transactions_pos",
    "tables": [
      {
        "table": "transactions_posorder",
        "transaction": "Order Entry",
        "position": "upper_left",
        "multiRow": true
      }
    ],
    "calculatedFields": [
      {
        "target": "transactions_pos.total_amount",
        "expression": "SUM(transactions_posorder.inventory_price)"
      }
    ],
    "status": { "beforePost": 0, "afterPost": 1 }
  }
}
```

`moduleKey` links the configuration to the `pos_transaction_management` module.
`masterTable` specifies the table that stores the primary POS record.  Each
entry in `tables` chooses a transaction form from `forms_management` and assigns
it to a window position. The `multiRow` flag indicates whether the table will
hold multiple rows per POS transaction.

To display the module in the application sidebar you must also create a
transaction form entry with `moduleKey` set to `pos_transaction_management` in
`config/transactionForms.json`.  A minimal configuration is:

```json
{
  "transactions_pos": {
    "Simple POS": {
      "moduleKey": "pos_transaction_management"
    }
  }
}
```

`calculatedFields` define expressions that sync fields across the selected
tables. The `status` block specifies the value of `transactions_pos.status`
before and after posting the transaction.
