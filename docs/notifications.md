# Push-based Notifications

The application now uses [Socket.IO](https://socket.io/) to deliver request
notifications in real time.

## Server

The Express API attaches a Socket.IO server that authenticates each connection
using the same JWT cookie as the REST routes. Every socket joins a room keyed by
`empid` (e.g. `user:EMP001`). When a notification is created through
`notifyUser`, the API emits a `notification:new` event to the relevant room so
only the affected user receives the update. The payload includes a `kind`
attribute (for example, `request`, `temporary`, or `transaction`) so clients can
react without inspecting message strings.

## Client

React hooks connect to the Socket.IO server on mount and listen for
`notification:new` events. Counts and badges update immediately when events
arrive. The Socket.IO client attempts to reconnect automatically when the
connection drops, and socket connection errors are logged to the console by
default to make failures visible during development and debugging.
If the WebSocket connection cannot be established for an extended period, the
hooks fall back to polling the API at the configured interval
(`requestPollingIntervalSeconds`, default 30&nbsp;seconds).

Set the WebSocket endpoint with the `VITE_SOCKET_URL` environment variable. If
undefined the client connects to the same host as the REST API (`VITE_API_BASE`,
with the `/api` suffix removed) or the current browser origin. Socket handshakes
are served from `/api/socket.io` by default; override this path with
`VITE_SOCKET_PATH` on the client and `SOCKET_IO_PATH` on the server when your
reverse proxy expects a different prefix.

## Local storage keys

Hooks that track notification counts store "seen" markers in `localStorage`
using a key that includes the employee ID and ends with `-seen`, for example
`${empid}-incoming-pending-seen`. These markers persist across logouts so that
counts are retained between sessions. New hooks should follow the same naming
pattern to maintain per-user tracking.

## Web Push notifications

The system supports browser-level web push notifications (service worker + Push API)
when both toggles are enabled:

1. General Configuration → Notifications → `webPushEnabled`
2. Employee Configuration → General → `webPushEnabled`

When both are true, the frontend registers `sw-webpush.js`, requests browser
notification permission, creates a push subscription, and sends it to
`POST /api/web_push/subscribe`. The backend stores subscriptions in
`web_push_subscriptions`, sends encrypted push payloads with VAPID, retries
transient failures, deduplicates bursts, rate-limits rapid sends per user, and
marks subscriptions inactive on HTTP 404/410 responses.

Payloads include `title`, `body`, `icon`, `badge`, and `data.url`. On click, the
service worker focuses an existing app tab or opens a new one at the provided
URL.

## Verifying web push end-to-end

Use this checklist to confirm whether **notifications** and **messaging** both trigger browser push:

1. **Enable required toggles**
   - Global: General Configuration → Notifications → `webPushEnabled`
   - User: User Settings → General → `webPushEnabled`
   - Grant browser permission (`Notification.permission === "granted"`).

2. **Confirm subscription is created**
   - In DevTools Network, verify:
     - `GET /api/web_push/status` returns `vapidConfigured: true` and a non-empty `publicKey`.
     - `POST /api/web_push/subscribe` returns success.
   - In DB, verify an active row exists in `web_push_subscriptions` for your user (`is_active = 1`).

3. **Confirm backend enqueue path**
   - Standard notification path: `notifyUser` emits socket `notification:new` and enqueues web push.
   - Messaging path: creating/sending conversation messages enqueues web push for all active participants except sender.

4. **Confirm push send outcome in server logs**
   - Successful sends log: `web-push:sent` (contains companyId/empid/kind/relatedId).
   - Failures log: `web-push:send-failed` (includes `statusCode`).
   - `404/410` means stale endpoint and subscription is marked inactive.

5. **Confirm service worker display path in browser**
   - Ensure `/sw-webpush.js` is reachable with JavaScript content-type.
   - The worker always calls `showNotification(...)` on push and opens/focuses app on click.

### Quick troubleshooting

- If permission is granted but no push appears:
  - Check VAPID env vars (`WEB_PUSH_VAPID_PUBLIC_KEY`, `WEB_PUSH_VAPID_PRIVATE_KEY`).
  - Check muted settings: `webPushMutedKinds`, `webPushMuteStartHour`, `webPushMuteEndHour`.
  - Re-subscribe by toggling web push off/on and clicking **Allow browser notifications**.
- If logs show `send-failed` with `404/410`, the device/browser subscription is invalid; user must re-subscribe.

### Platform limitations (especially iOS/iPadOS)

- Web push requires a secure context (`https://` or localhost).
- On iOS/iPadOS, Safari only exposes web push to Home Screen apps (PWA) on iOS/iPadOS 16.4+.
- If users can enable web push on desktop but not mobile Safari, instruct them to:
  1. Update iOS/iPadOS to 16.4 or newer.
  2. Open the app in Safari and use **Share → Add to Home Screen**.
  3. Launch the installed Home Screen app and re-run **Allow browser notifications** in User Settings.
- Outside an installed iOS/iPadOS PWA, notification APIs may appear unavailable even though the device/browser can support push once installed.
