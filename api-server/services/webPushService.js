import crypto from 'crypto';
import { getGeneralConfig } from './generalConfig.js';
import { getUserSettings } from './userSettings.js';

let dbPool = null;
let ioEmitter = null;
let tableReadyPromise = null;
let webPushClientPromise = null;

const queue = [];
let queueRunning = false;
const dedupeCache = new Map();
const lastSentAt = new Map();
const DEDUPE_WINDOW_MS = 30 * 1000;
const MIN_SEND_INTERVAL_MS = 1000;
const MAX_RETRIES = 3;


async function getWebPushClient() {
  if (!webPushClientPromise) {
    webPushClientPromise = import('web-push')
      .then((mod) => mod.default || mod)
      .catch(() => null);
  }
  return webPushClientPromise;
}

function getVapidConfig() {
  const subject = process.env.WEB_PUSH_VAPID_SUBJECT || 'mailto:admin@example.com';
  const publicKey = process.env.WEB_PUSH_VAPID_PUBLIC_KEY || '';
  const privateKey = process.env.WEB_PUSH_VAPID_PRIVATE_KEY || '';
  return { subject, publicKey, privateKey };
}

async function ensureVapidConfigured() {
  const client = await getWebPushClient();
  if (!client) return false;
  const { subject, publicKey, privateKey } = getVapidConfig();
  if (!publicKey || !privateKey) return false;
  client.setVapidDetails(subject, publicKey, privateKey);
  return true;
}

export function setWebPushStore(store) {
  dbPool = store || null;
}

export function setWebPushEmitter(io) {
  ioEmitter = io || null;
}

async function ensureSubscriptionTable() {
  if (!dbPool) {
    throw new Error('Web push store not configured');
  }
  if (!tableReadyPromise) {
    tableReadyPromise = dbPool.query(`
      CREATE TABLE IF NOT EXISTS web_push_subscriptions (
        id BIGINT NOT NULL AUTO_INCREMENT,
        company_id INT NOT NULL,
        empid VARCHAR(10) NOT NULL,
        endpoint TEXT NOT NULL,
        p256dh VARCHAR(255) NOT NULL,
        auth VARCHAR(255) NOT NULL,
        user_agent VARCHAR(255) DEFAULT NULL,
        subscription_hash CHAR(64) NOT NULL,
        notification_types JSON DEFAULT NULL,
        mute_start_hour TINYINT UNSIGNED DEFAULT NULL,
        mute_end_hour TINYINT UNSIGNED DEFAULT NULL,
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        last_seen TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uniq_subscription_hash (subscription_hash),
        KEY idx_company_empid_active (company_id, empid, is_active)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    `);
  }
  await tableReadyPromise;
}

function normalizeEmpid(empid) {
  return String(empid || '').trim().toUpperCase();
}

function hashSubscription(endpoint, p256dh, auth) {
  return crypto.createHash('sha256').update(`${endpoint}|${p256dh}|${auth}`).digest('hex');
}

function normalizeNotificationTypes(raw) {
  if (Array.isArray(raw)) {
    return raw.map((item) => String(item || '').trim().toLowerCase()).filter(Boolean);
  }
  if (typeof raw === 'string') {
    return raw
      .split(',')
      .map((part) => part.trim().toLowerCase())
      .filter(Boolean);
  }
  return [];
}

function parseHourValue(value) {
  if (value === undefined || value === null || value === '') return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  const rounded = Math.floor(numeric);
  if (rounded < 0 || rounded > 23) return null;
  return rounded;
}

function isMutedByHour(settings, now = new Date()) {
  const start = parseHourValue(settings?.webPushMuteStartHour);
  const end = parseHourValue(settings?.webPushMuteEndHour);
  if (start === null || end === null || start === end) return false;
  const hour = now.getHours();
  if (start < end) {
    return hour >= start && hour < end;
  }
  return hour >= start || hour < end;
}

function isKindMuted(settings, kind) {
  const mutedKinds = normalizeNotificationTypes(settings?.webPushMutedKinds);
  const normalizedKind = String(kind || '').trim().toLowerCase();
  return Boolean(normalizedKind && mutedKinds.includes(normalizedKind));
}

async function isWebPushEnabled({ companyId, empid, kind }) {
  const { config } = await getGeneralConfig(companyId);
  if (!config?.notifications?.webPushEnabled) return false;

  const settings = await getUserSettings(empid, companyId);
  if (settings?.webPushEnabled !== true) return false;
  if (isMutedByHour(settings)) return false;
  if (isKindMuted(settings, kind)) return false;
  return true;
}

export async function upsertWebPushSubscription({
  companyId,
  empid,
  subscription,
  userAgent,
  notificationTypes,
  muteStartHour,
  muteEndHour,
}) {
  if (!dbPool) throw new Error('Web push store not configured');
  await ensureSubscriptionTable();

  const endpoint = String(subscription?.endpoint || '').trim();
  const p256dh = String(subscription?.keys?.p256dh || '').trim();
  const auth = String(subscription?.keys?.auth || '').trim();
  const normalizedEmpid = normalizeEmpid(empid);

  if (!companyId || !normalizedEmpid || !endpoint || !p256dh || !auth) {
    throw new Error('Invalid push subscription payload');
  }

  const subHash = hashSubscription(endpoint, p256dh, auth);
  const typesJson = JSON.stringify(normalizeNotificationTypes(notificationTypes));
  const normalizedMuteStart = parseHourValue(muteStartHour);
  const normalizedMuteEnd = parseHourValue(muteEndHour);

  await dbPool.query(
    `INSERT INTO web_push_subscriptions
      (company_id, empid, endpoint, p256dh, auth, user_agent, subscription_hash, notification_types,
       mute_start_hour, mute_end_hour, is_active, last_seen)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NOW())
     ON DUPLICATE KEY UPDATE
       company_id = VALUES(company_id),
       empid = VALUES(empid),
       endpoint = VALUES(endpoint),
       p256dh = VALUES(p256dh),
       auth = VALUES(auth),
       user_agent = VALUES(user_agent),
       notification_types = VALUES(notification_types),
       mute_start_hour = VALUES(mute_start_hour),
       mute_end_hour = VALUES(mute_end_hour),
       is_active = 1,
       last_seen = NOW()`,
    [
      companyId,
      normalizedEmpid,
      endpoint,
      p256dh,
      auth,
      userAgent || null,
      subHash,
      typesJson,
      normalizedMuteStart,
      normalizedMuteEnd,
    ],
  );

  // Keep only one active record per endpoint for a user. Browsers may rotate
  // subscription keys while retaining the same endpoint, which can otherwise
  // leave duplicate active rows and cause repeated deliveries.
  await dbPool.query(
    `UPDATE web_push_subscriptions
       SET is_active = 0,
           updated_at = CURRENT_TIMESTAMP
     WHERE company_id = ?
       AND empid = ?
       AND endpoint = ?
       AND subscription_hash <> ?
       AND is_active = 1`,
    [companyId, normalizedEmpid, endpoint, subHash],
  );

  return { ok: true, hash: subHash };
}

export async function removeWebPushSubscription({ companyId, empid, endpoint }) {
  if (!dbPool) throw new Error('Web push store not configured');
  await ensureSubscriptionTable();
  const normalizedEmpid = normalizeEmpid(empid);
  await dbPool.query(
    `UPDATE web_push_subscriptions
       SET is_active = 0, updated_at = CURRENT_TIMESTAMP
     WHERE company_id = ? AND empid = ? AND endpoint = ?`,
    [companyId, normalizedEmpid, String(endpoint || '').trim()],
  );
  return { ok: true };
}

async function listSubscriptions({ companyId, empid }) {
  await ensureSubscriptionTable();
  const [rows] = await dbPool.query(
    `SELECT id, endpoint, p256dh, auth
       FROM web_push_subscriptions
      WHERE company_id = ?
        AND empid = ?
        AND is_active = 1
      ORDER BY last_seen DESC, id DESC`,
    [companyId, normalizeEmpid(empid)],
  );
  if (!rows?.length) return [];

  // Extra runtime safety against any historical duplicates.
  const seenEndpoints = new Set();
  return rows.filter((row) => {
    const endpoint = String(row?.endpoint || '').trim();
    if (!endpoint || seenEndpoints.has(endpoint)) return false;
    seenEndpoints.add(endpoint);
    return true;
  });
}

function buildDedupeKey(job) {
  return `${job.companyId}|${job.empid}|${job.kind}|${job.relatedId}|${job.message}`;
}

function shouldRateLimit(job) {
  const key = `${job.companyId}|${job.empid}`;
  const prev = lastSentAt.get(key) || 0;
  const now = Date.now();
  if (now - prev < MIN_SEND_INTERVAL_MS) return true;
  lastSentAt.set(key, now);
  return false;
}

async function markSubscriptionInactive(subscriptionId) {
  await dbPool.query(
    `UPDATE web_push_subscriptions
       SET is_active = 0, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [subscriptionId],
  );
}

async function processJob(job) {
  const vapidReady = await ensureVapidConfigured();
  if (!vapidReady) return;
  const webpush = await getWebPushClient();
  if (!webpush) return;
  const enabled = await isWebPushEnabled({
    companyId: job.companyId,
    empid: job.empid,
    kind: job.kind,
  });
  if (!enabled) return;

  const subscriptions = await listSubscriptions({ companyId: job.companyId, empid: job.empid });
  if (!subscriptions.length) return;

  const payload = JSON.stringify({
    title: job.title || 'ERP notification',
    body: job.message || 'You have a new notification',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: {
      url: job.url || '/#/notifications',
      notificationId: job.notificationId || null,
      relatedId: job.relatedId || null,
      kind: job.kind || 'notification',
    },
    tag: `erp-${job.kind || 'notification'}-${job.relatedId || 'general'}`,
  });

  for (const subscription of subscriptions) {
    try {
      await webpush.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: {
            p256dh: subscription.p256dh,
            auth: subscription.auth,
          },
        },
        payload,
      );
      console.info('web-push:sent', {
        companyId: job.companyId,
        empid: job.empid,
        kind: job.kind || null,
        relatedId: job.relatedId || null,
      });
      if (ioEmitter) {
        ioEmitter.to(`user:${job.empid}`).emit('notification:webpush-sent', {
          kind: job.kind,
          relatedId: job.relatedId || null,
        });
      }
    } catch (err) {
      const statusCode = Number(err?.statusCode || err?.status || 0);
      if (statusCode === 404 || statusCode === 410) {
        await markSubscriptionInactive(subscription.id);
      }
      console.warn('web-push:send-failed', {
        companyId: job.companyId,
        empid: job.empid,
        statusCode: statusCode || null,
        message: err?.message || 'send failed',
      });
      if ((statusCode >= 500 || !statusCode) && (job.retryCount || 0) < MAX_RETRIES) {
        queue.push({ ...job, retryCount: (job.retryCount || 0) + 1 });
      }
    }
  }
}

async function runQueue() {
  if (queueRunning) return;
  queueRunning = true;
  try {
    while (queue.length > 0) {
      const job = queue.shift();
      if (!job) continue;
      if (shouldRateLimit(job)) {
        queue.push(job);
        await new Promise((resolve) => setTimeout(resolve, 300));
        continue;
      }
      await processJob(job);
    }
  } finally {
    queueRunning = false;
  }
}

export function enqueueWebPushNotification(job = {}) {
  const dedupeKey = buildDedupeKey(job);
  const now = Date.now();
  const previous = dedupeCache.get(dedupeKey) || 0;
  if (now - previous <= DEDUPE_WINDOW_MS) return;
  dedupeCache.set(dedupeKey, now);

  queue.push({ ...job, retryCount: 0 });
  if (dedupeCache.size > 5000) {
    for (const [key, createdAt] of dedupeCache.entries()) {
      if (now - createdAt > DEDUPE_WINDOW_MS) dedupeCache.delete(key);
    }
  }
  setImmediate(() => {
    runQueue().catch((err) => {
      console.error('Web push queue failed', err);
    });
  });
}


export async function enqueueTestWebPush({ companyId, empid, title, body, url } = {}) {
  const normalizedEmpid = normalizeEmpid(empid);
  const normalizedCompanyId = Number(companyId);
  if (!normalizedCompanyId || !normalizedEmpid) {
    throw new Error('companyId and empid are required');
  }

  await ensureSubscriptionTable();
  const [rows] = await dbPool.query(
    `SELECT COUNT(*) AS total
       FROM web_push_subscriptions
      WHERE company_id = ?
        AND empid = ?
        AND is_active = 1`,
    [normalizedCompanyId, normalizedEmpid],
  );
  const activeSubscriptions = Number(rows?.[0]?.total || 0);

  enqueueWebPushNotification({
    companyId: normalizedCompanyId,
    empid: normalizedEmpid,
    kind: 'test',
    relatedId: null,
    message: String(body || '').trim() || 'This is a test web push notification.',
    title: String(title || '').trim() || 'ERP test notification',
    url: String(url || '').trim() || '/#/',
  });

  return { ok: true, queued: true, activeSubscriptions };
}

export function getWebPushPublicKey() {
  const { publicKey } = getVapidConfig();
  return publicKey || '';
}

export async function getWebPushStatus({ companyId, empid }) {
  const { config } = await getGeneralConfig(companyId);
  const settings = await getUserSettings(empid, companyId);
  return {
    enabledGlobal: Boolean(config?.notifications?.webPushEnabled),
    enabledUser: settings?.webPushEnabled === true,
    vapidConfigured: await ensureVapidConfigured(),
    publicKey: getWebPushPublicKey(),
  };
}
