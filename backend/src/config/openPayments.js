import { createAuthenticatedClient } from "@interledger/open-payments";
import { readFileSync } from "fs";
import { resolve } from "path";

let opClient = null;

export const initializeOpenPayments = async () => {
  if (!opClient) {
    const privateKey = readFileSync(
      resolve(process.env.PRIVATE_KEY_PATH),
      "utf8"
    );

    opClient = await createAuthenticatedClient({
      walletAddressUrl: process.env.WALLET_ADDRESS_URL,
      privateKey: privateKey,
      keyId: process.env.KEY_ID,
    });

    console.log("✅ Open Payments client inicializado");
  }
  return opClient;
};

export const getOPClient = () => opClient;
