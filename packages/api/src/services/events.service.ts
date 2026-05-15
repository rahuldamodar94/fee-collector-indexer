import { findEvents } from "../repositories/events.repository";
import type { EventsQuery } from "../types/events";
import { encodeCursor } from "../utils/cursor";

export async function getEvents(query: EventsQuery) {
  const { data, hasMore } = await findEvents(query);

  let nextCursor: string | null = null;
  if (hasMore && data.length > 0) {
    const last = data[data.length - 1]!;
    nextCursor = encodeCursor({
      blockNumber: last.blockNumber,
      logIndex: last.logIndex,
    });
  }

  return {
    data,
    pagination: {
      limit: query.limit,
      hasMore,
      nextCursor,
    },
  };
}
