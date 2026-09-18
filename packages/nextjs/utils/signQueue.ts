// The queue between the page and the Pico. One process (yarn start on the laptop the Pico can reach)
// holds it in memory. Set UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN to keep it in Upstash
// instead, which is what a Vercel deployment needs (every request may land in a different lambda).

export type SignRequest = {
  id: string;
  kind: "sign" | "harvest";
  message: string; // what the device shows; for a harvest, a description
  hash: `0x${string}`; // the digest the chip signs
  status: "pending" | "signed" | "refused";
  createdAt: number;
  // harvest fields, all part of the signed digest (Crops.harvestDigest)
  to?: `0x${string}`;
  deadline?: number;
  nonce?: number;
  chainId?: number;
  contract?: `0x${string}`;
  // filled by the device
  r?: `0x${string}`;
  s?: `0x${string}`;
  chipX?: `0x${string}`;
  chipY?: `0x${string}`;
  // outcome: sign → mainnet isChipSignature; harvest → the wallet's tx confirmed
  verdict?: boolean;
  tx?: `0x${string}`;
  error?: string;
};

const TTL_S = 600;
const KEY = (id: string) => `trustm:req:${id}`;
const PENDING = "trustm:pending";

const upstash = process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN;

const redis = async (...cmd: (string | number)[]) => {
  const res = await fetch(process.env.UPSTASH_REDIS_REST_URL!, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}` },
    body: JSON.stringify(cmd),
    cache: "no-store",
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error);
  return json.result;
};

const mem =
  (globalThis as { __trustmQueue?: Map<string, SignRequest> }).__trustmQueue ?? new Map<string, SignRequest>();
(globalThis as { __trustmQueue?: Map<string, SignRequest> }).__trustmQueue = mem;

const sweep = () => {
  const cutoff = Date.now() - TTL_S * 1000;
  for (const [id, r] of mem) if (r.createdAt < cutoff) mem.delete(id);
};

export const get = async (id: string): Promise<SignRequest | undefined> => {
  if (upstash) {
    const raw = await redis("GET", KEY(id));
    return raw ? (JSON.parse(raw) as SignRequest) : undefined;
  }
  sweep();
  return mem.get(id);
};

export const put = async (req: SignRequest) => {
  if (upstash) {
    await redis("SET", KEY(req.id), JSON.stringify(req), "EX", TTL_S);
    if (req.status === "pending") await redis("SET", PENDING, req.id, "EX", TTL_S);
    else if ((await redis("GET", PENDING)) === req.id) await redis("DEL", PENDING);
    if (req.kind === "harvest" && req.status === "signed" && req.to) {
      await redis("SET", `trustm:lastsigned:${req.to.toLowerCase()}`, req.id, "EX", TTL_S);
    }
    return;
  }
  mem.set(req.id, req);
};

// A signed harvest for this wallet that no transaction has picked up yet (started with A on the device).
export const latestSignedHarvest = async (to: string): Promise<SignRequest | undefined> => {
  const match = (r: SignRequest) =>
    r.kind === "harvest" &&
    r.status === "signed" &&
    !r.tx &&
    r.verdict === undefined &&
    r.to?.toLowerCase() === to.toLowerCase();
  if (upstash) {
    const id = await redis("GET", `trustm:lastsigned:${to.toLowerCase()}`);
    const r = id ? await get(id) : undefined;
    return r && match(r) ? r : undefined;
  }
  sweep();
  return [...mem.values()].filter(match).sort((a, b) => b.createdAt - a.createdAt)[0];
};

// The one request the Pico should show: the newest pending one.
export const pending = async (): Promise<SignRequest | undefined> => {
  if (upstash) {
    const id = await redis("GET", PENDING);
    return id ? get(id) : undefined;
  }
  sweep();
  return [...mem.values()].filter(r => r.status === "pending").sort((a, b) => b.createdAt - a.createdAt)[0];
};
