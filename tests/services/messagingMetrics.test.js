import test from 'node:test';
import assert from 'node:assert/strict';
import {
  incRateLimitHits,
  incWebsocketConnections,
  observeMessageCreateLatency,
  renderPrometheusMetrics,
  resetMessagingMetrics,
} from '../../api-server/services/messagingMetrics.js';

test('renders prometheus metrics for messaging counters and gauge', () => {
  resetMessagingMetrics();
  observeMessageCreateLatency(0.12, { company_id: '1', status: 'success' });
  incRateLimitHits({ reason: 'rate_limit' });
  incWebsocketConnections({ company_id: '1' }, 2);

  const output = renderPrometheusMetrics();
  assert.match(output, /message_create_latency_count\{company_id="1",status="success"\} 1/);
  assert.match(output, /rate_limit_hits\{reason="rate_limit"\} 1/);
  assert.match(output, /websocket_connections\{company_id="1"\} 2/);
});
