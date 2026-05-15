import { findEvents } from "../repositories/events.repository";
import type { EventsQuery } from "../types/events";

export async function getEvents(query: EventsQuery) {
  const { events, hasMore } = await findEvents(query);

  let nextCursor: string | null = null;
  if (hasMore && events.length > 0) {
    const last = events[events.length - 1]!;
    const cursorObj = {
      blockNumber: last.blockNumber,
      logIndex: last.logIndex,
    };
    nextCursor = Buffer.from(JSON.stringify(cursorObj)).toString("base64url");
  }

  return {
    data: events,
    pagination: {
      limit: query.limit,
      hasMore,
      nextCursor,
    },
  };
}
