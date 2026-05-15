import { Router } from "express";
import mongoose from "mongoose";

const router = Router();

router.get("/", (_req, res) => {
  const ok = mongoose.connection.readyState === 1;
  res.status(ok ? 200 : 503).json({ status: ok ? "ok" : "unhealthy" });
});

export default router;
