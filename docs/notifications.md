# Push-based Notifications

The application now uses [Socket.IO](https://socket.io/) to deliver request
notifications in real time.

## Server

The Express API attaches a Socket.IO server that authenticates each connection
using the same JWT cookie as the REST routes. Every socket joins a room keyed by
`empid` (e.g. `user:EMP001`). When a new pending request is created the API
emits a `newRequest` event to the relevant room so only the affected user
receives the update. When a request is accepted or declined the requester
receives a `requestResolved` event.

## Client

React hooks connect to the Socket.IO server on mount and listen for
`newRequest` and `requestResolved` events. Counts and badges update
immediately when events arrive.
If the WebSocket connection cannot be established the hooks fall back to polling
the API at the configured interval (`requestPollingIntervalSeconds`, default
30&nbsp;seconds).

Each user’s last-seen request counts are stored server-side in a
`request_seen_counts` table. When a requester logs out and back in, badges
only appear for requests accepted or declined since their most recent visit.
Clients flush their counts to the server via `POST /api/pending_request/seen`
before logging out.

Set the WebSocket endpoint with the `VITE_SOCKET_URL` environment variable. If
undefined the client connects to the same origin as the page.
