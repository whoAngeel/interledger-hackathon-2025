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
    try {
      if (!this.client) this.initialize();

      log.info(`Obteniendo wallet address: ${walletUrl}`);
      const walletAddress = await this.client.walletAddress.get({
        url: walletUrl,
      });
      return walletAddress;
    } catch (error) {
      log.error("Error obteniendo wallet address:", error);
      throw new Error(`No se pudo obtener la wallet: ${error.message}`);
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
}

export default new OpenPaymentsService();
