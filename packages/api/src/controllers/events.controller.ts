import type { Request, Response } from "express";
import { eventsQuerySchema } from "../validators/events.validator";
import { getEvents } from "../services/events.service";

export async function getEventsController(
  req: Request,
  res: Response,
): Promise<void> {
  const parsed = eventsQuerySchema.safeParse(req.query);

  if (!parsed.success) {
    res.status(400).json({
      error: {
        code: "invalid_query",
        message: "invalid query",
        details: parsed.error.issues,
      },
    });
    return;
  }

  const result = await getEvents(parsed.data);

  res.status(200).json(result);
}
