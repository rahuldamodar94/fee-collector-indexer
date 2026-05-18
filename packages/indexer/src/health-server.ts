import http from "http";
import mongoose from "mongoose";
import { register } from "prom-client";
import { getLogger } from "@fee-collector/shared";
// Side-effect import — registers metrics before /indexer/metrics gets hit.
import "./metrics";

export function startHealthServer(port: number): http.Server {
  const server = http.createServer(async (req, res) => {
    if (req.url === "/indexer/health") {
      const ok = mongoose.connection.readyState === 1;
      res.statusCode = ok ? 200 : 503;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ status: ok ? "ok" : "unhealthy" }));
      return;
    }

    if (req.url === "/indexer/metrics") {
      res.statusCode = 200;
      res.setHeader("Content-Type", register.contentType);
      res.end(await register.metrics());
      return;
    }

    res.statusCode = 404;
    res.end("not found");
  });

  server.on("error", (err) => {
    getLogger().error("health server failed to bind", { err, port });
    process.exit(1);
  });

  server.listen(port, () => {
    getLogger().info("health server listening", { port });
  });

  return server;
}
