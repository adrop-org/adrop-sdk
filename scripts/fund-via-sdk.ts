// Checks the SDK's advertiser path end to end with a keypair wallet: createCampaign + fundCampaign (x402 paid by the wallet).
// Usage: X402_DEMO_SECRET='[...]' pnpm --filter adrop-sdk exec tsx scripts/fund-via-sdk.ts [serverUrl]
import { Keypair, Transaction, VersionedTransaction } from "@solana/web3.js";
import nacl from "tweetnacl";
import { Adrop } from "../src/index.js";

const [base = "http://localhost:3000"] = process.argv.slice(2);
const kp = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(process.env.X402_DEMO_SECRET!)));
const wallet = {
  publicKey: kp.publicKey,
  signMessage: async (m: Uint8Array) => nacl.sign.detached(m, kp.secretKey),
  signTransaction: async <T extends Transaction | VersionedTransaction>(tx: T) => { if (tx instanceof VersionedTransaction) tx.sign([kp]); else tx.partialSign(kp); return tx; },
};
const adrop = Adrop.init({ apiBase: base, hostAta: "GYs2Ucn7MDE27VBiN4PU2MHZfVmM24ivD2FaJVX7RoyE", wallet, rpcUrl: process.env.RPC_URL });
const created = await adrop.createCampaign({ tags: ["dex_swap_30d"], price_per_view: 100_000, budget: 1_000_000, freq_cap: Number(process.env.FREQ_CAP ?? 1), creative: { image_url: "https://placehold.co/600x400/png", title: "Funded via SDK", cta_url: "https://adrop.sh" } });
console.log("created", created.campaign_id, "reach", created.reachable);
const t0 = Date.now();
const funded = await adrop.fundCampaign(created.campaign_id);
console.log("funded", funded.status, funded.settle_tx, `${Date.now() - t0}ms`);
console.log("campaign", await adrop.getCampaign(created.campaign_id));
