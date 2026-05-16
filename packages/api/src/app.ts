import express, { type NextFunction, type Request, type Response } from "express";
import eventsRouter from "./routes/events.routes";
import healthRouter from "./routes/health.routes";
import { errorHandler } from "./middleware/error-handler";
import { requestLogger } from "./middleware/request-logger";
import { NotFoundError } from "./utils/http-errors";

const app = express();
app.use(express.json());
app.use(requestLogger);

app.use("/events", eventsRouter);
app.use("/health", healthRouter);

app.use((_req: Request, _res: Response, next: NextFunction) => {
  next(new NotFoundError("endpoint not found"));
});

app.use(errorHandler);

export default app;
