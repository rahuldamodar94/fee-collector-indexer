import { FeeCollectedEventModel } from "@fee-collector/shared";
import type { EventsQuery, EventsResult } from "../types/events";

export async function findEvents(query: EventsQuery): Promise<EventsResult> {
  const filter: Record<string, unknown> = {};
  filter.integrator = query.integrator;

  if (query.chainId !== undefined) {
    filter.chainId = query.chainId;
  }

  if (query.cursor) {
    filter.$or = [
      { blockNumber: { $lt: query.cursor.blockNumber } },
      {
        blockNumber: query.cursor.blockNumber,
        logIndex: { $lt: query.cursor.logIndex },
      },
    ];
  }

  const docs = await FeeCollectedEventModel.find(filter)
    .sort({ blockNumber: -1, logIndex: -1 })
    .limit(query.limit + 1)
    .lean();

  const hasMore = docs.length > query.limit;
  const events = hasMore ? docs.slice(0, query.limit) : docs;

  return { events, hasMore };
}
