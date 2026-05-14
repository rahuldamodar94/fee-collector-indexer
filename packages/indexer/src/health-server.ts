import http from "http";
import mongoose from "mongoose";
import { register, collectDefaultMetrics } from "prom-client";

collectDefaultMetrics();

export function startHealthServer(port: number): http.Server {
  const server = http.createServer(async (req, res) => {
    if (req.url === "/health") {
      const ok = mongoose.connection.readyState === 1;
      res.statusCode = ok ? 200 : 503;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ status: ok ? "ok" : "unhealthy" }));
      return;
    }

    if (req.url === "/metrics") {
      res.statusCode = 200;
      res.setHeader("Content-Type", register.contentType);
      res.end(await register.metrics());
      return;
    }

    res.statusCode = 404;
    res.end("not found");
  });

  server.listen(port, () => {
    console.log(`health server listening on :${port}`);
  });

  return server;
}
