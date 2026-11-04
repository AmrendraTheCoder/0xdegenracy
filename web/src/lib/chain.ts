import { defineChain, type Address } from "viem";

// Single source of truth for network config. Values from docs.monad.xyz (Testnet Quick Facts).
export const monadTestnet = defineChain({
  id: 10_143,
  name: "Monad Testnet",
  nativeCurrency: { name: "Monad", symbol: "MON", decimals: 18 },
  rpcUrls: {
    default: {
      http: [process.env.NEXT_PUBLIC_RPC_URL || "https://testnet-rpc.monad.xyz"],
      webSocket: ["wss://testnet-rpc.monad.xyz"],
    },
  },
  blockExplorers: {
    default: { name: "MonadVision", url: "https://testnet.monadvision.com" },
    monadscan: { name: "Monadscan", url: "https://testnet.monadscan.com" },
  },
  contracts: {
    multicall3: { address: "0xcA11bde05977b3631167028862bE2a173976CA11", blockCreated: 251449 },
  },
  testnet: true,
});

export const FACTORY_ADDRESS = (process.env.NEXT_PUBLIC_FACTORY_ADDRESS || "") as Address;

export const explorerAddress = (a: string) => `${monadTestnet.blockExplorers.default.url}/address/${a}`;
export const explorerTx = (h: string) => `${monadTestnet.blockExplorers.default.url}/tx/${h}`;
export const FAUCET_URL = "https://faucet.monad.xyz";
