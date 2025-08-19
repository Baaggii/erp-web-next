import * as jwtService from '../services/jwtService.js';
import { getCookieName } from '../utils/cookieNames.js';
import { logUserAction } from '../services/userActivityLog.js';

export function activityLogger(req, res, next) {
  if (!['POST', 'PUT', 'DELETE'].includes(req.method)) return next();

  let user = null;
  if (req.user) {
    user = req.user.empid || req.user.id;
  } else if (req.cookies?.[getCookieName()]) {
    try {
      const payload = jwtService.verify(req.cookies[getCookieName()]);
      user = payload.empid || payload.id;
    } catch {}
  }

  res.on('finish', async () => {
    if (!user) return;
    const actionMap = { POST: 'create', PUT: 'update', DELETE: 'delete' };
    const table = req.params?.table;
    const recordId = res.locals.insertId || req.params?.id || req.body?.id;
    if (!table || !recordId) return;
    try {
      await logUserAction({
        emp_id: user,
        table_name: table,
        record_id: recordId,
        action: actionMap[req.method],
        details: req.body || null,
      });
    } catch (err) {
      console.error('Failed to log user activity:', err);
    }
  });

  next();
}
