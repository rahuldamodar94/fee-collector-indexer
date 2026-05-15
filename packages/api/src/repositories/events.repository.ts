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
