// Headless T13 page: the SDK as a host app would use it, with an in-page keypair wallet (test only).
import { Keypair, Transaction } from "@solana/web3.js";
import { Adrop } from "../src/index.js";
import nacl from "tweetnacl";

declare global { interface Window { __adrop: { apiBase: string; hostAta: string; secret: number[] }; __result: unknown } }

const { apiBase, hostAta, secret } = window.__adrop;
const kp = Keypair.fromSecretKey(Uint8Array.from(secret));
const wallet = {
  publicKey: kp.publicKey,
  signMessage: async (m: Uint8Array) => nacl.sign.detached(m, kp.secretKey),
  signTransaction: async (tx: Transaction) => { tx.partialSign(kp); return tx; },
};
const log = (m: string) => { document.getElementById("log")!.textContent += m + "\n"; };
const adrop = Adrop.init({ apiBase, hostAta, wallet }).onError((e) => log(`error ${e.code}: ${e.message}`));
(async () => {
  log(`identity ${JSON.stringify(await adrop.optIn())}`);
  const ad = await adrop.loadAd();
  log(`ad ${ad ? ad.campaign.id : "none"}`);
  if (!ad) { window.__result = { error: "no_campaign" }; return; }
  adrop.show(document.getElementById("slot")!).then((r) => { log(`reward ${JSON.stringify(r)}`); window.__result = r; }, (e) => { window.__result = { error: String(e) }; });
})();
