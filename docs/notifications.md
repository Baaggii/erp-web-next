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
arrive.
If the WebSocket connection cannot be established the hooks fall back to polling
the API at the configured interval (`requestPollingIntervalSeconds`, default
30&nbsp;seconds).

Set the WebSocket endpoint with the `VITE_SOCKET_URL` environment variable. If
undefined the client connects to the same host as the REST API (`VITE_API_BASE`,
with the `/api` suffix removed). Socket handshakes are served from
`/api/socket.io` by default; override this path with `VITE_SOCKET_PATH` on the
client and `SOCKET_IO_PATH` on the server when your reverse proxy expects a
different prefix.

## Local storage keys

Hooks that track notification counts store "seen" markers in `localStorage`
using a key that includes the employee ID and ends with `-seen`, for example
`${empid}-incoming-pending-seen`. These markers persist across logouts so that
counts are retained between sessions. New hooks should follow the same naming
pattern to maintain per-user tracking.
