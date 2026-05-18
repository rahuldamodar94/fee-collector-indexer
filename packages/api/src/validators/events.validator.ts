import { z } from "zod";
import { decodeCursor } from "../utils/cursor";
import { BadRequestError } from "../utils/http-errors";

// Convert cursor decode failures into Zod issues so they come back as
// a clean 400, not a 500.
const cursorSchema = z
  .string()
  .optional()
  .transform((val, ctx) => {
    if (val === undefined) return undefined;
    try {
      return decodeCursor(val);
    } catch {
      ctx.addIssue({ code: "custom", message: "invalid cursor" });
      return z.NEVER;
    }
  });

export const eventsQuerySchema = z.object({
  integrator: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/, "invalid integrator address")
    .transform((s) => s.toLowerCase()),

  chainId: z.coerce.number().int().positive().optional(),

  limit: z.coerce.number().int().min(1).max(200).default(50),

  cursor: cursorSchema,
});

export type ValidatedEventsQuery = z.infer<typeof eventsQuerySchema>;

export function validateEventsQuery(query: unknown): ValidatedEventsQuery {
  const parsed = eventsQuerySchema.safeParse(query);
  if (parsed.success) return parsed.data;

  throw new BadRequestError(
    "Invalid request parameters",
    parsed.error.issues.map((issue) => ({
      field: issue.path.join("."),
      message: issue.message,
    })),
  );
}
