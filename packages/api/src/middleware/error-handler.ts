import type { Request, Response, NextFunction } from "express";
import { HttpError } from "../utils/http-errors.js";

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

  console.error("unhandled error", err);
  res.status(500).json({
    error: {
      code: "internal_error",
      message: "internal server error",
    },
  });
}
