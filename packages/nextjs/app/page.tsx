"use client";

import { useState } from "react";
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

const Home: NextPage = () => {
  const [sigText, setSigText] = useState("");
  const [certText, setCertText] = useState("");
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

  return (
    <div className="flex flex-col items-center grow pt-10 px-5 gap-8 max-w-3xl mx-auto w-full">
      <div className="text-center">
        <h1 className="text-4xl font-bold">Trust M attestation</h1>
        <p className="mt-3">
          An Infineon OPTIGA Trust M chip signs with a key that never leaves it. Infineon signed a certificate for that
          key at the factory. This contract holds Infineon&apos;s CA public key, checks the certificate, and then
          vouches for every signature the chip makes. A signature that passes here came from real silicon, not software.
        </p>
        <div className="flex justify-center items-center gap-2 mt-2">
          <span>Contract:</span>
          <Address address={contract?.address} />
        </div>
      </div>

      <section className="card bg-base-100 shadow w-full">
        <div className="card-body">
          <h2 className="card-title">1. Verify a chip signature</h2>
          <p className="m-0 text-sm">
            Run <code>tools/chip.py sign &quot;hello&quot;</code> with the Pico plugged in and paste the JSON here.
          </p>
          <textarea
            className="textarea textarea-bordered font-mono text-xs h-40"
            placeholder='{"message":"hello","hash":"0x..","r":"0x..","s":"0x..","chipX":"0x..","chipY":"0x.."}'
            value={sigText}
            onChange={e => setSigText(e.target.value)}
          />
          {sigText && !sig && <div className="text-error text-sm">not valid JSON</div>}
          {sig && (
            <div className="mt-2">
              {isFetching ? (
                <span className="loading loading-spinner" />
              ) : verdict ? (
                <div className="alert alert-success">
                  Signed by a real Infineon Trust M. Message: &quot;{sig.message}&quot;
                </div>
              ) : sigKeyAttested === false ? (
                <div className="alert alert-warning">
                  This key is not attested yet. Attest its certificate below first.
                </div>
              ) : (
                <div className="alert alert-error">Not a valid signature from this chip.</div>
              )}
            </div>
          )}
        </div>
      </section>

      <section className="card bg-base-100 shadow w-full">
        <div className="card-body">
          <h2 className="card-title">2. Attest a chip (once per chip)</h2>
          <p className="m-0 text-sm">
            Run <code>tools/chip.py cert</code>, paste the JSON, and send the transaction. The contract checks that
            Infineon&apos;s CA signed the certificate and records the chip&apos;s public key.
          </p>
          <textarea
            className="textarea textarea-bordered font-mono text-xs h-40"
            placeholder='{"issuer":"...","chipX":"0x..","chipY":"0x..","attest":{"cert":"0x..","tbsStart":4,"tbsLen":386,"pkOffset":209,"r":"0x..","s":"0x.."}}'
            value={certText}
            onChange={e => setCertText(e.target.value)}
          />
          {certText && !cert && <div className="text-error text-sm">not valid JSON</div>}
          {cert && (
            <div className="mt-2 flex flex-col gap-2">
              <div className="text-sm">
                Issuer: {cert.issuer ?? "?"}
                <br />
                Key: {cert.chipX.slice(0, 10)}… / {cert.chipY.slice(0, 10)}…
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
      </section>
    </div>
  );
};

export default Home;
