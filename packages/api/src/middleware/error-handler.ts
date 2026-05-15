import type { Request, Response, NextFunction } from "express";
import { getLogger } from "@fee-collector/shared";
import { HttpError } from "../utils/http-errors";

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof HttpError) {
    res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
      },
    });
    return;
  }

  getLogger().error("unhandled error", { err });
  res.status(500).json({
    error: {
      code: "internal_error",
      message: "internal server error",
    },
  });
}
