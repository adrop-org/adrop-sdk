import { describe, expect, it } from "vitest";
import { Keypair, PublicKey, SystemProgram, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import { getTransactionDecoder } from "@solana/kit";
import nacl from "tweetnacl";
import { kitSignerFromWallet } from "./campaigns.js";
import { Adrop } from "./index.js";

const kp = Keypair.generate();
const wallet = { publicKey: kp.publicKey, signMessage: async (m: Uint8Array) => nacl.sign.detached(m, kp.secretKey), signTransaction: async <T extends any>(tx: T) => { (tx as VersionedTransaction).sign([kp]); return tx; } };

describe("campaigns", () => {
  it("wallet-backed kit signer signs its slot of a kit transaction", async () => {
    const feePayer = Keypair.generate().publicKey;
    const msg = new TransactionMessage({ payerKey: feePayer, recentBlockhash: new PublicKey(Keypair.generate().publicKey).toBase58(), instructions: [SystemProgram.transfer({ fromPubkey: kp.publicKey, toPubkey: feePayer, lamports: 1 })] }).compileToV0Message();
    const vt = new VersionedTransaction(msg);
    const kitTx = getTransactionDecoder().decode(vt.serialize());
    const [sigs] = await kitSignerFromWallet(wallet).signTransactions([kitTx]);
    const sig = sigs[kp.publicKey.toBase58() as keyof typeof sigs]!;
    expect(nacl.sign.detached.verify(msg.serialize(), new Uint8Array(sig), kp.publicKey.toBytes())).toBe(true);
  });

  it("createCampaign posts the connected wallet as advertiser", async () => {
    const calls: any[] = [];
    const fetchFn = (async (url: string, init?: RequestInit) => { calls.push({ url, body: JSON.parse(String(init?.body)) }); return new Response(JSON.stringify({ campaign_id: 7, fund_url: `${url}/7/fund` }), { status: 201 }); }) as typeof fetch;
    const adrop = Adrop.init({ apiBase: "http://t", hostAta: "x", wallet: wallet as any, fetch: fetchFn });
    const r = await adrop.createCampaign({ price_per_view: 100_000, budget: 1_000_000, creative: { image_url: "https://x/a.png", title: "A", cta_url: "https://x" } });
    expect(r.campaign_id).toBe(7);
    expect(calls[0].body.advertiser).toBe(kp.publicKey.toBase58());
    expect(calls[0].body.tags).toBeUndefined();
  });
});
