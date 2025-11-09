import express from "express";
import { createAuthenticatedClient, createUnauthenticatedClient } from "@interledger/open-payments";
import { success, error } from "../utils/response.js";
import { readFileSync } from "fs";

const router = express.Router();

const WALLETS_BY_ASSET = {
  USD: "https://ilp.interledger-test.dev/usd_25",
  EUR: "https://ilp.interledger-test.dev/eur_25",
  MXN: "https://ilp.interledger-test.dev/mx_25",
  EGG: "https://ilp.interledger-test.dev/eg25",
  PEB: "https://ilp.interledger-test.dev/peb_25",
  PKR: "https://ilp.interledger-test.dev/pkr_25",
};

const DEFAULT_MAJOR_AMOUNT = 100;

async function opClient() {
  const { OP_CLIENT_KEY_ID, OP_PRIVATE_KEY_PEM, OP_PLATFORM_WALLET_ADDRESS, KEY_ID, PRIVATE_KEY_PATH, WALLET_ADDRESS_URL } = process.env;
  if (OP_CLIENT_KEY_ID && OP_PRIVATE_KEY_PEM && OP_PLATFORM_WALLET_ADDRESS) {
    return await createAuthenticatedClient({ keyId: OP_CLIENT_KEY_ID, privateKey: OP_PRIVATE_KEY_PEM, walletAddressUrl: OP_PLATFORM_WALLET_ADDRESS });
  }
  if (KEY_ID && PRIVATE_KEY_PATH && WALLET_ADDRESS_URL) {
    const pem = readFileSync(PRIVATE_KEY_PATH, "utf8");
    return await createAuthenticatedClient({ keyId: KEY_ID, privateKey: pem, walletAddressUrl: WALLET_ADDRESS_URL });
  }
  throw new Error("Open Payments credentials not configured");
}

async function opAnon() {
  return await createUnauthenticatedClient({});
}

const ISO_MAP = { USDT: "USD", USD: "USD", EUR: "EUR", MXN: "MXN" };

function normCode(ccy) {
  if (!ccy) return undefined;
  const up = String(ccy).toUpperCase();
  return ISO_MAP[up] ?? up;
}

async function fetchWithTimeout(url, ms = 4000) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { signal: ctrl.signal });
  } finally {
    clearTimeout(id);
  }
}

async function getMarketRate(from, to) {
  const f = normCode(from);
  const t = normCode(to);
  if (!f || !t) throw new Error("invalid-currency");
  if (f === t) return 1.0;
  try {
    const r = await fetchWithTimeout(`https://api.exchangerate.host/convert?from=${encodeURIComponent(f)}&to=${encodeURIComponent(t)}`);
    if (r.ok) {
      const j = await r.json();
      const val = Number(j?.result);
      if (Number.isFinite(val) && val > 0) return val;
    }
  } catch {}
  try {
    const r = await fetchWithTimeout(`https://api.frankfurter.app/latest?from=${encodeURIComponent(f)}&to=${encodeURIComponent(t)}`);
    if (r.ok) {
      const j = await r.json();
      const val = Number(j?.rates?.[t]);
      if (Number.isFinite(val) && val > 0) return val;
    }
  } catch {}
  try {
    const r = await fetchWithTimeout(`https://open.er-api.com/v6/latest/${encodeURIComponent(f)}`);
    if (r.ok) {
      const j = await r.json();
      const val = Number(j?.rates?.[t]);
      if (Number.isFinite(val) && val > 0) return val;
    }
  } catch {}
  throw new Error("market-rate-unavailable");
}

router.post("/compare", async (req, res) => {
  try {
    const body = req.body || {};
    const from = String(body?.from || "").toUpperCase();
    const to = String(body?.to || "").toUpperCase();
    if (!from || !to) return error(res, "from y to son requeridos (ej: USD, EUR, MXN)", 400);
    const payerAddress = WALLETS_BY_ASSET[from];
    const receiverAddress = WALLETS_BY_ASSET[to];
    if (!payerAddress || !receiverAddress) {
      return error(res, JSON.stringify({ supported: Object.keys(WALLETS_BY_ASSET) }), 400);
    }
    const anon = await opAnon();
    const [payerWA, receiverWA] = await Promise.all([
      anon.walletAddress.get({ url: payerAddress }),
      anon.walletAddress.get({ url: receiverAddress }),
    ]);
    const client = await opClient();
    const incomingGrant = await client.grant.request({ url: receiverWA.authServer }, { access_token: { access: [{ type: "incoming-payment", actions: ["create"] }] } });
    const incoming = await client.incomingPayment.create({ url: receiverWA.resourceServer, accessToken: incomingGrant.access_token.value }, { walletAddress: receiverWA.id });
    const quoteGrant = await client.grant.request({ url: payerWA.authServer }, { access_token: { access: [{ type: "quote", actions: ["create"] }] } });
    const scalePow = BigInt(10) ** BigInt(payerWA.assetScale);
    const sendAmountMinor = BigInt(DEFAULT_MAJOR_AMOUNT) * scalePow;
    const quote = await client.quote.create({ url: payerWA.resourceServer, accessToken: quoteGrant.access_token.value }, { walletAddress: payerWA.id, receiver: incoming.id, method: "ilp", debitAmount: { value: sendAmountMinor.toString(), assetCode: payerWA.assetCode, assetScale: payerWA.assetScale } });
    const debit = Number(quote.debitAmount.value) / 10 ** quote.debitAmount.assetScale;
    const receive = Number(quote.receiveAmount.value) / 10 ** quote.receiveAmount.assetScale;
    const ilpRate = debit > 0 ? receive / debit : null;
    let marketRate;
    try {
      marketRate = await getMarketRate(from, to);
    } catch {
      return success(res, { from, to, sendMajor: DEFAULT_MAJOR_AMOUNT, sendMinor: sendAmountMinor.toString(), ilp: { rate: ilpRate, debitAmount: quote.debitAmount, receiveAmount: quote.receiveAmount, quoteId: quote.id }, market: { rate: null, source: null, error: "market-rate-unavailable" }, deltaPct: null }, "FX compare");
    }
    const deltaPct = marketRate && ilpRate ? ((ilpRate - marketRate) / marketRate) * 100 : null;
    return success(res, { from, to, sendMajor: DEFAULT_MAJOR_AMOUNT, sendMinor: sendAmountMinor.toString(), ilp: { rate: ilpRate, debitAmount: quote.debitAmount, receiveAmount: quote.receiveAmount, quoteId: quote.id }, market: { rate: marketRate, source: "multi" }, deltaPct }, "FX compare");
  } catch (e) {
    return error(res, e?.message || "internal-error", 500);
  }
});

export default router;

