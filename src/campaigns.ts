// Advertiser side of the SDK: create a campaign and fund it over x402 with the connected wallet.
// The same two calls serve a self-serve page, an app that sold its own inventory, or a script.
import { VersionedTransaction, type PublicKey, type Transaction } from "@solana/web3.js";
import { address, getTransactionEncoder, type SignatureDictionary, type TransactionPartialSigner } from "@solana/kit";
import { wrapFetchWithPaymentFromConfig } from "@x402/fetch";
import { ExactSvmScheme } from "@x402/svm/exact/client";

export const X402_NETWORK_DEVNET = "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1";

export type CampaignWallet = { publicKey: PublicKey; signTransaction<T extends Transaction | VersionedTransaction>(tx: T): Promise<T> };
export type CampaignInput = {
  advertiser?: string;            // defaults to the connected wallet; receives unspent budget
  tags?: string[];                // [] = untargeted: every registered identity
  price_per_view: number;         // USDC micro-units
  budget: number;                 // USDC micro-units, paid over x402 on fund
  freq_cap?: number;
  min_dwell_ms?: number;
  creative: { image_url: string; title: string; cta_url: string };
  test_wallets?: string[];        // devnet demo only
};
export type CampaignCreated = { campaign_id: number; escrow_ata: string; segment_root: string; reachable: number; create_tx: string; fund_url: string };
export type CampaignFunded = { status: "active"; campaign_id: number; settle_tx: string; activate_tx: string; payer: string };
export type CampaignStatus = { id: number; status: string; budget: number; spent: number; reachable: number; price_per_view: number };

/** A @solana/kit partial signer backed by a browser wallet: the x402 client builds the payment tx, the wallet signs its slot. */
export function kitSignerFromWallet(wallet: CampaignWallet): TransactionPartialSigner {
  const addr = address(wallet.publicKey.toBase58());
  return {
    address: addr,
    signTransactions: async (txs) => Promise.all(txs.map(async (tx) => {
      const vt = VersionedTransaction.deserialize(new Uint8Array(getTransactionEncoder().encode(tx)));
      const signed = await wallet.signTransaction(vt);
      const i = signed.message.staticAccountKeys.findIndex((k) => k.equals(wallet.publicKey));
      if (i < 0) throw new Error("wallet is not a signer of the payment transaction");
      return { [addr]: signed.signatures[i] } as SignatureDictionary;
    })),
  };
}

/** fetch that pays a 402 with the wallet (x402 exact, SVM). */
export function paidFetch(wallet: CampaignWallet, fetchFn: typeof fetch, opts: { network?: string; rpcUrl?: string } = {}) {
  const client = new ExactSvmScheme(kitSignerFromWallet(wallet), opts.rpcUrl ? { rpcUrl: opts.rpcUrl } : undefined);
  // The wallet prompt is the spend control: the budget is what the advertiser typed. Without this the client
  // refuses anything above $1 ("rejected by spendControls.maxAmountPerPayment").
  return wrapFetchWithPaymentFromConfig(fetchFn, { schemes: [{ network: (opts.network ?? X402_NETWORK_DEVNET) as `${string}:${string}`, client }], spendControls: false });
}
