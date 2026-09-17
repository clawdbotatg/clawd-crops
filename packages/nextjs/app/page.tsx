"use client";

import { useEffect, useState } from "react";
import { Address } from "@scaffold-ui/components";
import type { NextPage } from "next";
import { encodeAbiParameters, keccak256 } from "viem";
import { useDeployedContractInfo, useScaffoldReadContract, useScaffoldWriteContract } from "~~/hooks/scaffold-eth";

type Sig = {
  message?: string;
  hash: `0x${string}`;
  r: `0x${string}`;
  s: `0x${string}`;
  chipX: `0x${string}`;
  chipY: `0x${string}`;
};
type Cert = {
  issuer?: string;
  chipX: `0x${string}`;
  chipY: `0x${string}`;
  attest: {
    cert: `0x${string}`;
    tbsStart: number;
    tbsLen: number;
    pkOffset: number;
    r: `0x${string}`;
    s: `0x${string}`;
  };
};

const parse = <T,>(text: string): T | undefined => {
  try {
    return JSON.parse(text) as T;
  } catch {
    return undefined;
  }
};

const keyId = (x?: `0x${string}`, y?: `0x${string}`) =>
  x && y ? keccak256(encodeAbiParameters([{ type: "bytes32" }, { type: "bytes32" }], [x, y])) : undefined;

const short = (h?: string) => (h ? `${h.slice(0, 10)}…${h.slice(-6)}` : "");

// tools/chip.py ui opens this page as /#sig=<url-encoded JSON>; the hash never reaches the server.
const sigFromUrl = () => {
  const m = window.location.hash.match(/^#sig=(.*)$/);
  return m ? decodeURIComponent(m[1]) : "";
};

const Home: NextPage = () => {
  const [sigText, setSigText] = useState("");
  const [certText, setCertText] = useState("");
  useEffect(() => {
    const load = () => {
      const s = sigFromUrl();
      if (s) setSigText(s);
    };
    load();
    window.addEventListener("hashchange", load);
    return () => window.removeEventListener("hashchange", load);
  }, []);

  const sig = parse<Sig>(sigText);
  const cert = parse<Cert>(certText);
  const { data: contract } = useDeployedContractInfo({ contractName: "TrustMAttest" });

  const { data: verdict, isFetching } = useScaffoldReadContract({
    contractName: "TrustMAttest",
    functionName: "isChipSignature",
    args: sig
      ? [sig.chipX, sig.chipY, sig.hash, sig.r, sig.s]
      : [undefined, undefined, undefined, undefined, undefined],
    query: { enabled: !!sig },
  });
  const { data: sigKeyAttested } = useScaffoldReadContract({
    contractName: "TrustMAttest",
    functionName: "attested",
    args: [keyId(sig?.chipX, sig?.chipY)],
    query: { enabled: !!sig },
  });
  const { data: certKeyAttested } = useScaffoldReadContract({
    contractName: "TrustMAttest",
    functionName: "attested",
    args: [keyId(cert?.chipX, cert?.chipY)],
    query: { enabled: !!cert },
  });
  const { writeContractAsync, isMining } = useScaffoldWriteContract({ contractName: "TrustMAttest" });

  const settled = sig && !isFetching && verdict !== undefined;
  const step = (ok: boolean | undefined) => (ok === undefined ? "○" : ok ? "✓" : "✗");

  return (
    <div className="flex flex-col items-center grow pt-10 px-5 gap-8 max-w-3xl mx-auto w-full">
      <div className="text-center">
        <h1 className="text-4xl font-bold">Did a real chip sign this?</h1>
        <p className="mt-3">
          An Infineon OPTIGA Trust M holds a key that never leaves the silicon. Infineon signed a certificate for that
          key at the factory. A contract on Ethereum mainnet holds Infineon&apos;s CA key, has checked that certificate,
          and now answers one question about any signature: did this chip make it?
        </p>
        <div className="flex justify-center items-center gap-2 mt-2 text-sm">
          <span>Contract:</span>
          <Address address={contract?.address} />
        </div>
      </div>

      <section className="card bg-base-100 shadow w-full">
        <div className="card-body gap-4">
          {sig ? (
            <>
              <div className="text-sm opacity-70">The chip signed</div>
              <div className="text-3xl font-mono font-bold break-words">&quot;{sig.message ?? "(hash only)"}&quot;</div>
              <div className="font-mono text-xs opacity-70 break-all">keccak256 {sig.hash}</div>
              {isFetching || verdict === undefined ? (
                <div className="flex items-center gap-2">
                  <span className="loading loading-spinner" /> asking mainnet…
                </div>
              ) : verdict ? (
                <div className="alert alert-success text-lg">
                  Yes. A real Infineon Trust M signed this, and the chain can prove it.
                </div>
              ) : sigKeyAttested === false ? (
                <div className="alert alert-warning">
                  This key is not attested yet. Attest its certificate below first.
                </div>
              ) : (
                <div className="alert alert-error">No. This is not a valid signature from that chip.</div>
              )}
              <ul className="text-sm font-mono leading-7 m-0 p-0 list-none">
                <li>{step(settled ? true : undefined)} Infineon Trust M CA 101 key is pinned in the contract</li>
                <li>
                  {step(sigKeyAttested)} CA signed the factory certificate of chip key {short(sig.chipX)}
                </li>
                <li>{step(settled ? !!verdict : undefined)} chip key signed keccak256 of the message</li>
              </ul>
              <div className="text-xs opacity-70 font-mono break-all">
                r {sig.r}
                <br />s {sig.s}
              </div>
              <button className="btn btn-ghost btn-sm self-start" onClick={() => setSigText("")}>
                check another
              </button>
            </>
          ) : (
            <>
              <h2 className="card-title">Sign something with the chip</h2>
              <p className="m-0 text-sm">
                Pico on USB, hat on: run <code>tools/chip.py ui &quot;hello world&quot;</code>. The screen shows the
                text, you press <b>A</b>, the chip signs, and this page opens with the answer. Or paste the JSON from{" "}
                <code>tools/chip.py sign &quot;hello world&quot;</code> here.
              </p>
              <textarea
                className="textarea textarea-bordered font-mono text-xs h-32"
                placeholder='{"message":"hello world","hash":"0x..","r":"0x..","s":"0x..","chipX":"0x..","chipY":"0x.."}'
                value={sigText}
                onChange={e => setSigText(e.target.value)}
              />
              {sigText && !sig && <div className="text-error text-sm">not valid JSON</div>}
            </>
          )}
        </div>
      </section>

      <details className="collapse collapse-arrow bg-base-100 shadow w-full">
        <summary className="collapse-title font-semibold">Attest a new chip (once per chip)</summary>
        <div className="collapse-content flex flex-col gap-2">
          <p className="m-0 text-sm">
            Run <code>tools/chip.py cert</code>, paste the JSON, and send the transaction. The contract checks that
            Infineon&apos;s CA signed the certificate and records the chip&apos;s public key.
          </p>
          <textarea
            className="textarea textarea-bordered font-mono text-xs h-32"
            placeholder='{"issuer":"...","chipX":"0x..","chipY":"0x..","attest":{"cert":"0x..","tbsStart":4,"tbsLen":386,"pkOffset":209,"r":"0x..","s":"0x.."}}'
            value={certText}
            onChange={e => setCertText(e.target.value)}
          />
          {certText && !cert && <div className="text-error text-sm">not valid JSON</div>}
          {cert && (
            <div className="flex flex-col gap-2">
              <div className="text-sm">
                Issuer: {cert.issuer ?? "?"}
                <br />
                Key: {short(cert.chipX)} / {short(cert.chipY)}
              </div>
              {certKeyAttested ? (
                <div className="alert alert-success">This chip is already attested.</div>
              ) : (
                <button
                  className="btn btn-primary"
                  disabled={isMining}
                  onClick={() =>
                    writeContractAsync({
                      functionName: "attest",
                      args: [
                        cert.attest.cert,
                        BigInt(cert.attest.tbsStart),
                        BigInt(cert.attest.tbsLen),
                        BigInt(cert.attest.pkOffset),
                        cert.attest.r,
                        cert.attest.s,
                      ],
                    })
                  }
                >
                  {isMining ? "Sending…" : "Attest this chip"}
                </button>
              )}
            </div>
          )}
        </div>
      </details>
    </div>
  );
};

export default Home;
