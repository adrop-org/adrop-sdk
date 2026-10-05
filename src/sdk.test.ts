import { Keypair, Transaction, SystemProgram } from "@solana/web3.js";
import { JSDOM } from "jsdom";
import { describe, expect, it, vi } from "vitest";
import { Adrop, AdropError } from "./index.js";

// A DOM without the jsdom vitest environment: that one swaps Uint8Array realms and breaks web3.js.
const dom = new JSDOM("<!doctype html><body></body>");
Object.assign(globalThis, { window: dom.window, document: dom.window.document });
dom.window.document.hasFocus = () => true;

const viewer = Keypair.generate();
const wallet = {
  publicKey: viewer.publicKey,
  signMessage: async (m: Uint8Array) => new Uint8Array(64).fill(7),
  signTransaction: async (tx: Transaction) => { tx.partialSign(viewer); return tx; },
};
const serverTx = () => {
  const tx = new Transaction({ feePayer: viewer.publicKey, recentBlockhash: Keypair.generate().publicKey.toBase58() }).add(SystemProgram.transfer({ fromPubkey: viewer.publicKey, toPubkey: viewer.publicKey, lamports: 1 }));
  return Buffer.from(tx.serialize({ requireAllSignatures: false })).toString("base64");
};
const calls: { path: string; body: any }[] = [];
const fakeFetch = (async (url: string, init?: RequestInit) => {
  const path = url.replace("http://api", "");
  const body = init?.body ? JSON.parse(init.body as string) : undefined;
  calls.push({ path, body });
  const json = (status: number, data: unknown) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
  if (path.startsWith("/identity/") && !body) return json(200, { registered: false, has_sgt: true, sgt_mint: "m" });
  if (path === "/identity/register-tx") return json(200, { tx_base64: serverTx() });
  if (path === "/identity/submit") return json(200, { tx: "reg-tx" });
  if (path === "/impressions") return body.identity_wallet === viewer.publicKey.toBase58() ? json(201, { impression_id: "i1", nonce: "ab".repeat(32), campaign: { id: 1, creative: { image_url: "https://x/a.png", title: "Hi", cta_url: "https://x" }, min_dwell_ms: 1000, price_per_view: 100_000 }, expires_at: 0 }) : json(404, { error: "no_campaign" });
  if (path === "/claims") return body.nonce === "n" ? json(500, { error: "boom" }) : json(200, { claim_id: "c1", tx_base64: serverTx() });
  if (path === "/claims/c1/submit") return json(200, { tx: "pay-tx" });
  return json(500, { error: "boom" });
}) as unknown as typeof fetch;

describe("Adrop SDK", () => {
  it("optIn registers when the wallet has an SGT but no identity", async () => {
    const adrop = Adrop.init({ apiBase: "http://api", hostAta: "h", wallet, fetch: fakeFetch });
    await adrop.optIn();
    expect(calls.map((c) => c.path)).toEqual([`/identity/${viewer.publicKey.toBase58()}`, "/identity/register-tx", "/identity/submit", `/identity/${viewer.publicKey.toBase58()}`]);
    expect(Buffer.from(calls[2].body.signed_tx_base64, "base64").length).toBeGreaterThan(64);
  });

  it("show(): Sponsored label, Claim disabled until dwell + pointer, then claims and rewards", async () => {
    vi.useFakeTimers();
    let t = 0; const now = () => t;
    const adrop = Adrop.init({ apiBase: "http://api", hostAta: "h", wallet, fetch: fakeFetch });
    const rewards: unknown[] = []; adrop.onReward((r) => rewards.push(r));
    const ad = await adrop.loadAd();
    expect(ad?.campaign.id).toBe(1);
    const container = document.createElement("div"); document.body.appendChild(container);
    const done = adrop.show(container, { now, sampleMs: 100 });
    expect(container.textContent).toContain("Sponsored");
    const btn = container.querySelector<HTMLButtonElement>(".adrop-claim")!;
    t = 500; vi.advanceTimersByTime(100);
    expect(btn.disabled).toBe(true);
    t = 1200; vi.advanceTimersByTime(100);
    expect(btn.disabled).toBe(true); // dwell met, no pointer
    container.querySelector(".adrop-ad")!.dispatchEvent(new dom.window.Event("pointerdown"));
    vi.advanceTimersByTime(100);
    expect(btn.disabled).toBe(false);
    btn.click();
    vi.useRealTimers();
    const reward = await done;
    expect(reward).toEqual({ amount: 70_000, tx: "pay-tx", campaign_id: 1 });
    expect(rewards).toHaveLength(1);
    const claim = calls.find((c) => c.path === "/claims")!.body;
    expect(claim.attention).toMatchObject({ visible_ms: 1200, focused: true, pointer_event_ts: 1200 });
    expect(claim.wallet_signature_of_nonce).toBe(Buffer.alloc(64, 7).toString("base64"));
  });

  it("loadAd returns null without a campaign and surfaces other errors to onError", async () => {
    const other = Adrop.init({ apiBase: "http://api", hostAta: "h", wallet: { ...wallet, publicKey: Keypair.generate().publicKey }, fetch: fakeFetch });
    expect(await other.loadAd()).toBeNull();
    const errors: AdropError[] = []; other.onError((e) => errors.push(e));
    await expect(other.claim({ impression_id: "x", nonce: "n", campaign: { id: 9, creative: { image_url: "", title: "", cta_url: "" }, min_dwell_ms: 0, price_per_view: 1 }, expires_at: 0 }, { visible_ms: 0, max_visibility: 0, focused: true, pointer_event_ts: 1, scroll_before_click: false })).rejects.toBeInstanceOf(AdropError);
    expect(errors[0].code).toBe("boom");
  });
});
