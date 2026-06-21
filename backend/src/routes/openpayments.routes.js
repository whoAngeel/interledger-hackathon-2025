import express from "express";
import crypto from "crypto";
import { success, error } from "../utils/response.js";
import { getOPClient } from "../config/openPayments.js";
import openPaymentsService from "../services/open.payments.service.js";
import mongoService from "../services/mongo.service.js";

const router = express.Router();

function splitEven(total, parts) {
  const base = Math.floor(total / parts);
  const res = total % parts;
  return Array.from({ length: parts }, (_, i) => base + (i < res ? 1 : 0));
}

router.post("/split/group-checkout", async (req, res) => {
  try {
    const { merchantAddress, totalAmountMinor, payers } = req.body ?? {};
    const baseUrl = process.env.CALLBACK_BASE_URL;
    if (!baseUrl) return error(res, "CALLBACK_BASE_URL no configurado", 400);
    if (!merchantAddress || !Array.isArray(payers) || payers.length === 0) {
      return error(res, "merchantAddress y payers[] requeridos", 400);
    }
    const total = typeof totalAmountMinor === "string" ? Number(totalAmountMinor) : Number(totalAmountMinor);
    if (!Number.isFinite(total) || total <= 0 || !Number.isInteger(total)) {
      return error(res, "totalAmountMinor debe ser entero positivo", 400);
    }
    const merchantWA = await openPaymentsService.getWalletAddress(merchantAddress);
    const payerWAs = await Promise.all(
      payers.map((url) => openPaymentsService.getWalletAddress(url))
    );
    const client = getOPClient();
    const merchantIncomingGrant = await client.grant.request(
      { url: merchantWA.authServer },
      { access_token: { access: [{ type: "incoming-payment", actions: ["create"] }] } }
    );
    const shares = splitEven(total, payerWAs.length);
    const incomings = await Promise.all(
      shares.map((shareMinor) =>
        client.incomingPayment.create(
          { url: merchantWA.resourceServer, accessToken: merchantIncomingGrant.access_token.value },
          { walletAddress: merchantWA.id, incomingAmount: { value: String(shareMinor), assetCode: merchantWA.assetCode, assetScale: merchantWA.assetScale } }
        )
      )
    );

    const groupId = crypto.randomUUID();
    const results = await Promise.all(
      payerWAs.map(async (payerWA, i) => {
        const quoteGrant = await client.grant.request(
          { url: payerWA.authServer },
          { access_token: { access: [{ type: "quote", actions: ["create"] }] } }
        );
        const quote = await client.quote.create(
          { url: payerWA.resourceServer, accessToken: quoteGrant.access_token.value },
          { walletAddress: payerWA.id, receiver: incomings[i].id, method: "ilp" }
        );
        const nonce = crypto.randomBytes(16).toString("hex");
        const interactRedirectUri = `${baseUrl}/api/op/callback?nonce=${nonce}`;
        const outgoingGrantInit = await client.grant.request(
          { url: payerWA.authServer },
          { access_token: { access: [{ type: "outgoing-payment", actions: ["create"], identifier: payerWA.id, limits: { debitAmount: { value: quote.debitAmount.value, assetCode: payerWA.assetCode, assetScale: payerWA.assetScale } } }] }, interact: { start: ["redirect"], finish: { method: "redirect", uri: interactRedirectUri, nonce } } }
        );

        await mongoService.create("group_checkout_sessions", nonce, {
          groupId,
          payer: payerWA.id,
          customerWA: payerWA,
          merchantWA,
          quote,
          continueUri: outgoingGrantInit.continue.uri,
          continueToken: outgoingGrantInit.continue.access_token.value,
          shareMinor: shares[i],
          status: "PENDING_AUTHORIZATION",
          createdAt: new Date().toISOString(),
        });

        return { payer: payerWA.id, shareMinor: shares[i], redirectUrl: outgoingGrantInit.interact.redirect, nonce };
      })
    );

    return success(res, { groupId, merchant: merchantWA.id, totalMinor: total, count: payerWAs.length, results }, "group-checkout");
  } catch (e) {
    return error(res, e?.message || "internal-error", 500);
  }
});

router.get("/op/callback", async (req, res) => {
  try {
    const { interact_ref, nonce } = req.query || {};
    if (!interact_ref || !nonce) return error(res, "interact_ref y nonce requeridos", 400);

    const session = await mongoService.getById("group_checkout_sessions", nonce);
    if (!session) return error(res, "flujo no encontrado", 400);

    const client = getOPClient();
    const continued = await client.grant.continue(
      { url: session.continueUri, accessToken: session.continueToken },
      { interact_ref }
    );
    const result = await client.outgoingPayment.create(
      { url: session.customerWA.resourceServer, accessToken: continued.access_token.value },
      { walletAddress: session.customerWA.id, quoteId: session.quote.id }
    );

    await mongoService.update("group_checkout_sessions", nonce, {
      status: result.failed ? "FAILED" : "COMPLETED",
      outgoingPaymentId: result.id,
      completedAt: new Date().toISOString(),
    });

    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
    return res.redirect(`${frontendUrl}/?groupStatus=${result.failed ? "FAILED" : "COMPLETED"}&groupId=${session.groupId}&payer=${session.payer}`);
  } catch (e) {
    return error(res, e?.message || "internal-error", 500);
  }
});

export default router;
