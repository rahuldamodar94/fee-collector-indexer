import { ethers } from "ethers";

export function createProvider(rpcUrls: string[], chainId: number) {
  if (rpcUrls.length === 0) {
    throw new Error("At least one RPC URL is required");
  }

  if (rpcUrls.length === 1) {
    return new ethers.providers.JsonRpcProvider(rpcUrls[0], chainId);
  }

  const providers = rpcUrls.map((url, index) => {
    return {
      provider: new ethers.providers.JsonRpcProvider(url, chainId),
      priority: index + 1,
      stallTimeout: 2000,
      weight: 1,
    };
  });

  return new ethers.providers.FallbackProvider(providers, 1);
}
