import type { NextFunction, Request, Response } from 'express';
import client from 'prom-client';

export const registry = new client.Registry();
client.collectDefaultMetrics({ register: registry, prefix: 'seatsurge_checkout_' });

const SERVICE = 'checkout';

export const httpRequests = new client.Counter({
  name: 'seatsurge_http_requests_total',
  help: 'HTTP requests handled',
  labelNames: ['service', 'method', 'route', 'status'],
  registers: [registry],
});

export const httpLatency = new client.Histogram({
  name: 'seatsurge_http_request_duration_seconds',
  help: 'HTTP request latency',
  labelNames: ['service', 'method', 'route'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [registry],
});

export const ordersTotal = new client.Counter({
  name: 'seatsurge_orders_total',
  help: 'Checkout attempts by outcome',
  labelNames: ['result'],
  registers: [registry],
});

export const revenueTotal = new client.Counter({
  name: 'seatsurge_revenue_inr_total',
  help: 'Confirmed revenue in INR',
  registers: [registry],
});

const SKIP = new Set(['/metrics', '/healthz', '/readyz']);

export function metricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const end = process.hrtime.bigint();
  res.on('finish', () => {
    const route = req.route?.path ? `${req.baseUrl}${req.route.path}` : 'unmatched';
    if (SKIP.has(route)) return;
    const seconds = Number(process.hrtime.bigint() - end) / 1e9;
    httpRequests.inc({ service: SERVICE, method: req.method, route, status: String(res.statusCode) });
    httpLatency.observe({ service: SERVICE, method: req.method, route }, seconds);
  });
  next();
}
