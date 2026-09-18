"use client";

import { useEffect, useState } from "react";
import { Address } from "@scaffold-ui/components";
import { formatEther } from "viem";
import { useAccount } from "wagmi";
import deployedContracts from "~~/contracts/deployedContracts";
import { useScaffoldEventHistory, useScaffoldReadContract, useScaffoldWriteContract } from "~~/hooks/scaffold-eth";
import { notification } from "~~/utils/scaffold-eth";

// Same clock as the device: five plants grow from the chip's last harvest to its next allowed one.
const STAGES = ["🟤", "🌱", "🌿", "🌾", "🌼", "🌽"];

type Field = {
  chipX: `0x${string}`;
  chipY: `0x${string}`;
  keyId: `0x${string}`;
  lastHarvest: number;
  nextHarvest: number;
  nonce: number;
  now: number;
  seenAt: number; // local ms when this answer arrived
};
type Pending = { id: string; deadline: number; nonce: number };

const stageOf = (f: Field, now: number) => {
  if (!f.lastHarvest) return 5;
  const span = Math.max(1, f.nextHarvest - f.lastHarvest);
  return Math.min(5, Math.max(0, Math.floor(((now - f.lastHarvest) * 5) / span)));
};
const countdown = (s: number) => {
  if (s <= 0) return "ready";
  const h = Math.floor(s / 3600),
    m = Math.floor((s % 3600) / 60);
  return h ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m ${String(s % 60).padStart(2, "0")}s`;
};
const short = (h: string) => `${h.slice(0, 10)}…${h.slice(-6)}`;

export const Farm = () => {
  const { address } = useAccount();
  const [field, setField] = useState<Field | undefined>();
  const [nowMs, setNowMs] = useState(0);
  const [asking, setAsking] = useState<Pending | undefined>();
  const [error, setError] = useState("");
  const [lastTx, setLastTx] = useState<`0x${string}` | undefined>();

  // The device reports its chip to /api/farm; the page shows that chip's field.
  const load = async () => {
    try {
      const r = await fetch("/api/farm", { cache: "no-store" });
      if (r.ok) {
        const j = await r.json();
        if (j.chipX) setField({ ...j, seenAt: Date.now() });
      }
    } catch {
      /* the queue is only there when yarn start runs on the laptop */
    }
  };
  useEffect(() => {
    load();
    const a = setInterval(load, 30000);
    const b = setInterval(() => setNowMs(Date.now()), 1000);
    return () => {
      clearInterval(a);
      clearInterval(b);
    };
  }, []);

  const { data: balance } = useScaffoldReadContract({
    contractName: "Crops",
    functionName: "balanceOf",
    args: [address],
    query: { enabled: !!address },
  });
  const { writeContractAsync, isMining } = useScaffoldWriteContract({ contractName: "Crops" });
  const deployed = (deployedContracts as Record<number, Record<string, { deployedOnBlock?: number }>>)[1]?.Crops;
  const { data: harvests } = useScaffoldEventHistory({
    contractName: "Crops",
    eventName: "Harvest",
    fromBlock: BigInt(deployed?.deployedOnBlock ?? 0),
    watch: true,
    blockData: true,
    enabled: !!deployed,
  });

  const now = field ? field.now + Math.max(0, Math.floor((nowMs - field.seenAt) / 1000)) : 0;
  const stage = field ? stageOf(field, now) : 0;
  const ready = !!field && now >= field.nextHarvest;

  // Tell the queue which wallet is connected, so a harvest started with A on the device knows its `to`.
  useEffect(() => {
    if (!address) return;
    fetch("/api/farm", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ to: address }),
    }).catch(() => undefined);
  }, [address]);

  // A harvest the device started (A on the hat) shows up here as a signed request for this wallet: send it.
  useEffect(() => {
    if (!address || asking) return;
    const t = setInterval(async () => {
      try {
        const r = await fetch(`/api/sign?to=${address}&signed=1`, { cache: "no-store" });
        const j = r.ok ? await r.json() : {};
        if (j.id && j.status === "signed" && !j.tx && j.verdict === undefined) {
          setAsking({ id: j.id, deadline: j.deadline, nonce: j.nonce });
        }
      } catch {
        /* queue not reachable */
      }
    }, 3000);
    return () => clearInterval(t);
  }, [address, asking]);

  // Ask the device to sign a harvest for the connected wallet, then send it from that wallet.
  const harvest = async () => {
    if (!field || !address) return;
    setError("");
    setLastTx(undefined);
    try {
      const res = await fetch("/api/sign", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "harvest", to: address, chipX: field.chipX, chipY: field.chipY }),
        signal: AbortSignal.timeout(15000),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? res.statusText);
      setAsking({ id: j.id, deadline: j.deadline, nonce: j.nonce });
    } catch (e) {
      setError(`could not reach the queue: ${(e as Error).message}`);
    }
  };
  useEffect(() => {
    if (!asking || !field || !address) return;
    let done = false;
    const t = setInterval(async () => {
      const r = await fetch(`/api/sign/${asking.id}`, { cache: "no-store" });
      if (!r.ok || done) return;
      const j = await r.json();
      if (j.status === "refused") {
        setError("refused on the device");
        setAsking(undefined);
      } else if (j.status === "signed") {
        done = true;
        clearInterval(t);
        setAsking(undefined);
        try {
          const tx = await writeContractAsync({
            functionName: "harvest",
            args: [field.chipX, field.chipY, address, BigInt(asking.deadline), j.r, j.s],
          });
          setLastTx(tx);
          await fetch(`/api/sign/${asking.id}`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ verdict: true, tx }),
          });
          notification.success("Harvested 5 CROPS");
          load();
        } catch (e) {
          const msg = (e as Error).message.split("\n")[0].slice(0, 80);
          setError(msg);
          await fetch(`/api/sign/${asking.id}`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ verdict: false, error: msg }),
          });
        }
      }
    }, 1000);
    return () => clearInterval(t);
  }, [asking, field, address, writeContractAsync]);

  return (
    <section className="card bg-base-100 shadow w-full">
      <div className="card-body gap-4">
        <div className="flex justify-between items-baseline">
          <h2 className="card-title m-0">Crops field</h2>
          <span className="font-mono">{address ? `${formatEther(balance ?? 0n)} CROPS` : "connect a wallet"}</span>
        </div>
        {!deployed ? (
          <div className="text-sm opacity-70">Crops is not deployed yet.</div>
        ) : field ? (
          <>
            <div className="text-6xl text-center tracking-widest py-2 bg-base-200 rounded-box">
              {STAGES[stage].repeat(5)}
            </div>
            <div className="flex justify-between text-sm">
              <span>
                chip <span className="font-mono">{short(field.chipX)}</span>
              </span>
              <span>{ready ? "ready to harvest" : `next harvest in ${countdown(field.nextHarvest - now)}`}</span>
            </div>
            <button
              className="btn btn-primary btn-lg"
              disabled={!address || !ready || !!asking || isMining}
              onClick={harvest}
            >
              {asking ? "press A on the device…" : isMining ? "sending…" : "Harvest 5 CROPS"}
            </button>
            {address && ready && !asking && (
              <div className="text-sm opacity-70">
                Or press A on the device. Either way your wallet sends the transaction.
              </div>
            )}
            {!address && <div className="text-sm opacity-70">Connect the wallet that should receive the CROPS.</div>}
            {error && <div className="alert alert-error">{error}</div>}
            {lastTx && (
              <div className="alert alert-success">
                Harvested.{" "}
                <a className="link" href={`https://etherscan.io/tx/${lastTx}`} target="_blank" rel="noreferrer">
                  tx
                </a>
              </div>
            )}
          </>
        ) : (
          <div className="text-sm opacity-70">
            No device seen yet. The Pico reports in when it is on WiFi and this app is running where it can reach it.
          </div>
        )}
        <div className="text-sm">
          <div className="opacity-70 mb-1">harvests</div>
          {harvests?.length ? (
            <ul className="m-0 p-0 list-none flex flex-col gap-1">
              {harvests.slice(0, 8).map(h => (
                <li key={h.transactionHash} className="flex gap-2 items-center flex-wrap">
                  <span>🌽 5 CROPS to</span>
                  <Address address={h.args.to} size="sm" />
                  <span className="opacity-70">chip {short(h.args.keyId ?? "")}</span>
                  <a
                    className="link"
                    href={`https://etherscan.io/tx/${h.transactionHash}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    tx
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <span className="opacity-70">none yet</span>
          )}
        </div>
      </div>
    </section>
  );
};
