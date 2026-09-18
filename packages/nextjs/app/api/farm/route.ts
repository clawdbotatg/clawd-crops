import { NextResponse } from "next/server";
import { CROPS_DEPLOYED, fieldState } from "~~/utils/crops";

export const dynamic = "force-dynamic";

type Chip = { x: `0x${string}`; y: `0x${string}` };
const g = globalThis as { __trustmChip?: Chip; __trustmWallet?: `0x${string}` };

// POST {to}: the wallet connected on the page, so a harvest started on the device has somewhere to go.
export async function POST(req: Request) {
  const { to } = (await req.json()) as { to?: string };
  if (!/^0x[0-9a-fA-F]{40}$/.test(to ?? "")) return NextResponse.json({ error: "to: an address" }, { status: 400 });
  g.__trustmWallet = to as `0x${string}`;
  return NextResponse.json({ to });
}

// GET ?x=&y=: the contract's clock for one chip (the device asks, and is remembered).
// GET with no params: the same for the last chip that asked (the page).
export async function GET(req: Request) {
  if (!CROPS_DEPLOYED) return NextResponse.json({ error: "Crops is not deployed yet" }, { status: 503 });
  const u = new URL(req.url);
  let x = u.searchParams.get("x"),
    y = u.searchParams.get("y");
  if (x && y) {
    if (!/^0x[0-9a-fA-F]{64}$/.test(x) || !/^0x[0-9a-fA-F]{64}$/.test(y)) {
      return NextResponse.json({ error: "x and y: the chip's public key" }, { status: 400 });
    }
    g.__trustmChip = { x: x as `0x${string}`, y: y as `0x${string}` };
  } else if (g.__trustmChip) {
    ({ x, y } = g.__trustmChip);
  } else {
    return NextResponse.json({});
  }
  const f = await fieldState(x as `0x${string}`, y as `0x${string}`);
  return NextResponse.json({ chipX: x, chipY: y, to: g.__trustmWallet ?? null, ...f });
}
