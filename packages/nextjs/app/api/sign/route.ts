import { NextResponse } from "next/server";
import { keccak256, stringToBytes } from "viem";
import { harvestFields } from "~~/utils/crops";
import { deviceBusy, deviceSeen } from "~~/utils/device";
import { latestSignedHarvest, pending, put } from "~~/utils/signQueue";

export const dynamic = "force-dynamic";
const hex32 = (v: unknown): v is `0x${string}` => typeof v === "string" && /^0x[0-9a-fA-F]{64}$/.test(v);

// POST {message}: the page asks the chip to sign. Returns the request to poll on.
export async function POST(req: Request) {
  if (process.env.VERCEL && !process.env.UPSTASH_REDIS_REST_URL) {
    return NextResponse.json(
      { error: "this deployment has no queue; run `yarn start` on a laptop the Pico can reach, or set Upstash" },
      { status: 503 },
    );
  }
  const body = (await req.json()) as { message?: string; kind?: string; to?: string; chipX?: string; chipY?: string };
  const base = { id: crypto.randomUUID().slice(0, 8), status: "pending" as const, createdAt: Date.now() };
  if (body.kind === "harvest") {
    // {to, chipX, chipY}: the page asks the chip to sign a harvest for the connected wallet
    if (!/^0x[0-9a-fA-F]{40}$/.test(body.to ?? "") || !hex32(body.chipX) || !hex32(body.chipY)) {
      return NextResponse.json({ error: "harvest needs to, chipX, chipY" }, { status: 400 });
    }
    const h = await harvestFields(body.chipX, body.chipY, body.to as `0x${string}`);
    if ("error" in h) return NextResponse.json(h, { status: 409 });
    const r = { ...base, kind: "harvest" as const, message: `HARVEST 5 CROPS to ${body.to}`, ...h };
    await put(r);
    return NextResponse.json(r);
  }
  const { message } = body;
  if (typeof message !== "string" || !message.trim() || message.length > 200) {
    return NextResponse.json({ error: "message: 1 to 200 characters" }, { status: 400 });
  }
  const r = { ...base, kind: "sign" as const, message, hash: keccak256(stringToBytes(message)) };
  await put(r);
  return NextResponse.json(r);
}

// GET: what the Pico polls. The newest pending request, or {}.
// GET ?to=&signed=1: what the page polls for harvests the device started: the newest signed one for that wallet.
export async function GET(req: Request) {
  const u = new URL(req.url);
  if (u.searchParams.get("signed")) {
    const r = await latestSignedHarvest(u.searchParams.get("to") ?? "");
    return NextResponse.json(r ?? {});
  }
  deviceSeen(); // only the Pico polls this
  const r = await pending();
  if (!r) return NextResponse.json({});
  deviceBusy(300_000); // it now shows the request and waits for A (ui.run timeout_ms in the firmware)
  const { id, kind, message, hash, to, deadline, nonce, chainId, contract } = r;
  return NextResponse.json({ id, kind, message, hash, to, deadline, nonce, chainId, contract });
}
