"use client";

import { Address } from "@scaffold-ui/components";
import type { NextPage } from "next";
import { Farm } from "~~/components/Farm";
import deployedContracts from "~~/contracts/deployedContracts";

const CROPS = deployedContracts[1].Crops.address;

const Home: NextPage = () => (
  <div className="flex flex-col items-center grow pt-10 px-5 gap-8 max-w-3xl mx-auto w-full">
    <div className="text-center">
      <h1 className="text-4xl font-bold">🌽 Crops</h1>
      <p className="mt-3">
        A real Infineon Trust M chip grows a field of five crops. Every five hours it can harvest: press <b>A</b> on the
        device, the chip signs, and 5 CROPS land in the connected wallet on Ethereum mainnet.
      </p>
      <div className="flex justify-center items-center gap-2 mt-2 text-sm">
        <span>Contract:</span>
        <Address address={CROPS} />
      </div>
    </div>
    <Farm />
  </div>
);

export default Home;
