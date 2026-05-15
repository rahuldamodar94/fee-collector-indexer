import express from "express";
import eventsRouter from "./routes/events.routes";
import healthRouter from "./routes/health.routes";
import { errorHandler } from "./middleware/error-handler";

const app = express();
app.use(express.json());

app.use("/events", eventsRouter);
app.use("/health", healthRouter);

app.use((_req, res) => {
  res.status(404).json({
    error: {
      code: "not_found",
      message: "endpoint not found",
    },
  });
});

app.use(errorHandler);

export default app;
