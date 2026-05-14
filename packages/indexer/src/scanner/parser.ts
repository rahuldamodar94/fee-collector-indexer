import { ethers } from "ethers";

const FEES_COLLECTED_ABI = [
  "event FeesCollected(address indexed _token, address indexed _integrator, uint256 _integratorFee, uint256 _lifiFee)",
];

const iface = new ethers.utils.Interface(FEES_COLLECTED_ABI);

export const FEE_COLLECTED_TOPIC = iface.getEventTopic("FeesCollected");

export interface ParsedFeeCollectedEvent {
  chainId: number;
  blockNumber: number;
  blockTimestamp: Date;
  transactionHash: string;
  logIndex: number;
  token: string;
  integrator: string;
  integratorFee: string;
  lifiFee: string;
}

export function parseLog(
  log: ethers.providers.Log,
  chainId: number,
  blockTimestamp: Date,
): ParsedFeeCollectedEvent {
  const decoded = iface.parseLog(log);

  return {
    chainId,
    blockNumber: log.blockNumber,
    blockTimestamp,
    transactionHash: log.transactionHash,
    logIndex: log.logIndex,
    token: decoded.args._token.toLowerCase(),
    integrator: decoded.args._integrator.toLowerCase(),
    integratorFee: decoded.args._integratorFee.toString(),
    lifiFee: decoded.args._lifiFee.toString(),
  };
}
