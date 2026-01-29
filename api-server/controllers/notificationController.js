import {
  listDynamicTransactionNotifications,
  markNotificationsRead,
} from '../services/notificationService.js';

export async function getNotifications(req, res, next) {
  try {
    const limit = Number(req.query.limit) || 20;
    const offset = Number(req.query.offset) || 0;
    const data = await listDynamicTransactionNotifications({
      empId: req.user?.empid,
      companyId: req.user?.companyId,
      limit,
      offset,
    });
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function updateNotificationsRead(req, res, next) {
  try {
    const ids = Array.isArray(req.body?.ids)
      ? req.body.ids
      : req.body?.id
        ? [req.body.id]
        : [];
    const result = await markNotificationsRead({
      empId: req.user?.empid,
      companyId: req.user?.companyId,
      ids,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
}
