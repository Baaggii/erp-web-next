# Secure Messaging SLO and Capacity Baseline

## Service level objectives (initial targets)

### API availability and latency
- **SLO-MSG-API-AVAIL**: `GET/POST /api/messaging` monthly availability ≥ **99.9%**.
- **SLO-MSG-API-LATENCY-P95**: p95 response time:
  - `GET /api/messaging` ≤ **600ms**
  - `POST /api/messaging` ≤ **400ms**
- **SLO-MSG-API-ERROR**: 5xx error rate ≤ **0.5%** per 10-minute window.

### Realtime delivery
- **SLO-MSG-RT-DELIVERY**: p95 server-to-client publish latency for `messages:new` ≤ **2s**.
- **SLO-MSG-RT-PRESENCE**: p95 presence update latency ≤ **5s**.

### Abuse/quality signals
- **SLO-MSG-SPAM-BLOCK**: 100% of requests above configured per-user limit are rejected with 429.
- **SLO-MSG-DUP-SUPPRESS**: Duplicate same-body sends in suppression window rejected at ≥99%.

## Capacity assumptions (baseline)
- Tenant distribution: 200 active companies.
- Peak concurrency: 1,500 connected sockets.
- Peak write rate: 50 msg/sec aggregate.
- Median message body size: 350 bytes; max body: 4,000 chars.

## Capacity controls and scaling notes
- Current bottlenecks:
  - In-memory maps for presence/rate limits are process-local.
  - Message listing is limited to 200 rows per request.
- Near-term scaling actions:
  1. Move anti-spam and presence to shared infra (Redis) for horizontal scale.
  2. Add read-path pagination with cursors to bound query and payload size.
  3. Add DB housekeeping/partition strategy for long-term message growth.

## Error budget policy
- Monthly error budget for 99.9% availability: ~43.8 minutes.
- If burn exceeds 50% mid-cycle:
  - Freeze non-critical feature changes in messaging.
  - Prioritize reliability fixes and incident postmortem actions.

## Monitoring/alert recommendations
- Metrics:
  - request rate, p50/p95 latency, 4xx/5xx rates for `/api/messaging`
  - socket connection count and event delivery latency
  - DB query latency for message list/insert paths
- Alerts:
  - p95 API latency > SLO for 15 minutes
  - 5xx rate > 1% for 5 minutes
  - socket disconnect spikes > 2x baseline
