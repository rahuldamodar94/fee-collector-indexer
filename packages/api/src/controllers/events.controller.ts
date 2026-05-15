import type { Request, Response } from "express";
import { eventsQuerySchema } from "../validators/events.validator";
import { getEvents } from "../services/events.service";
import { BadRequestError } from "../utils/http-errors";

export async function getEventsController(
  req: Request,
  res: Response,
): Promise<void> {
  const parsed = eventsQuerySchema.safeParse(req.query);

  if (!parsed.success) {
    throw new BadRequestError("invalid query", parsed.error.issues);
  }

  const result = await getEvents(parsed.data);

  res.status(200).json(result);
}
