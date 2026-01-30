import {
  listTransactionNotifications,
  markTransactionNotificationRead,
  parseNotificationCursor,
} from '../services/transactionNotifications.js';

export async function getTransactionNotifications(req, res, next) {
  try {
    const cursor = parseNotificationCursor(req.query.cursor);
    const limit = Number(req.query.limit) || undefined;
    const result = await listTransactionNotifications({
      empId: req.user.empid,
      companyId: req.user.companyId,
      limit,
      cursor,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function markTransactionNotificationReadHandler(req, res, next) {
  try {
    const notificationId = Number(req.params.id);
    if (!Number.isFinite(notificationId)) {
      return res.status(400).json({ message: 'Invalid notification id' });
    }
    const updated = await markTransactionNotificationRead({
      notificationId,
      empId: req.user.empid,
      companyId: req.user.companyId,
    });
    if (!updated) return res.sendStatus(404);
    return res.sendStatus(204);
  } catch (err) {
    next(err);
  }
}
