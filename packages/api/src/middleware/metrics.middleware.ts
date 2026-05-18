import type { Request, Response, NextFunction } from "express";
import { httpRequestsTotal, httpRequestDurationSeconds } from "../metrics";

export function metricsMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (req.path.startsWith("/api/metrics")) {
    next();
    return;
  }

  const start = process.hrtime.bigint();

  res.on("finish", () => {
    const durationSeconds =
      Number(process.hrtime.bigint() - start) / 1_000_000_000;

    // req.route.path alone is just "/" (each router mounts at "/"), so we
    // stick baseUrl in front. Unmatched paths get one label so the
    // cardinality doesn't blow up on random 404s.
    const route = req.route
      ? req.baseUrl + (req.route.path === "/" ? "" : req.route.path)
      : "unmatched";

    const labels = {
      method: req.method,
      route,
      status: String(res.statusCode),
    };

    httpRequestsTotal.inc(labels);
    httpRequestDurationSeconds.observe(labels, durationSeconds);
  });

  next();
}
