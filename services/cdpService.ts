import { CdpClient } from "@coinbase/cdp-sdk";
import { createPublicClient, http, parseEther } from "viem";
import { base } from "viem/chains";

import { config } from '../config/index.js';
import { logger } from '../lib/logger.js';

let cdp: CdpClient;
let publicClient: any;

const initializeClient = () => {

  // Debug environment variables
  logger.debug({
    hasApiKeyId: !!process.env.CDP_API_KEY_ID,
    hasApiKeySecret: !!process.env.CDP_API_KEY_SECRET,
    hasWalletSecret: !!process.env.CDP_WALLET_SECRET,
  }, 'CDP Client env check');
  
  if (!cdp) {
    try {
      cdp = new CdpClient({
        apiKeyId: process.env.CDP_API_KEY_ID!,
        apiKeySecret: process.env.CDP_API_KEY_SECRET!,
        walletSecret: process.env.CDP_WALLET_SECRET!,
      });
      logger.info('CDP Client initialized successfully');
    } catch (error) {
      logger.error({ err: error }, 'Failed to initialize CDP Client');
      throw error;
    }
  }

  if (!publicClient) {
    // Use Ankr RPC endpoint for Base network to avoid rate limiting
    const ankrRpcUrl = config.providerUrl;
    
    publicClient = createPublicClient({
      chain: base,
      transport: http(ankrRpcUrl),
    });
    
    logger.info('Public client initialized with RPC endpoint');
  }
  return { cdp, publicClient };
};

const erc20Abi = [
  {
    inputs: [],
    name: "name",
    outputs: [{ name: "", type: "string" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "symbol",
    outputs: [{ name: "", type: "string" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "decimals",
    outputs: [{ name: "", type: "uint8" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

interface TokenMetadata {
  name: string;
  symbol: string;
  decimals: number;
}

interface TokenPrice {
  usd: number;
  usd_24h_change: number;
}

const tokenCache = new Map();
const priceCache = new Map<string, { price: TokenPrice; timestamp: number }>();
const PRICE_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

export class CdpService {
  private static instance: CdpService;

  private constructor() {}

  static getInstance(): CdpService {
    if (!CdpService.instance) {
      CdpService.instance = new CdpService();
    }
    return CdpService.instance;
  }

  async createAccount(name: string) {
    try {
      const cdp = initializeClient();
      const account = await cdp.cdp.evm.createAccount({ name });
      return {
        success: true,
        data: account,
        message: `Account ${name} created successfully`,
      };
    } catch (error) {
      throw new Error(`Failed to create account: ${(error as Error).message}`);
    }
  }

  async getAccount(name: string) {
    try {
      const cdp = initializeClient();
      const account = await cdp.cdp.evm.getAccount({ name });
      return {
        success: true,
        data: account,
        message: `Account ${name} retrieved successfully`,
      };
    } catch (error) {
      throw new Error(`Failed to get account: ${(error as Error).message}`);
    }
  }

  async listAccounts() {
    try {
      const cdp = initializeClient();
      const accounts = await cdp.cdp.evm.listAccounts();
      return {
        success: true,
        data: accounts,
        message: "Accounts retrieved successfully",
      };
    } catch (error) {
      throw new Error(`Failed to list accounts: ${(error as Error).message}`);
    }
  }

  async sendTransaction(
    accountName: string,
    transactionData: {
      to: `0x${string}`;
      value: string;
      network?: "base" | "base-sepolia";
    }
  ) {
    try {
      const account = await this.getAccount(accountName);
      const cdp = initializeClient();
      const { transactionHash } = await cdp.cdp.evm.sendTransaction({
        address: account.data.address,
        transaction: {
          to: transactionData.to,
          value: parseEther(transactionData.value),
        },
        network: transactionData.network || "base",
      });

      return {
        success: true,
        data: { transactionHash },
        message: "Transaction sent successfully",
      };
    } catch (error) {
      throw new Error(`Failed to send transaction: ${(error as Error).message}`);
    }
  }

  async transfer(
    accountName: string,
    transferData: {
      to: `0x${string}`;
      amount: string;
      token: "eth" | "usdc";
      network?: "base" | "base-sepolia";
    }
  ) {
    try {
      const account = await this.getAccount(accountName);
      const { transactionHash } = await account.data.transfer({
        to: transferData.to,
        amount: parseEther(transferData.amount),
        token: transferData.token,
        network: transferData.network || "base",
      });

      return {
        success: true,
        data: { transactionHash },
        message: "Transfer completed successfully",
      };
    } catch (error) {
      throw new Error(`Failed to transfer: ${(error as Error).message}`);
    }
  }

  async getBalances(accountName: string) {
    try {
      const account = await this.getAccount(accountName);
      const { cdp } = initializeClient();

      const result = await cdp.evm.listTokenBalances({
        address: account.data.address,
        network: "base",
      });

      const enhancedBalances = await Promise.all(
        result.balances.map(async (balance) => {
          const metadata = await this.fetchTokenMetadata(
            balance.token.contractAddress
          );
          
          // Get token price in USD
          const price = await this.fetchTokenPrice(metadata.symbol, balance.token.contractAddress);
          
          // Calculate USD value
          const formattedAmount = this.formatAmount(
            balance.amount.amount.toString(),
            metadata.decimals
          );
          const usdValue = price ? parseFloat(formattedAmount) * price.usd : 0;

          return {
            token: {
              contractAddress: balance.token.contractAddress,
              name: metadata.name,
              symbol: metadata.symbol,
              decimals: metadata.decimals,
            },
            amount: {
              raw: balance.amount.amount.toString(),
              formatted: formattedAmount,
            },
            price: price ? {
              usd: price.usd,
              usd_24h_change: price.usd_24h_change,
            } : null,
            usdValue: usdValue,
          };
        })
      );

      // Calculate total USD value
      const totalUsdValue = enhancedBalances.reduce((sum, balance) => {
        return sum + (balance.usdValue || 0);
      }, 0);

      return {
        success: true,
        data: {
          account: accountName,
          network: "base",
          balances: enhancedBalances,
          totalUsdValue: totalUsdValue,
        },
        message: "Balances retrieved successfully",
      };
    } catch (error) {
      throw new Error(`Failed to get balances: ${(error as Error).message}`);
    }
  }

  /**
   * Test token metadata fetching for any token address
   */
  async testTokenMetadata(contractAddress: `0x${string}`) {
    try {
      logger.info({ contractAddress }, 'Testing token metadata fetching');
      
      const metadata = await this.fetchTokenMetadata(contractAddress);
      
      return {
        success: true,
        data: {
          contractAddress,
          metadata,
          isKnownToken: this.getKnownTokenInfo(contractAddress) !== null,
          cacheHit: tokenCache.has(contractAddress)
        },
        message: "Token metadata retrieved successfully"
      };
    } catch (error) {
      logger.error({ err: error }, 'Token metadata test failed');
      return {
        success: false,
        error: `Failed to fetch token metadata: ${(error as Error).message}`,
        data: {
          contractAddress,
          isKnownToken: this.getKnownTokenInfo(contractAddress) !== null,
          cacheHit: tokenCache.has(contractAddress)
        }
      };
    }
  }

  /**
   * Get token information by contract address
   */
  async getTokenInfo(contractAddress: `0x${string}`, network: "base" | "base-sepolia" | "ethereum" = "base") {
    try {
      const metadata = await this.fetchTokenMetadata(contractAddress);
      
      return {
        success: true,
        data: {
          name: metadata.name,
          symbol: metadata.symbol,
          decimals: metadata.decimals,
          contractAddress: contractAddress,
          network: network
        },
        message: "Token information retrieved successfully"
      };
    } catch (error) {
      throw new Error(`Failed to get token info: ${(error as Error).message}`);
    }
  }

  private async fetchTokenPrice(symbol: string, contractAddress?: string): Promise<TokenPrice | null> {
    // Skip price fetching for unknown tokens
    if (symbol === "UNKNOWN") {
      return null;
    }

    const cacheKey = contractAddress || symbol.toLowerCase();
    const now = Date.now();
    const cached = priceCache.get(cacheKey);

    // Return cached price if it's still valid
    if (cached && (now - cached.timestamp) < PRICE_CACHE_DURATION) {
      return cached.price;
    }

    try {
      let price: TokenPrice | null = null;

      // Try GeckoTerminal first if we have a contract address
      if (contractAddress && contractAddress !== "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE") {
        price = await this.fetchPriceFromGeckoTerminal(contractAddress);
      }

      // Fallback to CoinGecko if GeckoTerminal didn't work
      if (!price) {
        price = await this.fetchPriceFromCoinGecko(symbol);
      }

      if (price) {
        // Cache the price
        priceCache.set(cacheKey, { price, timestamp: now });
        return price;
      }

      return null;
    } catch (error) {
      logger.warn({ err: error, symbol }, 'Error fetching price');
      return null;
    }
  }

  private async fetchPriceFromGeckoTerminal(contractAddress: string): Promise<TokenPrice | null> {
    try {
      // Use GeckoTerminal API to get token price by contract address
      const response = await fetch(
        `https://api.geckoterminal.com/api/v2/networks/base/tokens/${contractAddress}`,
        {
          headers: {
            'accept': 'application/json'
          }
        }
      );

      if (!response.ok) {
        logger.warn({ statusText: response.statusText, contractAddress }, 'Failed to fetch price from GeckoTerminal');
        return null;
      }

      const data = await response.json() as {
        data: {
          attributes: {
            price_usd: string;
            symbol: string;
            name: string;
          };
        };
      };
      
      if (data.data && data.data.attributes && data.data.attributes.price_usd) {
        const priceUsd = parseFloat(data.data.attributes.price_usd);
        return {
          usd: priceUsd,
          usd_24h_change: 0, // GeckoTerminal doesn't provide 24h change in this endpoint
        };
      }

      return null;
    } catch (error) {
      logger.warn({ err: error, contractAddress }, 'Error fetching price from GeckoTerminal');
      return null;
    }
  }

  private async fetchPriceFromCoinGecko(symbol: string): Promise<TokenPrice | null> {
    try {
      // Use CoinGecko API to get token prices
      const response = await fetch(
        `https://api.coingecko.com/api/v3/simple/price?ids=${this.getCoinGeckoId(symbol)}&vs_currencies=usd&include_24hr_change=true`
      );

      if (!response.ok) {
        logger.warn({ statusText: response.statusText, symbol }, 'Failed to fetch price from CoinGecko');
        return null;
      }

      const data = await response.json() as Record<string, { usd: number; usd_24h_change?: number }>;
      const coinId = this.getCoinGeckoId(symbol);
      
      if (data[coinId]) {
        return {
          usd: data[coinId].usd,
          usd_24h_change: data[coinId].usd_24h_change || 0,
        };
      }

      return null;
    } catch (error) {
      logger.warn({ err: error, symbol }, 'Error fetching price from CoinGecko');
      return null;
    }
  }

  private getCoinGeckoId(symbol: string): string {
    // Map common token symbols to CoinGecko IDs
    const symbolToId: Record<string, string> = {
      "ETH": "ethereum",
      "WETH": "ethereum", // WETH price is same as ETH
      "USDC": "usd-coin",
      "USDT": "tether",
      "DAI": "dai",
      "WBTC": "wrapped-bitcoin",
      "LINK": "chainlink",
      "UNI": "uniswap",
      "AAVE": "aave",
      "COMP": "compound-governance-token",
      "CRV": "curve-dao-token",
      "YFI": "yearn-finance",
      "SNX": "havven",
      "MKR": "maker",
      "BAL": "balancer",
      "SUSHI": "sushi",
      "1INCH": "1inch",
      "ZRX": "0x",
      "BAT": "basic-attention-token",
      "REP": "augur",
      "ZEC": "zcash",
      "DASH": "dash",
      "LTC": "litecoin",
      "BCH": "bitcoin-cash",
      "XRP": "ripple",
      "ADA": "cardano",
      "DOT": "polkadot",
      "SOL": "solana",
      "MATIC": "matic-network",
      "AVAX": "avalanche-2",
      "FTM": "fantom",
      "NEAR": "near",
      "ALGO": "algorand",
      "ATOM": "cosmos",
      "ICP": "internet-computer",
      "FIL": "filecoin",
      "TRX": "tron",
      "EOS": "eos",
      "XLM": "stellar",
      "VET": "vechain",
      "THETA": "theta-token",
      "XTZ": "tezos",
      "NEO": "neo",
      "IOTA": "iota",
      "XMR": "monero",
      "DOGE": "dogecoin",
      "SHIB": "shiba-inu",
      "LUNC": "terra-luna",
      "LUNA": "terra-luna-2",
      "UST": "terrausd",
      "BUSD": "binance-usd",
      "BNB": "binancecoin",
      "CAKE": "pancakeswap-token",
      "CHZ": "chiliz",
      "HOT": "holochain",
      "ENJ": "enjincoin",
      "MANA": "decentraland",
      "SAND": "the-sandbox",
      "AXS": "axie-infinity",
      "GALA": "gala",
      "ROBLOX": "roblox",
      "GODS": "gods-unchained",
      "IMX": "immutable-x",
      "OP": "optimism",
      "ARB": "arbitrum",
      "MAGIC": "magic",
      "PEPE": "pepe",
      "WIF": "dogwifhat",
      "BONK": "bonk",
      "JUP": "jupiter",
      "PYTH": "pyth-network",
      "JTO": "jito",
      "W": "wormhole",
      "STRK": "starknet",
      "BLAST": "blast",
      "MODE": "mode",
      "ZORA": "zora",
      "BASE": "base",
      "LINEA": "linea",
      "SCROLL": "scroll",
      "POLYGON": "matic-network",
      "ARBITRUM": "arbitrum",
      "OPTIMISM": "optimism",
      "ETHEREUM": "ethereum",
      "BITCOIN": "bitcoin",
      "BTC": "bitcoin",
    };

    return symbolToId[symbol] || symbol.toLowerCase();
  }

  private async fetchTokenMetadata(contractAddress: `0x${string}`) {
    if (contractAddress === "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE") {
      return {
        name: "Ethereum",
        symbol: "ETH",
        decimals: 18,
      };
    }

    if (tokenCache.has(contractAddress)) {
      logger.info({ contractAddress }, 'Using cached token metadata');
      return tokenCache.get(contractAddress);
    }

    try {
      const { publicClient } = initializeClient();

      logger.info({ contractAddress }, 'Fetching token metadata');

      // Try to get token info from a known token list first
      const knownToken = this.getKnownTokenInfo(contractAddress);
      if (knownToken) {
        logger.info({ name: knownToken.name, symbol: knownToken.symbol }, 'Found known token');
        tokenCache.set(contractAddress, knownToken);
        return knownToken;
      }

      logger.info('Token not in known list, fetching from blockchain...');

      // Try to fetch metadata with individual calls and better error handling
      let name = "Unknown Token";
      let symbol = "UNKNOWN";
      let decimals = 18;

      try {
        name = await Promise.race([
          publicClient.readContract({
            address: contractAddress,
            abi: erc20Abi,
            functionName: "name",
          }) as Promise<string>,
          new Promise<string>((_, reject) => 
            setTimeout(() => reject(new Error('Name fetch timeout')), 10000)
          )
        ]);
        logger.info({ name }, 'Fetched token name');
      } catch (nameError) {
        logger.warn({ err: nameError, contractAddress }, 'Failed to fetch token name');
      }

      try {
        symbol = await Promise.race([
          publicClient.readContract({
            address: contractAddress,
            abi: erc20Abi,
            functionName: "symbol",
          }) as Promise<string>,
          new Promise<string>((_, reject) => 
            setTimeout(() => reject(new Error('Symbol fetch timeout')), 10000)
          )
        ]);
        logger.info({ symbol }, 'Fetched token symbol');
      } catch (symbolError) {
        logger.warn({ err: symbolError, contractAddress }, 'Failed to fetch token symbol');
      }

      try {
        decimals = Number(await Promise.race([
          publicClient.readContract({
            address: contractAddress,
            abi: erc20Abi,
            functionName: "decimals",
          }),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Decimals fetch timeout')), 10000)
          )
        ]));
        logger.info({ decimals }, 'Fetched token decimals');
      } catch (decimalsError) {
        logger.warn({ err: decimalsError, contractAddress }, 'Failed to fetch token decimals');
      }

      const metadata: TokenMetadata = {
        name: name || "Unknown Token",
        symbol: symbol || "UNKNOWN",
        decimals: decimals || 18,
      };

      logger.info({ contractAddress, metadata }, 'Final token metadata');
      tokenCache.set(contractAddress, metadata);
      return metadata;
    } catch (error) {
      logger.warn({ err: error, contractAddress }, 'Failed to fetch token metadata');
      const fallback = {
        name: "Unknown Token",
        symbol: "UNKNOWN",
        decimals: 18,
      };

      tokenCache.set(contractAddress, fallback);
      return fallback;
    }
  }
  private getKnownTokenInfo(contractAddress: string): TokenMetadata | null {
    // Known token addresses for Base network
    const knownTokens: Record<string, TokenMetadata> = {
      "0x4200000000000000000000000000000000000006": {
        name: "Wrapped Ether",
        symbol: "WETH",
        decimals: 18,
      },
      "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913": {
        name: "USD Coin",
        symbol: "USDC",
        decimals: 6,
      },
      "0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA": {
        name: "Tether USD",
        symbol: "USDT",
        decimals: 6,
      },
      "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb": {
        name: "Dai Stablecoin",
        symbol: "DAI",
        decimals: 18,
      },
      "0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22": {
        name: "Coinbase Wrapped Staked ETH",
        symbol: "cbETH",
        decimals: 18,
      },
      "0x907bdae00e91544A270694714832410aD8418888": {
        name: "usezoracle",
        symbol: "usezoracle",
        decimals: 18,
      },
    };

    return knownTokens[contractAddress.toLowerCase()] || null;
  }

  private formatAmount(amount: string, decimals: number): string {
    try {
      const divisor = BigInt(10 ** decimals);
      const amountBigInt = BigInt(amount);
      const wholePart = amountBigInt / divisor;
      const fractionalPart = amountBigInt % divisor;

      const fractionalStr = fractionalPart.toString().padStart(decimals, "0");
      const trimmedFractional = fractionalStr.replace(/0+$/, "") || "0";

      return `${wholePart.toString()}.${trimmedFractional}`;
    } catch (error) {
      logger.warn({ err: error, amount, decimals }, 'Failed to format amount with decimals');
      return "0.0";
    }
  }
}
