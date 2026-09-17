// Server-side mainnet check, so the answer does not depend on the viewer's browser reaching an RPC.
import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";
import deployedContracts from "~~/contracts/deployedContracts";

const trustM = deployedContracts[mainnet.id].TrustMAttest;

const alchemyKey = process.env.ALCHEMY_API_KEY || process.env.NEXT_PUBLIC_ALCHEMY_API_KEY;

const client = alchemyKey
  ? createPublicClient({ chain: mainnet, transport: http(`https://eth-mainnet.g.alchemy.com/v2/${alchemyKey}`) })
  : undefined;

export const isChipSignature = async (sig: {
  chipX: `0x${string}`;
  chipY: `0x${string}`;
  hash: `0x${string}`;
  r: `0x${string}`;
  s: `0x${string}`;
}): Promise<boolean | undefined> => {
  if (!client) return undefined;
  return client.readContract({
    address: trustM.address,
    abi: trustM.abi,
    functionName: "isChipSignature",
    args: [sig.chipX, sig.chipY, sig.hash, sig.r, sig.s],
  });
};
