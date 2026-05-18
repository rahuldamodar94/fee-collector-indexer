import { ethers } from "ethers";

// Not StaticJsonRpcProvider — we want ethers to check the RPC's chain ID
// against CHAIN_ID at boot and fail loud on mismatch.
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

// Batch provider doesn't play well with FallbackProvider, so just use
// the first URL. See DESIGN.md.
export function createBatchProvider(rpcUrls: string[], chainId: number) {
  if (rpcUrls.length === 0) {
    throw new Error("At least one RPC URL is required");
  }
  return new ethers.providers.JsonRpcBatchProvider(rpcUrls[0], chainId);
}
