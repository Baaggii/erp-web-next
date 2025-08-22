# Push-based Notifications

The application now uses [Socket.IO](https://socket.io/) to deliver request
notifications in real time.

## Server

The Express API attaches a Socket.IO server that authenticates each connection
using the same JWT cookie as the REST routes. Every socket joins a room keyed by
`empid` (e.g. `user:EMP001`). When a new pending request is created the API
emits a `newRequest` event to the relevant room so only the affected user
receives the update.

## Client

React hooks connect to the Socket.IO server on mount and listen for
`newRequest` events. Counts and badges update immediately when events arrive.
If the WebSocket connection cannot be established the hooks fall back to the
previous polling behaviour.

Set the WebSocket endpoint with the `VITE_SOCKET_URL` environment variable. If
undefined the client connects to the same origin as the page.
