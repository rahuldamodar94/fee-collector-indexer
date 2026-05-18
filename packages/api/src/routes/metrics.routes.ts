import { Router } from "express";
import { register } from "prom-client";
// Side-effect import — registers metrics before /api/metrics gets hit.
import "../metrics";

const router = Router();

router.get("/", async (_req, res) => {
  res
    .status(200)
    .set("Content-Type", register.contentType)
    .send(await register.metrics());
});

export default router;
