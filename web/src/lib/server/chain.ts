import "server-only";
import {
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  http,
  parseEventLogs,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { env } from "./env";
import { FACTORY_ADDRESS, monadTestnet } from "../chain";
import { gameTokenAbi, gameTokenFactoryAbi, prizePoolAbi } from "../abi";

const transport = () => http(env().RPC_URL, { timeout: 20_000, retryCount: 2 });

let reader: PublicClient | null = null;
/** Read-only client; needs no secrets. */
export function publicClient(): PublicClient {
  return (reader ??= createPublicClient({ chain: monadTestnet, transport: transport() }) as PublicClient);
}

function signer() {
  const e = env();
  if (!e.PLATFORM_PRIVATE_KEY) throw new Error("PLATFORM_PRIVATE_KEY is not set");
  if (!FACTORY_ADDRESS) throw new Error("NEXT_PUBLIC_FACTORY_ADDRESS is not set");
  const account = privateKeyToAccount(e.PLATFORM_PRIVATE_KEY as Hex);
  return { account, walletClient: createWalletClient({ chain: monadTestnet, transport: transport(), account }) };
}

export function platformAddress(): Address | null {
  const pk = env().PLATFORM_PRIVATE_KEY;
  return pk ? privateKeyToAccount(pk as Hex).address : null;
}

/**
 * Sends a platform-wallet transaction. Monad charges gas on the LIMIT, so we estimate and add only 10%.
 * Uses eth_sendRawTransactionSync (supported by Monad) to get the receipt in one round trip, and
 * retries once on nonce races between concurrent serverless invocations.
 */
async function sendFromPlatform(to: Address, data: Hex) {
  const { account, walletClient } = signer();
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const estimate = await publicClient().estimateGas({ account, to, data });
      const receipt = await walletClient.sendTransactionSync({ to, data, gas: estimate + estimate / 10n });
      if (receipt.status !== "success") throw new Error(`transaction reverted: ${receipt.transactionHash}`);
      return receipt;
    } catch (err) {
      lastErr = err;
      if (!/nonce|replacement|already known/i.test(String((err as Error).message))) break;
    }
  }
  throw lastErr;
}

export async function launchToken(args: {
  name: string;
  symbol: string;
  imageURI: string;
  configURI: string;
  creator: Address | null;
}) {
  const data = encodeFunctionData({
    abi: gameTokenFactoryAbi,
    functionName: "launch",
    args: [args.name, args.symbol, args.imageURI, args.configURI, args.creator ?? "0x0000000000000000000000000000000000000000"],
  });
  const receipt = await sendFromPlatform(FACTORY_ADDRESS, data);
  const [log] = parseEventLogs({ abi: gameTokenFactoryAbi, eventName: "GameLaunched", logs: receipt.logs });
  if (!log) throw new Error("GameLaunched event not found");
  return {
    token: log.args.token,
    txHash: receipt.transactionHash,
    blockNumber: receipt.blockNumber,
    gasUsed: receipt.gasUsed,
  };
}

export async function prizePoolAddress(): Promise<Address> {
  return publicClient().readContract({ address: FACTORY_ADDRESS, abi: gameTokenFactoryAbi, functionName: "prizePool" });
}

/** Settles `day` from the platform wallet (used by the daily cron). Anyone can also settle from the UI. */
export async function settleDay(day: bigint) {
  const pool = await prizePoolAddress();
  const data = encodeFunctionData({ abi: prizePoolAbi, functionName: "settle", args: [day] });
  const receipt = await sendFromPlatform(pool, data);
  const [log] = parseEventLogs({ abi: prizePoolAbi, eventName: "DaySettled", logs: receipt.logs });
  return { txHash: receipt.transactionHash, settled: log?.args };
}

const tokenCache = new Map<string, boolean>();
/** True only for tokens deployed by our factory. Cached, since the answer never changes. */
export async function isFactoryToken(token: Address): Promise<boolean> {
  const key = token.toLowerCase();
  if (tokenCache.has(key)) return tokenCache.get(key)!;
  const ok = await publicClient().readContract({
    address: FACTORY_ADDRESS,
    abi: gameTokenFactoryAbi,
    functionName: "isGameToken",
    args: [token],
  });
  tokenCache.set(key, ok);
  return ok;
}

export type DecodedTrade = {
  id: string;
  kind: "buy" | "sell";
  token: Address;
  trader: Address;
  tokensWhole: bigint;
  value: bigint; // MON on the curve (cost for buys, gross proceeds for sells)
  fee: bigint;
  newPrice: bigint;
  txHash: Hex;
  blockNumber: bigint;
  timestamp: number;
};

/** Reads a transaction receipt and returns the trades of our games' coins in it. Verifies everything on-chain. */
export async function tradesFromTx(txHash: Hex): Promise<DecodedTrade[]> {
  const client = publicClient();
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  // The browser posts the moment its wallet sees the receipt (~0.4s on Monad), but the public RPC is a
  // pool of nodes and the one we hit can be a block or two behind. Retry for a few seconds.
  let receipt = null;
  for (let i = 0; i < 10 && !receipt; i++) {
    receipt = await client.getTransactionReceipt({ hash: txHash }).catch(() => null);
    if (!receipt) await sleep(500);
  }
  if (!receipt) throw new Error("receipt not found");
  if (receipt.status !== "success") return [];

  const logs = parseEventLogs({ abi: gameTokenAbi, logs: receipt.logs, strict: true }).filter(
    (l) => l.eventName === "Bought" || l.eventName === "Sold",
  );
  if (!logs.length) return [];

  // A lagging node answers eth_getBlockByNumber for a brand-new block with "Invalid parameters".
  // The timestamp only places the dot on the price chart, so retry briefly and then use "now"
  // (the trade happened within the last second or two) instead of failing to record the trade.
  let timestamp = Math.floor(Date.now() / 1000);
  for (let i = 0; i < 4; i++) {
    const block = await client.getBlock({ blockHash: receipt.blockHash }).catch(() => null);
    if (block) {
      timestamp = Number(block.timestamp);
      break;
    }
    await sleep(400);
  }
  const block = { timestamp: BigInt(timestamp) };

  const out: DecodedTrade[] = [];
  for (const l of logs) {
    if (!(await isFactoryToken(l.address))) continue; // someone else's contract emitting look-alike events
    const base = { id: `${txHash}:${l.logIndex}`, token: l.address, txHash, blockNumber: receipt.blockNumber, timestamp: Number(block.timestamp) };
    if (l.eventName === "Bought") {
      const a = l.args as { buyer: Address; tokensWhole: bigint; cost: bigint; fee: bigint; newPrice: bigint };
      out.push({ ...base, kind: "buy", trader: a.buyer, tokensWhole: a.tokensWhole, value: a.cost, fee: a.fee, newPrice: a.newPrice });
    } else {
      const a = l.args as { seller: Address; tokensWhole: bigint; proceeds: bigint; fee: bigint; newPrice: bigint };
      out.push({ ...base, kind: "sell", trader: a.seller, tokensWhole: a.tokensWhole, value: a.proceeds, fee: a.fee, newPrice: a.newPrice });
    }
  }
  return out;
}
