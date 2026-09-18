# CROPS: plan

A real Trust M chip can harvest 5 CROPS every 5 hours. Crops grow on the device screen. Press A when they are
full, the chip signs a harvest, a relayer sends it, the contract checks the chip and the clock, mints 5 CROPS.

## Contract: `Crops.sol` (ERC-20, 18 decimals, symbol CROPS)

```
harvest(bytes32 x, bytes32 y, address to, uint256 deadline, bytes32 r, bytes32 s)
```

Checks, in order:

1. `attest.attested(keyIdOf(x, y))` on the existing TrustMAttest at `0xC868…AB99`. Only real chips.
2. `block.timestamp <= deadline`.
3. `block.timestamp >= lastHarvest[keyId] + 5 hours`.
4. `P256.verify(digest, r, lowS(s), x, y)` where
   `digest = keccak256(abi.encode(DOMAIN, block.chainid, address(this), keyId, to, deadline, nonce[keyId]))`
   and `DOMAIN = keccak256("CROPS.harvest.v1")`.
   Namespaced and bound to this exact contract on this exact chain: the same bytes signed for any other
   contract, chain, or purpose verify as nothing here, and a harvest signature cannot be replayed anywhere else.

Then `nonce++`, `lastHarvest = now`, `_mint(to, 5e18)`, `emit Harvest(keyId, to, n)`.

Nonce makes each signature one-time. Deadline stops a relayer from sitting on one. The cooldown is per chip
key, not per address, so one chip cannot farm with many addresses. Anyone can call `harvest`; the caller pays
gas, the chip's signature decides who gets the tokens.

Views for the UI: `nextHarvest(keyId)`, `nonce(keyId)`, `balanceOf(to)`.

Tests: Foundry's `vm.signP256` gives us a P-256 key we control. Crops takes the attest contract as an
interface, so tests use a stub that says the test key is attested. Cases: happy path, second harvest inside 5 h
reverts, after 5 h works, replay reverts on nonce, past deadline reverts, wrong `to` in the digest reverts,
unattested key reverts.

Stays on mainnet next to the attest contract. About 90k gas per harvest. Base would be cheaper; say so if you
want it there instead (then TrustMAttest is redeployed there too and the chip re-attested).

## Relayer

The laptop app (the same `yarn start` that runs the queue) sends the `harvest` tx from a throwaway key in
`packages/nextjs/.env.local` as `RELAYER_PRIVATE_KEY`, funded with a little ETH. Gitignored, never printed,
never committed. If the key is missing, the page falls back to "send with your wallet" through RainbowKit.

## Device (`firmware/farm.py`, replaces `agent.py` as the boot loop)

- Polls `/api/farm` every 30 s: `lastHarvest`, `nextHarvest`, `nonce`, `to`, CROPS balance.
- Draws a plot of 5 plants. Stage from `(now - lastHarvest) / 5 h`: dirt, sprout, leaves, bud, full. Full at 5 h
  (you said 4 h to full; 5 h keeps one clock, easy to change to 4 h with a 1 h "ripe" wait).
- Top bar: `CROPS 15` balance. Bottom: countdown, or `A  HARVEST` when ready.
- Press A: the device builds the digest itself (keccak on the Pico, `keccak.py` is already on the board) from
  fields it shows: `to` (short), deadline (now + 1 h), nonce. Signs with E0F0. Posts `{r, s, x, y, to, deadline,
  nonce}` to `/api/harvest`. Shows SENDING, then HARVESTED +5 CROPS with the tx hash short, plants reset.
- The sign-anything flow from today stays: `/api/sign` requests still show up and work the same way.

## Page

- Farm card: same 5 plants, growing, same clock. CROPS balance of `to`. Countdown. Harvest history from
  `Harvest` events (chip key short, when, tx link).
- `to` address: an `AddressInput` on the page, saved by the queue, shown on the device before signing.
- Harvest button on the page too: posts a harvest request, the device shows it, you press A.
- The sign-anything card moves below the farm.

## Steps

1. `Crops.sol` + tests. Deploy to mainnet (which deployer?), verify, `deployedContracts.ts`.
2. Queue: `/api/farm` (chain reads), `/api/harvest` (accept the signed harvest, relay it, store the receipt).
3. `farm.py` on the device, growth screens, harvest flow. Test with a real press.
4. Page: farm card, `to` input, history.
5. README, SKILL.

## Decisions needed

- Deployer keystore for mainnet.
- `to` address to start with.
- OK to fund a fresh relayer key on the laptop with ~0.02 ETH, or wallet-in-browser only?
- Keep TrustMAttest at `0xC868…AB99` (recommended, chip already attested) or redeploy the hardcoded version and
  re-attest.
