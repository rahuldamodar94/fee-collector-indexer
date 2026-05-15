import express from "express";
import eventsRouter from "./routes/events.routes";
import healthRouter from "./routes/health.routes";

const app = express();
app.use(express.json());

app.use("/events", eventsRouter);
app.use("/health", healthRouter);

export default app;
