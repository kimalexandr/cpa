import client from 'prom-client';

client.collectDefaultMetrics({ prefix: 'realcpa_' });

export const httpRequestDuration = new client.Histogram({
  name: 'realcpa_http_request_duration_ms',
  help: 'HTTP request duration in ms',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [50, 100, 300, 500, 1000, 3000, 5000],
});

export const queueLagGauge = new client.Gauge({
  name: 'realcpa_queue_retry_pending',
  help: 'Pending webhook retry jobs',
});

export async function metricsText(): Promise<string> {
  return client.register.metrics();
}

