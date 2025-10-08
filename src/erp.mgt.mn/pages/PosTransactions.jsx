import React from 'react';
import FinanceTransactionsPage from './FinanceTransactions.jsx';

export default function PosTransactionsPage(props) {
  return React.createElement(FinanceTransactionsPage, {
    ...props,
    moduleKey: 'pos_transactions',
  });
}
