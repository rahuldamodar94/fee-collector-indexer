import { Router } from "express";
import { register, collectDefaultMetrics } from "prom-client";

collectDefaultMetrics();

const router = Router();

router.get("/", async (_req, res) => {
  res
    .status(200)
    .set("Content-Type", register.contentType)
    .send(await register.metrics());
});

export default router;
