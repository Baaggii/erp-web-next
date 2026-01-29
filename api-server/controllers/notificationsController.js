import {
  listNotifications,
  listNotificationSummary,
  markNotificationsRead,
} from '../services/notifications.js';

export async function getNotifications(req, res, next) {
  try {
    const {
      page,
      per_page,
      perPage,
      unread_only,
      unreadOnly,
    } = req.query;
    const unreadFlag =
      typeof unread_only === 'string'
        ? ['1', 'true', 'yes'].includes(unread_only.trim().toLowerCase())
        : Boolean(unread_only);
    const unreadFlagFallback =
      typeof unreadOnly === 'string'
        ? ['1', 'true', 'yes'].includes(unreadOnly.trim().toLowerCase())
        : Boolean(unreadOnly);
    const result = await listNotifications({
      empid: req.user?.empid,
      companyId: req.user?.companyId,
      page,
      perPage: per_page ?? perPage,
      unreadOnly: unreadFlag || unreadFlagFallback,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function getNotificationSummary(req, res, next) {
  try {
    const { limit } = req.query;
    const result = await listNotificationSummary({
      empid: req.user?.empid,
      companyId: req.user?.companyId,
      limit,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function readNotifications(req, res, next) {
  try {
    const { ids } = req.body || {};
    const result = await markNotificationsRead({
      empid: req.user?.empid,
      companyId: req.user?.companyId,
      notificationIds: Array.isArray(ids) ? ids : [],
    });
    res.json({ updated: result });
  } catch (err) {
    next(err);
  }
}
