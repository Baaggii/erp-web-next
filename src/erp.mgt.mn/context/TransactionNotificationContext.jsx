import { createContext, useContext } from 'react';

export const TransactionNotificationContext = createContext({
  notifications: [],
  groups: [],
  unreadCount: 0,
  isConnected: false,
  refresh: () => Promise.resolve(),
  markRead: () => Promise.resolve(),
  markGroupRead: () => Promise.resolve(),
});

export function useTransactionNotifications() {
  return useContext(TransactionNotificationContext);
}
