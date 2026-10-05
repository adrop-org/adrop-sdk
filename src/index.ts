import { Transaction, type PublicKey } from "@solana/web3.js";
import { AttentionTracker, type Attention } from "./attention.js";
export { AttentionTracker, type Attention };

export type AdropWallet = {
  publicKey: PublicKey;
  signMessage(message: Uint8Array): Promise<Uint8Array>;
  signTransaction(tx: Transaction): Promise<Transaction>;
};
export type AdropConfig = { apiBase: string; hostAta: string; wallet: AdropWallet; fetch?: typeof fetch };
export type Ad = { impression_id: string; nonce: string; campaign: { id: number; creative: { image_url: string; title: string; cta_url: string }; min_dwell_ms: number; price_per_view: number }; expires_at: number };
export type Reward = { amount: number; tx: string; campaign_id: number };
export type IdentityStatus = { registered: boolean; has_sgt: boolean; sgt_mint?: string; views_today?: number };

export class AdropError extends Error {
  constructor(readonly code: string, message: string, readonly status?: number) { super(message); }
}

const b64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));

export class Adrop {
  private rewardHandlers: ((r: Reward) => void)[] = [];
  private errorHandlers: ((e: AdropError) => void)[] = [];
  private ad: Ad | null = null;
  private readonly fetchFn: typeof fetch;

  private constructor(private readonly cfg: AdropConfig) { this.fetchFn = cfg.fetch ?? fetch.bind(globalThis); }
  static init(cfg: AdropConfig) { return new Adrop(cfg); }

  onReward(h: (r: Reward) => void) { this.rewardHandlers.push(h); return this; }
  onError(h: (e: AdropError) => void) { this.errorHandlers.push(h); return this; }
  private fail(e: unknown): never {
    const err = e instanceof AdropError ? e : new AdropError("network", e instanceof Error ? e.message : String(e));
    this.errorHandlers.forEach((h) => h(err));
    throw err;
  }
  private async api<T>(path: string, body?: unknown): Promise<T> {
    const res = await this.fetchFn(`${this.cfg.apiBase}${path}`, body === undefined ? {} : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const json = (await res.json().catch(() => ({}))) as any;
    if (!res.ok) throw new AdropError(json.error ?? `http_${res.status}`, json.message ?? `${path} failed (${res.status})`, res.status);
    return json as T;
  }

  /** GET /identity; if the wallet holds an SGT but no identity, registers it (wallet signs, server submits). */
  async optIn(): Promise<IdentityStatus> {
    try {
      const wallet = this.cfg.wallet.publicKey.toBase58();
      const status = await this.api<IdentityStatus>(`/identity/${wallet}`);
      if (status.registered) return status;
      if (!status.has_sgt) throw new AdropError("no_sgt", "This wallet holds no Seeker Genesis Token");
      const { tx_base64 } = await this.api<{ tx_base64: string }>("/identity/register-tx", { wallet });
      const signed = await this.cfg.wallet.signTransaction(Transaction.from(Uint8Array.from(atob(tx_base64), (c) => c.charCodeAt(0))));
      await this.api("/identity/submit", { signed_tx_base64: b64(signed.serialize()) });
      return this.api<IdentityStatus>(`/identity/${wallet}`);
    } catch (e) { this.fail(e); }
  }

  /** POST /impressions. Returns null when no campaign is available for this identity. */
  async loadAd(campaignId?: number): Promise<Ad | null> {
    try {
      this.ad = await this.api<Ad>("/impressions", { identity_wallet: this.cfg.wallet.publicKey.toBase58(), host_ata: this.cfg.hostAta, campaign_id: campaignId });
      return this.ad;
    } catch (e) {
      if (e instanceof AdropError && e.code === "no_campaign") return (this.ad = null);
      this.fail(e);
    }
  }

  /** Renders the creative with the "Sponsored" label and a Claim button enabled only after dwell + pointer. Resolves when the view is paid. */
  show(container: HTMLElement, opts: { now?: () => number; sampleMs?: number } = {}): Promise<Reward> {
    const ad = this.ad;
    if (!ad) return Promise.reject(new AdropError("no_ad", "call loadAd() first"));
    const now = opts.now ?? Date.now;
    const tracker = new AttentionTracker();
    container.innerHTML = "";
    const root = document.createElement("div");
    root.className = "adrop-ad";
    root.innerHTML = `<div class="adrop-sponsored">Sponsored</div><a class="adrop-creative" href="${ad.campaign.creative.cta_url}" target="_blank" rel="noopener sponsored"><img src="${ad.campaign.creative.image_url}" alt=""><div class="adrop-title"></div></a><button class="adrop-claim" type="button" disabled></button>`;
    root.querySelector(".adrop-title")!.textContent = ad.campaign.creative.title;
    const btn = root.querySelector<HTMLButtonElement>(".adrop-claim")!;
    const price = (ad.campaign.price_per_view / 1e6).toFixed(2);
    container.appendChild(root);

    const io = typeof IntersectionObserver !== "undefined"
      ? new IntersectionObserver((es) => es.forEach((e) => tracker.onVisibility(e.intersectionRatio, now())), { threshold: [0, 0.25, 0.5, 0.75, 1] })
      : null;
    io?.observe(root);
    if (!io) tracker.onVisibility(1, now());
    tracker.onFocus(document.hasFocus(), now());
    const onFocus = () => tracker.onFocus(true, now());
    const onBlur = () => tracker.onFocus(false, now());
    const onPointer = () => tracker.onPointer(now());
    const onScroll = () => tracker.onScroll();
    window.addEventListener("focus", onFocus); window.addEventListener("blur", onBlur);
    root.addEventListener("pointerdown", onPointer); root.addEventListener("pointermove", onPointer);
    window.addEventListener("scroll", onScroll, { passive: true });

    const tick = setInterval(() => {
      const left = Math.max(0, ad.campaign.min_dwell_ms - tracker.dwellMs(now()));
      btn.disabled = !tracker.canClaim(ad.campaign.min_dwell_ms, now());
      btn.textContent = left > 0 ? `Claim $${price} in ${Math.ceil(left / 1000)}s` : tracker.pointerTs0() ? `Claim $${price}` : `Move the pointer here to claim $${price}`;
    }, opts.sampleMs ?? 250);

    const cleanup = () => {
      clearInterval(tick); io?.disconnect();
      window.removeEventListener("focus", onFocus); window.removeEventListener("blur", onBlur); window.removeEventListener("scroll", onScroll);
    };

    return new Promise<Reward>((resolve, reject) => {
      btn.addEventListener("click", async () => {
        if (btn.disabled) return;
        btn.disabled = true; btn.textContent = "Claiming…";
        try {
          const reward = await this.claim(ad, tracker.snapshot(now()));
          btn.textContent = `Paid $${price}`;
          cleanup(); resolve(reward);
        } catch (e) {
          btn.textContent = "Claim failed"; cleanup();
          reject(e);
        }
      });
    });
  }

  /** POST /claims → wallet signs the pay_view tx → POST /claims/:id/submit. */
  async claim(ad: Ad, attention: Attention): Promise<Reward> {
    try {
      const sig = await this.cfg.wallet.signMessage(new TextEncoder().encode(ad.nonce));
      const { claim_id, tx_base64 } = await this.api<{ claim_id: string; tx_base64: string }>("/claims", { impression_id: ad.impression_id, nonce: ad.nonce, attention, wallet_signature_of_nonce: b64(sig) });
      const signed = await this.cfg.wallet.signTransaction(Transaction.from(Uint8Array.from(atob(tx_base64), (c) => c.charCodeAt(0))));
      const { tx } = await this.api<{ tx: string }>(`/claims/${claim_id}/submit`, { signed_tx_base64: b64(signed.serialize({ requireAllSignatures: true })) });
      const reward = { amount: Math.floor(ad.campaign.price_per_view * 0.7), tx, campaign_id: ad.campaign.id };
      this.rewardHandlers.forEach((h) => h(reward));
      return reward;
    } catch (e) { this.fail(e); }
  }
}
