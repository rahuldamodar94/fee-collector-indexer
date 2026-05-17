import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import eventsRouter from "./routes/events.routes";
import healthRouter from "./routes/health.routes";
import metricsRouter from "./routes/metrics.routes";

import { errorHandler } from "./middleware/error-handler";
import { requestLogger } from "./middleware/request-logger";
import { metricsMiddleware } from "./middleware/metrics.middleware";
import { NotFoundError } from "./utils/http-errors";

const app = express();
app.use(express.json());
app.use(requestLogger);
app.use(metricsMiddleware);

app.use("/api/events", eventsRouter);
app.use("/api/health", healthRouter);
app.use("/api/metrics", metricsRouter);
app.use((_req: Request, _res: Response, next: NextFunction) => {
  next(new NotFoundError("endpoint not found"));
});

app.use(errorHandler);

export default app;
