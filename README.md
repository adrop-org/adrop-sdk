# adrop-sdk

Rewarded ads for web apps, paid in USDC on Solana. Drop the SDK into your app; your users opt in with a
wallet and a proof of personhood, watch an ad, and get paid for every qualified view. You, the host app,
earn 20% of every view served in your app. Advertisers fund campaigns over x402, so an AI agent can buy
reach without a sales call.

- Devnet demo: https://demo.adrop.sh (viewer) and https://demo.adrop.sh/advertiser
- API: https://api.adrop.sh (`GET /health`)
- Protocol, program and server: https://github.com/adrop-org/adrop

Status: hackathon build on Solana devnet. Interfaces may change before mainnet.

## How it works

1. **Opt in.** The user's wallet holds a Seeker Genesis Token (on devnet, a mock with the same layout).
   The SDK registers one identity per token on-chain. One human, one identity.
2. **Load an ad.** The SDK asks the Adrop server for a campaign whose audience includes this identity.
   Advertisers buy reach, never wallet lists: the audience is a Merkle root on the campaign.
3. **Show and claim.** The creative renders with a "Sponsored" label. When it has been at least 50% visible
   for the campaign's minimum dwell time, with the tab focused and a pointer interaction, the Claim button
   enables. The wallet signs the payout transaction, the server submits it.
4. **Paid.** The program pays from the campaign escrow: 70% to the viewer, 20% to your host account,
   10% to the protocol. One transaction, one impression account, no double pay.

## Install

```sh
npm install adrop-sdk @solana/web3.js
```
(npm publication follows the hackathon; until then build from source: `pnpm install && pnpm build`,
then use `dist/index.js` or the IIFE bundle `dist/adrop.iife.global.js`.)

## What you need

- A **host USDC account** (`hostAta`): the associated token account of your app's wallet for the USDC mint.
  20% of every view lands there. Devnet USDC mint: `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`.
- A **wallet** that can `signMessage` and `signTransaction`. Any Solana wallet adapter works.
- The Adrop server base URL (`apiBase`). Devnet: `https://api.adrop.sh`.

## Minimal integration

```ts
import { Adrop } from "adrop-sdk";

const adrop = Adrop.init({ apiBase: "https://api.adrop.sh", hostAta: HOST_USDC_ATA, wallet })
  .onReward(({ amount, tx, campaign_id }) => console.log(`paid ${amount / 1e6} USDC`, tx))
  .onError((e) => console.warn(e.code, e.message));

await adrop.optIn();                                            // once per wallet; returns { registered, has_sgt, views_today }
const ad = await adrop.loadAd();                                // null when no campaign is available right now
if (ad) await adrop.show(document.getElementById("ad-slot")!);  // resolves with the Reward once paid
```

Script tag instead of a bundler:

```html
<script src="/adrop.iife.global.js"></script>
<script>const adrop = Adrop.Adrop.init({ apiBase, hostAta, wallet });</script>
```

A complete host page with a wallet adapter lives in the demo app
(`apps/demo-web` in the main repository); `e2e/index.html` here is a bare-bones example.

## API

| Call | Does |
|---|---|
| `Adrop.init({ apiBase, hostAta, wallet, fetch? })` | creates a client; `fetch` is injectable for tests |
| `optIn()` | checks the wallet's identity; if unregistered, has the wallet sign a `register_identity` transaction and submits it |
| `loadAd(campaignId?)` | requests an ad; returns the `Ad` (creative, `min_dwell_ms`, `price_per_view` in USDC micro-units) or `null` |
| `show(container)` | renders the creative, tracks attention, enables Claim, runs the claim and returns the `Reward` |
| `claim(ad, attention)` | the claim step on its own, for custom UIs |
| `onReward(handler)`, `onError(handler)` | chainable listeners |

Errors arrive as `AdropError { code, message, status }`. Codes you will handle: `no_sgt` (the wallet holds
no proof of personhood), `no_campaign` (nothing to show now), `no_ad` (`show()` before `loadAd()`),
`attention_failed` (the view did not qualify), plus any server error.

## Rules for hosts

- The creative is always labelled **Sponsored**. Do not hide or restyle the label.
- The Claim button is disabled until the dwell and pointer checks pass. Never trigger it programmatically.
- Surface errors to the user; a failed claim is not retried silently.
- Mobile stores: Android and the Solana dApp Store allow USDC rewards (Google Play needs the financial-features
  declaration); iOS native apps may not pay users in crypto. On iOS, host Adrop in a web page or a wallet's
  in-app browser.

## Develop

```sh
pnpm install
pnpm build        # dist/index.js (ESM, types) and dist/adrop.iife.global.js
pnpm test         # vitest, jsdom
```

Apache-2.0. See `LICENSE` and `NOTICE`.
