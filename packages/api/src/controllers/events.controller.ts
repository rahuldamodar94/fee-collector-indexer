import type { Request, Response } from "express";
import { validateEventsQuery } from "../validators/events.validator";
import { getEvents } from "../services/events.service";

export async function getEventsController(
  req: Request,
  res: Response,
): Promise<void> {
  const validatedQuery = validateEventsQuery(req.query);
  const result = await getEvents(validatedQuery);
  res.status(200).json(result);
}
