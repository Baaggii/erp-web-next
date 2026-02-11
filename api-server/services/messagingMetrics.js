const histogramBuckets = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10];

const messageCreateLatency = {
  type: 'histogram',
  help: 'Latency for successful messaging create operations in seconds',
  values: new Map(),
};

const rateLimitHits = {
  type: 'counter',
  help: 'Total number of messaging rate limit denials',
  values: new Map(),
};

const websocketConnections = {
  type: 'gauge',
  help: 'Current number of active websocket connections for messaging',
  values: new Map(),
};

function labelKey(labels = {}) {
  const pairs = Object.entries(labels)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => [String(key), String(value)]);
  pairs.sort((a, b) => a[0].localeCompare(b[0]));
  return JSON.stringify(pairs);
}

function labelsFromKey(key) {
  return Object.fromEntries(JSON.parse(key));
}

function formatLabels(labels) {
  const keys = Object.keys(labels || {});
  if (!keys.length) return '';
  return `{${keys.map((key) => `${key}="${String(labels[key]).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`).join(',')}}`;
}

function getOrInit(map, key, initFn) {
  if (!map.has(key)) map.set(key, initFn());
  return map.get(key);
}

export function observeMessageCreateLatency(seconds, labels = {}) {
  if (!Number.isFinite(seconds) || seconds < 0) return;
  const key = labelKey(labels);
  const current = getOrInit(messageCreateLatency.values, key, () => ({
    buckets: histogramBuckets.map(() => 0),
    sum: 0,
    count: 0,
  }));
  for (let i = 0; i < histogramBuckets.length; i += 1) {
    if (seconds <= histogramBuckets[i]) current.buckets[i] += 1;
  }
  current.sum += seconds;
  current.count += 1;
}

export function incRateLimitHits(labels = {}, amount = 1) {
  if (!Number.isFinite(amount) || amount <= 0) return;
  const key = labelKey(labels);
  const current = getOrInit(rateLimitHits.values, key, () => 0);
  rateLimitHits.values.set(key, current + amount);
}

export function setWebsocketConnections(value, labels = {}) {
  if (!Number.isFinite(value) || value < 0) return;
  websocketConnections.values.set(labelKey(labels), value);
}

export function incWebsocketConnections(labels = {}, amount = 1) {
  if (!Number.isFinite(amount)) return;
  const key = labelKey(labels);
  const current = getOrInit(websocketConnections.values, key, () => 0);
  websocketConnections.values.set(key, Math.max(0, current + amount));
}

function renderCounter(name, metric) {
  const lines = [`# HELP ${name} ${metric.help}`, `# TYPE ${name} counter`];
  for (const [key, value] of metric.values.entries()) {
    lines.push(`${name}${formatLabels(labelsFromKey(key))} ${value}`);
  }
  return lines;
}

function renderGauge(name, metric) {
  const lines = [`# HELP ${name} ${metric.help}`, `# TYPE ${name} gauge`];
  for (const [key, value] of metric.values.entries()) {
    lines.push(`${name}${formatLabels(labelsFromKey(key))} ${value}`);
  }
  return lines;
}

function renderHistogram(name, metric) {
  const lines = [`# HELP ${name} ${metric.help}`, `# TYPE ${name} histogram`];
  for (const [key, value] of metric.values.entries()) {
    const labels = labelsFromKey(key);
    for (let i = 0; i < histogramBuckets.length; i += 1) {
      lines.push(`${name}_bucket${formatLabels({ ...labels, le: histogramBuckets[i] })} ${value.buckets[i]}`);
    }
    lines.push(`${name}_bucket${formatLabels({ ...labels, le: '+Inf' })} ${value.count}`);
    lines.push(`${name}_sum${formatLabels(labels)} ${value.sum}`);
    lines.push(`${name}_count${formatLabels(labels)} ${value.count}`);
  }
  return lines;
}

export function renderPrometheusMetrics() {
  const lines = [
    ...renderHistogram('message_create_latency', messageCreateLatency),
    ...renderCounter('rate_limit_hits', rateLimitHits),
    ...renderGauge('websocket_connections', websocketConnections),
  ];
  return `${lines.join('\n')}\n`;
}

export function resetMessagingMetrics() {
  messageCreateLatency.values.clear();
  rateLimitHits.values.clear();
  websocketConnections.values.clear();
}
