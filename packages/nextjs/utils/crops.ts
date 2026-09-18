// Server-side reads of the Crops contract, for the device's field and for building a harvest request.
import { createPublicClient, encodeAbiParameters, http, keccak256 } from "viem";
import { mainnet } from "viem/chains";
import deployedContracts from "~~/contracts/deployedContracts";

// Missing until `yarn deploy` has written Crops into deployedContracts.ts; every route then answers 503.
type Deployed = { address: `0x${string}`; abi: readonly unknown[]; deployedOnBlock?: number };
const maybe = (deployedContracts as Record<number, Record<string, Deployed>>)[mainnet.id]?.Crops;
const crops = () => {
  if (!maybe) throw new Error("Crops is not deployed yet");
  return maybe as unknown as (typeof deployedContracts)[1]["TrustMAttest"] & Deployed;
};
const alchemyKey = process.env.ALCHEMY_API_KEY || process.env.NEXT_PUBLIC_ALCHEMY_API_KEY;
const client = createPublicClient({
  chain: mainnet,
  transport: http(alchemyKey ? `https://eth-mainnet.g.alchemy.com/v2/${alchemyKey}` : undefined),
});

export const CROPS_DEPLOYED = !!maybe;
const DEADLINE_S = 3600; // the chip's signature is good for an hour

export const keyIdOf = (x: `0x${string}`, y: `0x${string}`) =>
  keccak256(encodeAbiParameters([{ type: "bytes32" }, { type: "bytes32" }], [x, y]));

/// What the field screen needs: the contract's clock for this chip.
export const fieldState = async (x: `0x${string}`, y: `0x${string}`) => {
  const keyId = keyIdOf(x, y);
  const read = <T>(functionName: "lastHarvest" | "nextHarvest" | "nonce") =>
    client.readContract({
      address: crops().address,
      abi: crops().abi,
      functionName,
      args: [keyId],
    } as never) as Promise<T>;
  const [last, next, nonce, block] = await Promise.all([
    read<bigint>("lastHarvest"),
    read<bigint>("nextHarvest"),
    read<bigint>("nonce"),
    client.getBlock(),
  ]);
  return {
    keyId,
    lastHarvest: Number(last),
    nextHarvest: Number(next),
    nonce: Number(nonce),
    now: Number(block.timestamp),
    cooldown: 5 * 3600,
    contract: crops().address,
  };
};

/// The fields of a harvest request plus the digest the chip must sign, exactly as Crops.harvestDigest computes it.
export const harvestFields = async (x: `0x${string}`, y: `0x${string}`, to: `0x${string}`) => {
  const f = await fieldState(x, y);
  if (f.now < f.nextHarvest) return { error: `too soon: next harvest at ${f.nextHarvest}`, nextHarvest: f.nextHarvest };
  const deadline = f.now + DEADLINE_S;
  const hash = (await client.readContract({
    address: crops().address,
    abi: crops().abi,
    functionName: "harvestDigest",
    args: [f.keyId, to, BigInt(deadline), BigInt(f.nonce)],
  } as never)) as `0x${string}`;
  return { hash, to, deadline, nonce: f.nonce, chainId: mainnet.id, contract: crops().address };
};
