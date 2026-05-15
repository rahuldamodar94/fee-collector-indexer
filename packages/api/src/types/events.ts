export interface EventsQuery {
  integrator: string;
  chainId?: number;
  limit: number;
  cursor?: { blockNumber: number; logIndex: number };
}

export interface EventsResult {
  data: Array<{
    chainId: number;
    blockNumber: number;
    blockTimestamp: Date;
    transactionHash: string;
    logIndex: number;
    integrator: string;
    token: string;
    integratorFee: string;
    lifiFee: string;
  }>;
  hasMore: boolean;
}
