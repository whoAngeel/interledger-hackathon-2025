import { getOPClient } from "../config/openPayments.js";
import { isFinalizedGrant } from "@interledger/open-payments";
import log from "../utils/logger.js";

class OpenPaymentsService {
  constructor() {
    this.client = null;
  }

  initialize() {
    this.client = getOPClient();
  }

  // Obtener información de una wallet address
  async getWalletAddress(walletUrl) {
    // Log claro para debugging
    console.debug(
      "[OpenPaymentsService] getWalletAddress called with:",
      walletUrl
    );

    if (!walletUrl) {
      throw new Error("No walletUrl provided to getWalletAddress");
    }

    // Asegurar que tenga esquema (http/https)
    if (!/^https?:\/\//i.test(walletUrl)) {
      walletUrl = `http://${walletUrl}`;
      console.debug(
        "[OpenPaymentsService] Normalized walletUrl to:",
        walletUrl
      );
    }

    try {
      // Implementar timeout robusto (AbortController) para node/fetch
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      console.debug("[OpenPaymentsService] Fetching wallet URL:", walletUrl);
      const res = await fetch(walletUrl, {
        method: "GET",
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!res.ok) {
        const body = await res.text().catch(() => "<no body>");
        console.error(
          `[OpenPaymentsService] Non-OK response for ${walletUrl}: ${res.status} ${res.statusText} - ${body}`
        );
        throw new Error(
          `Open Payments GET error: ${res.status} ${res.statusText} - ${body}`
        );
      }

      const contentType = res.headers.get("content-type") || "";
      if (!/json/.test(contentType)) {
        const text = await res.text().catch(() => "<no body>");
        console.warn(
          `[OpenPaymentsService] Unexpected content-type for ${walletUrl}: ${contentType}. Body: ${text}`
        );
      }

      const data = await res.json();
      return data;
    } catch (err) {
      if (err.name === "AbortError") {
        console.error("[OpenPaymentsService] Fetch timed out for:", walletUrl);
      } else {
        console.error(
          "[OpenPaymentsService] Error calling wallet endpoint:",
          walletUrl,
          err
        );
      }
      // Re-lanzar con mensaje claro para el controlador
      throw new Error(
        "No se pudo obtener la wallet: Error making Open Payments GET request"
      );
    }
  }

  // Crear incoming payment (receptor)
  async createIncomingPayment(recipientWalletUrl, amount) {
    try {
      if (!this.client) this.initialize();

      log.info("Creando incoming payment...");

      // Obtener wallet del receptor
      const recipientWallet = await this.getWalletAddress(recipientWalletUrl);

      // Solicitar grant para crear incoming payment
      const incomingPaymentGrant = await this.client.grant.request(
        { url: recipientWallet.authServer },
        {
          access_token: {
            access: [
              {
                type: "incoming-payment",
                actions: ["create"],
              },
            ],
          },
        }
      );

      log.debug("Incoming payment grant obtenido:", {
        accessToken:
          incomingPaymentGrant.access_token.value.substring(0, 10) + "...",
      });

      // Crear incoming payment
      const incomingPayment = await this.client.incomingPayment.create(
        {
          url: recipientWallet.resourceServer,
          accessToken: incomingPaymentGrant.access_token.value,
        },
        {
          walletAddress: recipientWallet.id,
          incomingAmount: {
            assetCode: amount.assetCode || recipientWallet.assetCode,
            assetScale: amount.assetScale || recipientWallet.assetScale,
            value: amount.value,
          },
        }
      );

      log.info("Incoming payment creado:", { id: incomingPayment.id });

      return {
        incomingPayment,
        recipientWallet,
        grant: incomingPaymentGrant,
      };
    } catch (error) {
      log.error("Error creando incoming payment:", error);
      throw error;
    }
  }

  // Crear quote (cotización)
  async createQuote(senderWalletUrl, incomingPaymentId) {
    try {
      if (!this.client) this.initialize();

      log.info("Creando quote...");

      const senderWallet = await this.getWalletAddress(senderWalletUrl);

      // Solicitar grant para crear quote
      const quoteGrant = await this.client.grant.request(
        { url: senderWallet.authServer },
        {
          access_token: {
            access: [
              {
                type: "quote",
                actions: ["create"],
              },
            ],
          },
        }
      );

      if (!isFinalizedGrant(quoteGrant)) {
        throw new Error("Se esperaba que finalizara la concesión del quote");
      }

      log.debug("Quote grant obtenido");

      // Crear quote
      const quote = await this.client.quote.create(
        {
          url: senderWallet.resourceServer,
          accessToken: quoteGrant.access_token.value,
        },
        {
          walletAddress: senderWallet.id,
          receiver: incomingPaymentId,
          method: "ilp",
        }
      );

      log.info("Quote creado:", {
        id: quote.id,
        debitAmount: quote.debitAmount,
        receiveAmount: quote.receiveAmount,
      });

      return {
        quote,
        senderWallet,
        grant: quoteGrant,
      };
    } catch (error) {
      log.error("Error creando quote:", error);
      throw error;
    }
  }

  // Solicitar grant para outgoing payment (requiere interacción del usuario)
  async requestOutgoingPaymentGrant(senderWalletUrl, quote) {
    try {
      if (!this.client) this.initialize();

      log.info("Solicitando outgoing payment grant...");

      const senderWallet = await this.getWalletAddress(senderWalletUrl);

      const outgoingPaymentGrant = await this.client.grant.request(
        { url: senderWallet.authServer },
        {
          access_token: {
            access: [
              {
                type: "outgoing-payment",
                actions: ["create"],
                limits: {
                  debitAmount: quote.debitAmount,
                },
                identifier: senderWallet.id,
              },
            ],
          },
          interact: {
            start: ["redirect"],
          },
        }
      );

      log.info("Outgoing payment grant solicitado (requiere autorización)");

      return {
        grant: outgoingPaymentGrant,
        redirectUrl: outgoingPaymentGrant.interact?.redirect,
        continueUri: outgoingPaymentGrant.continue.uri,
        continueToken: outgoingPaymentGrant.continue.access_token.value,
      };
    } catch (error) {
      log.error("Error solicitando outgoing payment grant:", error);
      throw error;
    }
  }

  // Finalizar grant de outgoing payment (después de autorización del usuario)
  async finalizeOutgoingPaymentGrant(continueUri, continueToken) {
    try {
      if (!this.client) this.initialize();

      log.info("Finalizando outgoing payment grant...");

      const finalizedGrant = await this.client.grant.continue({
        url: continueUri,
        accessToken: continueToken,
      });

      if (!isFinalizedGrant(finalizedGrant)) {
        throw new Error(
          "Se esperaba que finalizara la concesión del outgoing payment"
        );
      }

      log.info("Outgoing payment grant finalizado");

      return finalizedGrant;
    } catch (error) {
      log.error("Error finalizando outgoing payment grant:", error);
      throw error;
    }
  }

  // Crear outgoing payment (después de tener el grant finalizado)
  async createOutgoingPayment(senderWalletUrl, quoteId, accessToken) {
    try {
      if (!this.client) this.initialize();

      log.info("Creando outgoing payment...");

      const senderWallet = await this.getWalletAddress(senderWalletUrl);

      const outgoingPayment = await this.client.outgoingPayment.create(
        {
          url: senderWallet.resourceServer,
          accessToken: accessToken,
        },
        {
          walletAddress: senderWallet.id,
          quoteId: quoteId,
        }
      );

      log.info("Outgoing payment creado:", {
        id: outgoingPayment.id,
        failed: outgoingPayment.failed,
      });

      return outgoingPayment;
    } catch (error) {
      log.error("Error creando outgoing payment:", error);
      throw error;
    }
  }

  // Flujo completo de pago (sin autorización automática)
  async initiatePayment(senderWalletUrl, recipientWalletUrl, amount) {
    try {
      if (!this.client) this.initialize();

      log.info("=== Iniciando flujo de pago ===");

      // 1. Crear incoming payment
      const { incomingPayment, recipientWallet } =
        await this.createIncomingPayment(recipientWalletUrl, amount);

      // 2. Crear quote
      const { quote, senderWallet } = await this.createQuote(
        senderWalletUrl,
        incomingPayment.id
      );

      // 3. Solicitar grant para outgoing payment
      const grantRequest = await this.requestOutgoingPaymentGrant(
        senderWalletUrl,
        quote
      );

      log.info("=== Flujo de pago iniciado, requiere autorización ===");

      return {
        incomingPayment,
        quote,
        grantRequest,
        senderWallet,
        recipientWallet,
        status: "PENDING_AUTHORIZATION",
      };
    } catch (error) {
      log.error("Error en flujo de pago:", error);
      throw error;
    }
  }

  // ============= SPLIT PAYMENTS =============

  /**
   * Crear múltiples incoming payments para split payment
   * @param {Array} recipients - Array de { walletUrl, percentage }
   * @param {Object} totalAmount - { value, assetCode }
   * @returns {Array} incoming payments creados
   */
  async createSplitIncomingPayments(recipients, totalAmount) {
    try {
      if (!this.client) this.initialize();

      log.info("=== Creando split incoming payments ===");
      log.info(`Total recipients: ${recipients.length}`);
      log.info(`Total amount: ${totalAmount.value} ${totalAmount.assetCode}`);

      // Validar que los porcentajes sumen 100%
      const totalPercentage = recipients.reduce(
        (sum, r) => sum + r.percentage,
        0
      );
      if (Math.abs(totalPercentage - 100) > 0.01) {
        throw new Error(
          `Los porcentajes deben sumar 100%. Actual: ${totalPercentage}%`
        );
      }

      const incomingPayments = [];
      const errors = [];
      const totalValue = parseInt(totalAmount.value);

      for (const recipient of recipients) {
        try {
          // Calcular monto para este receptor
          const recipientValue = Math.floor(
            (totalValue * recipient.percentage) / 100
          );

          log.info(
            `Creando incoming payment para ${recipient.walletUrl}: ${recipientValue} (${recipient.percentage}%)`
          );

          // Obtener wallet del receptor (detecta automáticamente el asset)
          const recipientWallet = await this.getWalletAddress(
            recipient.walletUrl
          );

          // Log del asset detectado
          log.info(
            `✅ Asset detectado para ${recipient.walletUrl}: ${recipientWallet.assetCode} (scale: ${recipientWallet.assetScale})`
          );

          // Solicitar grant
          const grant = await this.client.grant.request(
            { url: recipientWallet.authServer },
            {
              access_token: {
                access: [
                  {
                    type: "incoming-payment",
                    actions: ["create"],
                  },
                ],
              },
            }
          );

          // Crear incoming payment
          // IMPORTANTE: Usar el assetCode de la wallet del receptor, no del totalAmount
          // Cada wallet puede tener su propia moneda (USD, MXN, etc.)
          const incomingPayment = await this.client.incomingPayment.create(
            {
              url: recipientWallet.resourceServer,
              accessToken: grant.access_token.value,
            },
            {
              walletAddress: recipientWallet.id,
              incomingAmount: {
                assetCode: recipientWallet.assetCode,
                assetScale: recipientWallet.assetScale,
                value: recipientValue.toString(),
              },
              metadata: {
                description: `Split payment - ${recipient.percentage}% of total`,
                ...(recipient.metadata || {}),
              },
            }
          );

          incomingPayments.push({
            recipient: recipient.walletUrl,
            percentage: recipient.percentage,
            amount: recipientValue,
            assetCode: recipientWallet.assetCode, // Asset detectado de la wallet
            assetScale: recipientWallet.assetScale,
            incomingPayment,
            recipientWallet,
            grant,
          });

          log.info(
            `✅ Incoming payment creado: ${incomingPayment.id} (${recipientWallet.assetCode} ${recipientValue})`
          );
        } catch (error) {
          log.error(
            `❌ Error creando incoming payment para ${recipient.walletUrl}:`,
            error.message || error
          );
          if (error.response) {
            log.error("Response status:", error.response.status);
            log.error("Response body:", error.response.body);
          }
          // Intentar obtener el asset si la wallet se obtuvo antes del error
          let detectedAssetCode = null;
          try {
            const recipientWallet = await this.getWalletAddress(
              recipient.walletUrl
            );
            detectedAssetCode = recipientWallet.assetCode;
          } catch (e) {
            // Si no se pudo obtener la wallet, el assetCode será null
          }

          errors.push({
            recipient: recipient.walletUrl,
            percentage: recipient.percentage,
            error: error.message || error.toString(),
            amount: Math.floor((totalValue * recipient.percentage) / 100),
            assetCode: detectedAssetCode, // Asset detectado si fue posible
          });
        }
      }

      log.info(
        `=== ${incomingPayments.length} incoming payments creados, ${errors.length} errores ===`
      );

      // Si todos fallaron, lanzar error
      if (incomingPayments.length === 0 && errors.length > 0) {
        throw new Error(
          `Todos los incoming payments fallaron: ${errors.map((e) => e.error).join(", ")}`
        );
      }

      // Retornar resultados con información de errores
      return {
        incomingPayments,
        errors,
        hasErrors: errors.length > 0,
      };
    } catch (error) {
      log.error("Error creando split incoming payments:", error);
      throw error;
    }
  }

  /**
   * Crear múltiples quotes para split payments
   */
  async createSplitQuotes(senderWalletUrl, incomingPayments) {
    try {
      if (!this.client) this.initialize();

      log.info("=== Creando split quotes ===");

      const senderWallet = await this.getWalletAddress(senderWalletUrl);
      const quotes = [];

      for (const payment of incomingPayments) {
        log.info(`Creando quote para ${payment.recipient}`);

        // Solicitar grant para quote
        const quoteGrant = await this.client.grant.request(
          { url: senderWallet.authServer },
          {
            access_token: {
              access: [
                {
                  type: "quote",
                  actions: ["create"],
                },
              ],
            },
          }
        );

        if (!isFinalizedGrant(quoteGrant)) {
          throw new Error("Se esperaba que finalizara la concesión del quote");
        }

        // Crear quote
        const quote = await this.client.quote.create(
          {
            url: senderWallet.resourceServer,
            accessToken: quoteGrant.access_token.value,
          },
          {
            walletAddress: senderWallet.id,
            receiver: payment.incomingPayment.id,
            method: "ilp",
          }
        );

        quotes.push({
          recipient: payment.recipient,
          percentage: payment.percentage,
          quote,
          incomingPaymentId: payment.incomingPayment.id,
          grant: quoteGrant,
        });

        log.info(`✅ Quote creado: ${quote.id}`);
        log.info(
          `   Debit: ${quote.debitAmount.value} ${quote.debitAmount.assetCode}`
        );
        log.info(
          `   Receive: ${quote.receiveAmount.value} ${quote.receiveAmount.assetCode}`
        );
      }

      log.info(`=== ${quotes.length} quotes creados ===`);
      return { quotes, senderWallet };
    } catch (error) {
      log.error("Error creando split quotes:", error);
      throw error;
    }
  }

  /**
   * Solicitar grant único para múltiples outgoing payments
   */
  async requestSplitOutgoingPaymentGrant(senderWalletUrl, quotes) {
    try {
      if (!this.client) this.initialize();

      log.info("=== Solicitando split outgoing payment grant ===");

      const senderWallet = await this.getWalletAddress(senderWalletUrl);

      // Calcular el monto total de débito
      const totalDebitAmount = quotes.reduce(
        (acc, q) => {
          return {
            value: (
              parseInt(acc.value) + parseInt(q.quote.debitAmount.value)
            ).toString(),
            assetCode: q.quote.debitAmount.assetCode,
            assetScale: q.quote.debitAmount.assetScale,
          };
        },
        {
          value: "0",
          assetCode: quotes[0].quote.debitAmount.assetCode,
          assetScale: quotes[0].quote.debitAmount.assetScale,
        }
      );

      log.info(
        `Total debit amount: ${totalDebitAmount.value} ${totalDebitAmount.assetCode}`
      );

      // Solicitar grant único que cubra todos los pagos
      const outgoingPaymentGrant = await this.client.grant.request(
        { url: senderWallet.authServer },
        {
          access_token: {
            access: [
              {
                type: "outgoing-payment",
                actions: ["create", "read", "list"],
                limits: {
                  debitAmount: totalDebitAmount,
                },
                identifier: senderWallet.id,
              },
            ],
          },
          interact: {
            start: ["redirect"],

          },
        }
      );

      log.info("✅ Split outgoing payment grant solicitado");

      return {
        grant: outgoingPaymentGrant,
        redirectUrl: outgoingPaymentGrant.interact?.redirect,
        continueUri: outgoingPaymentGrant.continue.uri,
        continueToken: outgoingPaymentGrant.continue.access_token.value,
        totalDebitAmount,
      };
    } catch (error) {
      log.error("Error solicitando split outgoing payment grant:", error);
      throw error;
    }
  }

  /**
   * Crear múltiples outgoing payments después de autorización
   */
  async createSplitOutgoingPayments(senderWalletUrl, quotes, accessToken) {
    try {
      if (!this.client) this.initialize();

      log.info("=== Creando split outgoing payments ===");

      const senderWallet = await this.getWalletAddress(senderWalletUrl);
      const outgoingPayments = [];
      const errors = [];

      for (const quoteData of quotes) {
        try {
          log.info(`Creando outgoing payment para ${quoteData.recipient}`);

          const outgoingPayment = await this.client.outgoingPayment.create(
            {
              url: senderWallet.resourceServer,
              accessToken: accessToken,
            },
            {
              walletAddress: senderWallet.id,
              quoteId: quoteData.quote.id,
              metadata: {
                description: `Split payment - ${quoteData.percentage}%`,
                recipient: quoteData.recipient,
              },
            }
          );

          outgoingPayments.push({
            recipient: quoteData.recipient,
            percentage: quoteData.percentage,
            outgoingPayment,
          });

          log.info(`✅ Outgoing payment creado: ${outgoingPayment.id}`);
        } catch (error) {
          log.error(
            `❌ Error creando outgoing payment para ${quoteData.recipient}:`,
            error.message || error
          );
          if (error.response) {
            log.error("Response status:", error.response.status);
            log.error("Response body:", error.response.body);
          }
          errors.push({
            recipient: quoteData.recipient,
            percentage: quoteData.percentage,
            error: error.message || error.toString(),
            quoteId: quoteData.quote.id,
          });
        }
      }

      log.info(
        `=== ${outgoingPayments.length} outgoing payments creados, ${errors.length} errores ===`
      );

      // Si todos fallaron, lanzar error
      if (outgoingPayments.length === 0 && errors.length > 0) {
        throw new Error(
          `Todos los outgoing payments fallaron: ${errors.map((e) => e.error).join(", ")}`
        );
      }

      // Retornar resultados con información de errores
      return {
        outgoingPayments,
        errors,
        hasErrors: errors.length > 0,
      };
    } catch (error) {
      log.error("Error creando split outgoing payments:", error);
      throw error;
    }
  }

  /**
   * Flujo completo de split payment
   */
  async initiateSplitPayment(senderWalletUrl, recipients, totalAmount) {
    try {
      if (!this.client) this.initialize();

      log.info("=== Iniciando flujo de split payment ===");
      log.info(`Sender: ${senderWalletUrl}`);
      log.info(`Total amount: ${totalAmount.value} ${totalAmount.assetCode}`);
      log.info(`Recipients: ${recipients.length}`);

      // 1. Crear múltiples incoming payments
      const incomingPaymentsResult = await this.createSplitIncomingPayments(
        recipients,
        totalAmount
      );

      const { incomingPayments, errors: incomingErrors, hasErrors: hasIncomingErrors } = incomingPaymentsResult;

      // Si no hay incoming payments exitosos, no podemos continuar
      if (incomingPayments.length === 0) {
        throw new Error(
          `No se pudo crear ningún incoming payment. Errores: ${incomingErrors.map((e) => `${e.recipient}: ${e.error}`).join(", ")}`
        );
      }

      // 2. Crear múltiples quotes solo para los incoming payments exitosos
      const { quotes, senderWallet } = await this.createSplitQuotes(
        senderWalletUrl,
        incomingPayments
      );

      // 3. Solicitar grant único para todos los outgoing payments
      const grantRequest = await this.requestSplitOutgoingPaymentGrant(
        senderWalletUrl,
        quotes
      );

      log.info(
        "=== Flujo de split payment iniciado, requiere autorización ==="
      );

      return {
        incomingPayments,
        quotes,
        grantRequest,
        senderWallet,
        status: "PENDING_AUTHORIZATION",
        errors: incomingErrors.length > 0 ? incomingErrors : undefined,
        summary: {
          totalRecipients: recipients.length,
          successfulRecipients: incomingPayments.length,
          failedRecipients: incomingErrors.length,
          totalDebitAmount: grantRequest.totalDebitAmount,
          recipients: incomingPayments.map((ip) => ({
            wallet: ip.recipient,
            percentage: ip.percentage,
            amount: ip.amount,
            assetCode: ip.assetCode || ip.incomingPayment.incomingAmount.assetCode, // Asset detectado de la wallet
            assetScale: ip.assetScale || ip.incomingPayment.incomingAmount.assetScale,
          })),
          failedRecipients: incomingErrors.map((e) => ({
            wallet: e.recipient,
            percentage: e.percentage,
            amount: e.amount,
            assetCode: e.assetCode || null, // Asset detectado si fue posible
            error: e.error,
          })),
        },
      };
    } catch (error) {
      log.error("Error en flujo de split payment:", error);
      throw error;
    }
  }
}

export default new OpenPaymentsService();
