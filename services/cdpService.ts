import { CdpClient } from "@coinbase/cdp-sdk";
import { createPublicClient, getContract, http, parseEther } from "viem";
import { base } from "viem/chains";

let cdp: CdpClient;
let publicClient: any;

const initializeClient = () => {
  if (!cdp) {
    cdp = new CdpClient({
      apiKeyId: process.env.CDP_API_KEY_ID,
      apiKeySecret: process.env.CDP_API_KEY_SECRET,
      walletSecret: process.env.CDP_WALLET_SECRET,
    });
  }

  if (!publicClient) {
    publicClient = createPublicClient({
      chain: base,
      transport: http(),
    });
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

const tokenCache = new Map();

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
      throw new Error(`Failed to create account: ${error.message}`);
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
      throw new Error(`Failed to get account: ${error.message}`);
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
      throw new Error(`Failed to list accounts: ${error.message}`);
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
      throw new Error(`Failed to send transaction: ${error.message}`);
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
      throw new Error(`Failed to transfer: ${error.message}`);
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

          return {
            token: {
              contractAddress: balance.token.contractAddress,
              name: metadata.name,
              symbol: metadata.symbol,
              decimals: metadata.decimals,
            },
            amount: {
              raw: balance.amount.amount.toString(),
              formatted: this.formatAmount(
                balance.amount.amount.toString(),
                metadata.decimals
              ),
            },
          };
        })
      );

      return {
        success: true,
        data: {
          account: accountName,
          network: "base",
          balances: enhancedBalances,
        },
        message: "Balances retrieved successfully",
      };
    } catch (error) {
      throw new Error("Failed to get balances: ", error.message);
    }
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
      return tokenCache.get(contractAddress);
    }

    try {
      const { publicClient } = initializeClient();

      // Use readContract method which is more reliable
      const [name, symbol, decimals] = await Promise.all([
        publicClient.readContract({
          address: contractAddress,
          abi: erc20Abi,
          functionName: "name",
        }) as Promise<string>,
        publicClient.readContract({
          address: contractAddress,
          abi: erc20Abi,
          functionName: "symbol",
        }) as Promise<string>,
        publicClient.readContract({
          address: contractAddress,
          abi: erc20Abi,
          functionName: "decimals",
        }) as Promise<number>,
      ]);

      const metadata: TokenMetadata = {
        name,
        symbol,
        decimals: Number(decimals),
      };

      tokenCache.set(contractAddress, metadata);
      return metadata;
    } catch (error) {
      console.warn(
        `Failed to fetch token metadata for ${contractAddress}:`,
        error.message
      );
      const fallback = {
        name: "Unknown Token",
        symbol: "UNKNOWN",
        decimals: 18,
      };

      tokenCache.set(contractAddress, fallback);
      return fallback;
    }
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
      console.warn(
        `Failed to format amount ${amount} with ${decimals} decimals:`,
        error
      );
      return "0.0";
    }
  }
}
