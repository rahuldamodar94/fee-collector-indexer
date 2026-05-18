import { FeeCollectedEventModel } from "@fee-collector/shared";
import type { EventsQuery, EventsResult } from "../types/events";

export async function findEvents(query: EventsQuery): Promise<EventsResult> {
  const filter: Record<string, unknown> = {
    integrator: query.integrator,
    chainId: query.chainId,
  };

  // Items strictly before the cursor. The $or covers "older block" or
  // "same block, earlier log". Served by the integrator+blockNumber+logIndex
  // index.
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
    .limit(query.limit + 1) // +1 tells us if there's another page
    .select({
      chainId: 1,
      blockNumber: 1,
      blockTimestamp: 1,
      transactionHash: 1,
      logIndex: 1,
      integrator: 1,
      token: 1,
      integratorFee: 1,
      lifiFee: 1,
      _id: 0,
    })
    .lean();

  const hasMore = docs.length > query.limit;
  const data = hasMore ? docs.slice(0, query.limit) : docs;

  return { data, hasMore };
}
