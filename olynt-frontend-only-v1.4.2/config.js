/**
 * Olynt — Frontend-only checkout config (USDC + USDT, multi-network)
 *
 * IMPORTANT: This is a frontend-only demo.
 * - Links/receipts are stored in the browser (localStorage) for now.
 * - For real production sharing, you need a backend (or at least a hosted JSON store).
 */

export const APP_NAME = "Olynt";

/** Your treasury wallet (fee receiver) */
export const TREASURY_WALLET = "0x1a605eea1105f99df7badb733c82a8c24c2eb172";

/** Fee in basis points (BPS). 200 BPS = 2.00% */
export const FEE_BPS = 200;

/** Supported chains (EVM) */
export const CHAINS = {
  1:     { name: "Ethereum",  explorerTx: (tx) => `https://etherscan.io/tx/${tx}` },
  8453:  { name: "Base",      explorerTx: (tx) => `https://basescan.org/tx/${tx}` },
  10:    { name: "Optimism",  explorerTx: (tx) => `https://optimistic.etherscan.io/tx/${tx}` },
  42161: { name: "Arbitrum",  explorerTx: (tx) => `https://arbiscan.io/tx/${tx}` },
  137:   { name: "Polygon",   explorerTx: (tx) => `https://polygonscan.com/tx/${tx}` },
  56:    { name: "BSC",       explorerTx: (tx) => `https://bscscan.com/tx/${tx}` },
};

/**
 * Token addresses per chainId.
 * - USDC addresses are native USDC where available (Circle), except on BSC we use Binance-Peg USDC.
 * - USDT addresses are canonical/commonly-used contracts on each chain.
 */
export const TOKENS = {
  USDC: {
    symbol: "USDC",
    addresses: {
      1:     "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", // Ethereum (Circle)
      8453:  "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // Base (Circle)
      10:    "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85", // OP Mainnet (Circle)
      42161: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", // Arbitrum (Circle)
      137:   "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", // Polygon PoS (Circle)
      56:    "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d", // BSC (Binance-Peg USDC)
    }
  },
  USDT: {
    symbol: "USDT",
    addresses: {
      1:     "0xdAC17F958D2ee523a2206206994597C13D831ec7", // Ethereum
      8453:  "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2", // Base (bridged)
      10:    "0x94b008aa00579c1307b0ef2c499ad98a8ce58e58", // Optimism
      42161: "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9", // Arbitrum
      137:   "0xc2132D05D31c914a87C6611C10748AEb04B58e8F", // Polygon PoS
      56:    "0x55d398326f99059ff775485246999027b3197955", // BSC
    }
  }
};

export const DEFAULT_CHAIN_ID = 8453; // Base
export const DEFAULT_TOKEN = "USDC";

/** localStorage keys */
export const LS_KEYS = {
  RECEIPTS: "olynt_receipts_v1"
};

// WalletConnect v2 (for mobile wallets via QR)
// Create a free Project ID at https://cloud.walletconnect.com and paste it here
export const WALLETCONNECT_PROJECT_ID = "YOUR_WALLETCONNECT_PROJECT_ID";

// Public RPCs (good defaults). You can replace with your own Alchemy/Infura endpoints.
export const RPC_BY_CHAIN = {
  1: "https://cloudflare-eth.com",
  56: "https://bsc-dataseed.binance.org",
  8453: "https://mainnet.base.org",
  10: "https://mainnet.optimism.io",
  42161: "https://arb1.arbitrum.io/rpc",
  137: "https://polygon-rpc.com",
};

