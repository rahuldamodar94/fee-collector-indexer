import { z } from "zod";

const decodedCursorSchema = z.object({
  blockNumber: z.number().int().nonnegative(),
  logIndex: z.number().int().nonnegative(),
});

const cursorSchema = z
  .string()
  .optional()
  .transform((val, ctx) => {
    if (val === undefined) return undefined;
    try {
      const raw = JSON.parse(Buffer.from(val, "base64url").toString("utf8"));
      return decodedCursorSchema.parse(raw);
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
