import { z } from "zod";

const cursorPayloadSchema = z.object({
  blockNumber: z.number().int().nonnegative(),
  logIndex: z.number().int().nonnegative(),
});

export type Cursor = z.infer<typeof cursorPayloadSchema>;

export function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

export function decodeCursor(encoded: string): Cursor {
  const raw = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  return cursorPayloadSchema.parse(raw);
}
