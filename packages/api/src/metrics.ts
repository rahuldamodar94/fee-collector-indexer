import { Counter, Histogram, collectDefaultMetrics } from "prom-client";

collectDefaultMetrics();

export const httpRequestsTotal = new Counter({
  name: "fee_collector_http_requests_total",
  help: "Total HTTP requests handled",
  labelNames: ["method", "route", "status"] as const,
});

export const httpRequestDurationSeconds = new Histogram({
  name: "fee_collector_http_request_duration_seconds",
  help: "HTTP request duration in seconds",
  labelNames: ["method", "route", "status"] as const,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
});
