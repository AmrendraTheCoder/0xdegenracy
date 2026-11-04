import "server-only";
import {
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  http,
  parseEventLogs,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { env } from "./env";
import { FACTORY_ADDRESS, monadTestnet } from "../chain";
import { gameTokenFactoryAbi } from "../abi";

function clients() {
  const e = env();
  if (!e.PLATFORM_PRIVATE_KEY) throw new Error("PLATFORM_PRIVATE_KEY is not set");
  if (!FACTORY_ADDRESS) throw new Error("NEXT_PUBLIC_FACTORY_ADDRESS is not set");
  const transport = http(e.RPC_URL, { timeout: 20_000, retryCount: 2 });
  const account = privateKeyToAccount(e.PLATFORM_PRIVATE_KEY as Hex);
  return {
    account,
    publicClient: createPublicClient({ chain: monadTestnet, transport }),
    walletClient: createWalletClient({ chain: monadTestnet, transport, account }),
  };
}

export function platformAddress(): Address | null {
  const pk = env().PLATFORM_PRIVATE_KEY;
  return pk ? privateKeyToAccount(pk as Hex).address : null;
}

/**
 * Calls factory.launch from the platform wallet and returns the new token address.
 * Monad charges gas on the LIMIT, so we estimate and add only 10%.
 * Uses eth_sendRawTransactionSync (supported by Monad) to get the receipt in one round trip.
 */
export async function launchToken(args: {
  name: string;
  symbol: string;
  imageURI: string;
  configURI: string;
  creator: Address | null;
}): Promise<{ token: Address; txHash: Hex }> {
  const { account, publicClient, walletClient } = clients();
  const data = encodeFunctionData({
    abi: gameTokenFactoryAbi,
    functionName: "launch",
    args: [
      args.name,
      args.symbol,
      args.imageURI,
      args.configURI,
      args.creator ?? "0x0000000000000000000000000000000000000000",
    ],
  });

  let lastErr: unknown;
  // Retry once: concurrent serverless invocations can race on the platform wallet's nonce.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const estimate = await publicClient.estimateGas({ account, to: FACTORY_ADDRESS, data });
      const receipt = await walletClient.sendTransactionSync({
        to: FACTORY_ADDRESS,
        data,
        gas: estimate + estimate / 10n,
      });
      if (receipt.status !== "success") throw new Error(`launch reverted: ${receipt.transactionHash}`);
      const [log] = parseEventLogs({ abi: gameTokenFactoryAbi, eventName: "GameLaunched", logs: receipt.logs });
      if (!log) throw new Error("GameLaunched event not found");
      return { token: log.args.token, txHash: receipt.transactionHash };
    } catch (err) {
      lastErr = err;
      const msg = String((err as Error).message).toLowerCase();
      if (!/nonce|replacement|already known/.test(msg)) break;
    }
  }
  throw lastErr;
}
