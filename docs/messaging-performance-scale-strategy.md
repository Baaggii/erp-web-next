# Messaging Performance and Scale Strategy (10k Concurrent Users)

## 1) Capacity assumptions and workload model

- **Concurrency target:** 10,000 simultaneous connected websocket clients across tenants.
- **Traffic pattern:** bursty fanout periods (status changes, incident channels, company-wide announcements) with short spikes 5–10x baseline event rate.
- **Baseline event mix:**
  - Presence heartbeats/state transitions: high-frequency, low-payload.
  - Message create/read events: medium-frequency, write-heavy.
  - Notification and attachment events: lower-frequency, background-heavy.
- **Multi-tenant isolation rule:** all caches, channels, and queue keys must be tenant-scoped to prevent noisy-neighbor amplification.

## 2) Presence fanout strategy

### 2.1 Channel topology (Redis pub/sub + sharding)

Use a two-level channel structure to reduce unnecessary fanout:

1. **Tenant shard channel** for routing: `presence:{tenantId}:{shardId}`.
2. **Thread/team channel** for localized delivery: `presence:{tenantId}:thread:{threadId}`.

Sharding approach:

- Compute `shardId = hash(userId) % N` where `N` is adjustable (start at 64 shards/tenant for large tenants).
- Socket nodes subscribe only to shards they currently host users for.
- Keep shard sizes balanced with periodic rebalance if p95 shard load >2x p50.

### 2.2 Throttled + coalesced presence updates

Presence does not need per-event immediacy for every heartbeat.

- Client heartbeat every 20–30s; server-side state TTL 75s.
- Publish transitions immediately for `offline -> online` and `online -> offline`.
- For `online` refreshes, coalesce per user and emit at most once per 5s window.
- Aggregate updates into batches (`max 100 users` or `200ms`, whichever first) before websocket fanout.
- Suppress duplicate state payloads (same status/version) with idempotency key `tenant:user:version`.

### 2.3 Backstop for burst conditions

- If queue depth for presence batches exceeds threshold, degrade to summary mode:
  - send `presence.summary` (counts by state) every 1s,
  - defer per-user deltas until queue drains below recovery watermark.
- Expose feature flag to temporarily disable typing indicators if event budget is exceeded.

## 3) Message query optimization

### 3.1 Core indexing strategy

Recommended indexes (PostgreSQL examples):

- `messages(tenant_id, thread_id, created_at DESC, id DESC)` for timeline reads.
- `messages(tenant_id, sender_id, created_at DESC)` for sender drilldown/audit.
- Partial index for active rows: `WHERE deleted_at IS NULL`.
- `read_receipts(tenant_id, user_id, thread_id, last_read_message_id)` unique composite.
- `thread_participants(tenant_id, user_id, thread_id)` for inbox listing + permission checks.

### 3.2 Materialized unread counters

Avoid computing unread counts via full scans on every inbox load.

- Maintain `thread_user_counters` table:
  - `(tenant_id, thread_id, user_id, unread_count, last_read_message_id, updated_at)`.
- Update asynchronously via event stream on message insert/read receipt write.
- Reconcile with periodic correction job (e.g., every 15 min) for drift detection.
- On mismatch > small threshold, self-heal row and emit metric `counter_reconcile_total`.

### 3.3 Denormalized conversation preview rows

Create `thread_inbox_projection` for fast list rendering:

- `last_message_id`, `last_message_at`, `last_sender_id`, `last_preview_text`, `attachment_flag`.
- Update in write path using transactional outbox event to projection worker.
- Keep payload capped (e.g., 160–240 chars preview) to improve cache density.

### 3.4 Read path safeguards

- Cursor-based pagination (`created_at,id`) instead of offset.
- Per-request bound on page size (e.g., max 50).
- Use prepared statements and avoid ad-hoc dynamic SQL in hot paths.
- Add query budget alarms when p95 query time > target for 5 min.

## 4) Backpressure handling and retry policies

### 4.1 Ingress/backpressure controls

- Token bucket rate limit at user + tenant level for message sends and websocket emits.
- Bounded in-memory websocket send queues per connection (drop oldest non-critical event first).
- Priority classes:
  1. Critical: message.created, permission revocation, disconnect.
  2. Important: read receipts.
  3. Best-effort: typing, high-frequency presence refreshes.

### 4.2 Retry model

- Retries for durable async work only (not direct websocket emits).
- Exponential backoff with jitter (e.g., base 250ms, factor 2, cap 30s, max 8 attempts).
- Dead-letter queue (DLQ) for terminal failures with structured failure reason.
- Idempotency keys on consumers to prevent duplicate notification/attachment processing.

### 4.3 Client recovery

- Sequence IDs on websocket events per tenant stream.
- On reconnect, client sends last seen sequence; server replays gap from short-lived event log (e.g., Redis Stream/Kafka topic retention window).
- If gap window exceeded, trigger efficient snapshot sync endpoint.

## 5) Async jobs for notifications and attachment processing

### 5.1 Notification pipeline

Stages:

1. `message.created` -> enqueue notification intent.
2. Preference + permission filter (mute windows, role scope, channel opt-ins).
3. Fanout by channel (in-app, email, push).
4. Provider delivery + status callback update.

Design notes:

- Separate queue per channel to prevent slow email provider from blocking in-app notification SLA.
- Batch low-priority digests; keep mention/urgent notifications near-real-time.
- Cap retries per provider and escalate to DLQ + operator alert if sustained failure.

### 5.2 Attachment pipeline

Stages:

1. Upload to object storage (pre-signed URL).
2. Antivirus and content-type validation job.
3. Thumbnail/transcode extraction job.
4. Metadata persist + `attachment.ready` event.

Design notes:

- Quarantine unscanned files; never expose direct download until scan passes.
- Use bounded worker pools with CPU/memory quotas for media transforms.
- Store checksum to deduplicate repeated uploads and reduce storage churn.

## 6) Load test plan (benchmarking strategy)

### 6.1 Test scenarios

1. **Steady-state 10k connections:** 2k messages/min, standard presence heartbeat.
2. **Burst fanout:** 10x presence transitions for 60s + 5k message notifications in 30s.
3. **Hot-tenant skew:** single tenant receives 35–40% of global traffic.
4. **Reconnect storm:** 30% clients reconnect within 2 minutes (simulate node recycle/network flap).
5. **Dependency impairment:** Redis latency injection + notification provider slowdown.

### 6.2 Success thresholds

- Websocket connect success >= 99.9% during ramp.
- `message.created` end-to-end (API accept -> client receive) p95 <= 1.5s, p99 <= 3.0s.
- Presence transition fanout p95 <= 2.0s under burst mode.
- Dropped best-effort websocket events <= 0.5% over 15-min window; dropped critical events = 0.
- API error rate (5xx) < 0.5%; sustained queue lag < 60s for critical queues.

### 6.3 Execution cadence

- Run quick smoke benchmark on each major release candidate.
- Run full-scale benchmark weekly and before infra topology changes.
- Keep workload profiles versioned in repo and compare trend deltas release-over-release.

## 7) Observability strategy

### 7.1 Metrics

Collect and tag by `tenant`, `node`, `event_type`, `priority`, `queue`:

- Websocket: active connections, connect/disconnect rate, auth failures.
- Event flow: publish rate, fanout latency histograms, dropped events by priority.
- API: request rate, p50/p95/p99 latency, 4xx/5xx rates.
- Storage: DB query latency by statement fingerprint, lock wait time, cache hit ratio.
- Queue: depth, enqueue/dequeue rate, consumer lag, retry count, DLQ count.
- Attachments: scan duration, transform duration, failure ratio.

### 7.2 Logs

- Structured JSON logs with correlation IDs (`trace_id`, `tenant_id`, `user_id`, `message_id`).
- Log sampling for noisy success paths; full retention for failures and security events.
- Explicit event-drop logs with reason code (`queue_overflow`, `stale_connection`, `rate_limited`).

### 7.3 Traces

Trace critical path spans:

`HTTP message POST -> DB write -> outbox publish -> websocket fanout -> client ack`

and async chains:

`message.created -> notification job -> provider API -> delivery callback`.

### 7.4 Dashboards

Minimum dashboard sets:

1. **Realtime health:** websocket connections, fanout latency, dropped events.
2. **Messaging API:** throughput, latency percentiles, errors, top slow endpoints.
3. **Data plane:** DB hotspots, cache efficiency, slow query leaderboard.
4. **Queue/worker health:** lag, retries, DLQ, worker saturation.
5. **Tenant outliers:** top tenants by traffic/error/latency.

### 7.5 Alerts

Alert examples (multi-window, burn-rate preferred):

- Latency SLO burn > budget (p95 message E2E).
- Error-rate spike (API 5xx or websocket auth failures).
- Dropped critical websocket events > 0 in 5 minutes.
- Queue lag > 60s for critical notifications for 10 minutes.
- DB p95 query latency above threshold + lock waits elevated.

## 8) Benchmark script outline

Below is a k6-style outline that can be adapted to your CI performance stage.

```javascript
import ws from 'k6/ws';
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  scenarios: {
    websocket_users: {
      executor: 'ramping-vus',
      startVUs: 100,
      stages: [
        { duration: '10m', target: 10000 },
        { duration: '20m', target: 10000 },
        { duration: '5m', target: 2000 },
      ],
    },
    message_writers: {
      executor: 'constant-arrival-rate',
      rate: 35, // requests/sec (~2100/min)
      timeUnit: '1s',
      duration: '35m',
      preAllocatedVUs: 200,
      maxVUs: 1000,
    },
    burst_presence: {
      executor: 'constant-arrival-rate',
      startTime: '15m',
      rate: 1000, // transition events/sec for burst window
      timeUnit: '1s',
      duration: '60s',
      preAllocatedVUs: 300,
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.005'],
    http_req_duration: ['p(95)<400'],
    'ws_connecting': ['p(95)<1000'],
    'custom_e2e_message_latency': ['p(95)<1500', 'p(99)<3000'],
    'custom_presence_fanout_latency': ['p(95)<2000'],
  },
};

export default function () {
  // 1) Authenticate and connect websocket.
  // 2) Subscribe to tenant/thread channels.
  // 3) Periodically heartbeat presence.
  // 4) Send message for a subset of VUs.
  // 5) Record timestamps for end-to-end latency.
  // 6) Validate delivery ordering and detect dropped sequence IDs.

  const token = '...';
  const url = `wss://example/ws?token=${token}`;

  ws.connect(url, {}, (socket) => {
    socket.on('open', () => {
      socket.send(JSON.stringify({ type: 'subscribe', tenantId: 't1' }));
    });

    socket.on('message', (data) => {
      // Parse events, track seq gaps, and emit custom metrics.
    });

    socket.setInterval(() => {
      socket.send(JSON.stringify({ type: 'presence.heartbeat', status: 'online' }));
    }, 25000);

    sleep(5);
  });

  const res = http.post('https://example/api/messages', JSON.stringify({
    tenantId: 't1',
    threadId: 'th1',
    body: 'load-test payload',
  }), {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });

  check(res, { 'message accepted': (r) => r.status === 201 || r.status === 202 });
}
```

## 9) Target SLO/SLA table

| Area | SLI | Target SLO | External SLA (suggested) |
|---|---|---:|---:|
| Messaging API availability | Successful non-4xx responses | 99.95% monthly | 99.9% monthly |
| Message E2E latency | API accept -> recipient websocket receive p95 | <= 1.5s | <= 2.5s |
| Message E2E latency (tail) | API accept -> recipient websocket receive p99 | <= 3.0s | <= 5.0s |
| Presence fanout latency | state transition -> subscriber receive p95 | <= 2.0s | <= 3.0s |
| Websocket session success | Successful authenticated connects | >= 99.9% | >= 99.5% |
| Critical event delivery | `message.created`/permission events delivered | 99.99% | 99.9% |
| Dropped websocket events | Best-effort events dropped per 15-min window | <= 0.5% | <= 1.0% |
| Notification dispatch lag | enqueue -> provider handoff p95 | <= 30s | <= 60s |
| Attachment readiness | upload complete -> safe downloadable p95 | <= 45s | <= 90s |

## 10) Rollout checklist

- Run benchmark baseline and record golden metrics before optimization rollout.
- Roll out sharded presence + projections behind feature flags per tenant cohort.
- Monitor burn-rate alerts and rollback if critical event drop detected.
- Re-baseline thresholds after each material architecture change.
