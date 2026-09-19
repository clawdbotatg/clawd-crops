# clawd-crops

A real chip grows crops. Every five hours it can harvest five of them.

The chip is an Infineon OPTIGA Trust M on an [Adafruit breakout](https://www.adafruit.com/product/4351), on a
Raspberry Pi Pico W with a [Waveshare Pico-LCD-1.3](https://www.waveshare.com/wiki/Pico-LCD-1.3) hat. Its key
never leaves the silicon, and Infineon signed a certificate for it at the factory. A contract on Ethereum
mainnet has checked that certificate ([clawd-trust-m](https://github.com/clawdbotatg/clawd-trust-m) is the
sign-and-prove version of this project). `Crops.sol` trusts that registry and mints **5 CROPS to whoever the
chip says, once every 5 hours per chip**.

Live on mainnet: Crops [`0x3eA4e9306a0d0B4da674C965CBB4AD4a37afc6e2`](https://etherscan.io/address/0x3eA4e9306a0d0B4da674C965CBB4AD4a37afc6e2#code),
TrustMAttest [`0xA2b53f0c5c700E42020d91a1c0E481389dA1E197`](https://etherscan.io/address/0xA2b53f0c5c700E42020d91a1c0E481389dA1E197#code),
both verified.

## What you see

The hat shows a field of five plants. They grow from dirt to full corn over the five hours since the chip's
last harvest, on the contract's clock, not the device's. When they are full the screen says `A  HARVEST 5 CROPS`.

Press **A**. The hat shows `HARVEST 5 CROPS to 0x…` (the wallet connected on the page). Press **A** again to
sign. Your wallet pops up with the `harvest` transaction. Confirm it. The hat shows `HARVESTED +5 CROPS`, the
field resets to seeds, and the page shows your balance and the harvest in the history.

The page has the same field, a **Harvest 5 CROPS** button that does the same thing starting from the browser,
and a "sign anything" card from the trust-m project.

## How the contract decides

```
harvest(x, y, to, deadline, r, s)
  1. TrustMAttest.attested(keyId(x, y))           real Infineon silicon only
  2. block.timestamp <= deadline
  3. block.timestamp >= lastHarvest[keyId] + 5 h  per chip, not per wallet
  4. P256.verify(digest, r, s, x, y) where
     digest = keccak256(abi.encode(DOMAIN, chainid, address(this), keyId, to, deadline, nonce[keyId]))
     DOMAIN = keccak256("CROPS.harvest.v1")
  then nonce++, lastHarvest = now, mint 5 CROPS to `to`
```

`to` is inside what the chip signs, so anyone may send the transaction and the tokens still go where the chip
said: a front-runner who copies the calldata pays gas for your harvest, one who swaps `to` fails the signature.
`nonce` makes every signature one-time. `deadline` stops anyone sitting on one. Chain id and contract address
in the digest mean a signature is worthless anywhere else.

The device does not trust a digest from the network. It rebuilds the digest itself, on the Pico
(`firmware/keccak.py`), from the fields it shows you, and signs that.

Tests: `packages/foundry/test/Crops.t.sol`. Foundry's `vm.signP256` plays the chip. Cooldown, replay, deadline,
front-running, unattested key, another deployment, high-s.

## Run it

```
yarn install && yarn start        # the page + the queue the device polls, on a laptop the Pico can reach
```

On the Pico: MicroPython, then `secrets.py` with `WIFI_SSID`, `WIFI_PASS` and
`TRUSTM_RELAY = "http://<laptop ip>:3000"`, then `tools/flash.sh` (copies `firmware/*.py` and resets; any bare
`mpremote` command stops the running agent until a reset, so always use the script). `main.py` runs `agent.py`. Wire
the Trust M to GP4 (SDA) / GP5 (SCL), 3V3, GND; the hat takes the rest of the pins.

Open `http://<laptop ip>:3000` (a phone on the same WiFi works), connect the wallet that should get the CROPS,
and press A on the hat when the field is full.

To attest a new chip first, or to try the plain sign-and-prove demo, see
[clawd-trust-m](https://github.com/clawdbotatg/clawd-trust-m); the tools are the same (`tools/chip.py`).

The hosted page at [clawd-trust-m.vercel.app](https://clawd-trust-m.vercel.app) is the trust-m one. Vercel has
no device queue unless you give it `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` (`utils/signQueue.ts`).

Setup: `ALCHEMY_API_KEY` in `packages/foundry/.env`, `NEXT_PUBLIC_ALCHEMY_API_KEY` in `packages/nextjs/.env.local`.
Deploy elsewhere with `yarn deploy --network <chain>`; `script/Deploy.s.sol` deploys TrustMAttest and Crops together.

## Layout

```
packages/foundry/contracts/Crops.sol          the token; harvest() checks chip, clock, signature
packages/foundry/contracts/TrustMAttest.sol   the chip registry (Infineon CA 101 key hardcoded)
packages/foundry/test/Crops.t.sol             9 cases
packages/nextjs/components/Farm.tsx           the field on the page: balance, growth, harvest, history
packages/nextjs/app/api/sign/                 the queue the device polls; harvest requests carry to/deadline/nonce
packages/nextjs/app/api/farm/                 the contract's clock for a chip, for the device and the page
firmware/agent.py                             boot loop: WiFi, poll, draw the field, harvest or sign on A
firmware/farm.py                              the field screens
firmware/keccak.py                            keccak256 on the Pico
firmware/ui.py, lcd.py, trustm.py             screens, the hat, the chip
tools/chip.py                                 host side: ui, sign, cert, uid
docs/CROPS-PLAN.md                            the plan this was built from
```

Built with [Scaffold-ETH 2](https://scaffoldeth.io). MIT.
