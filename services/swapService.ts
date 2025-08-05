import { CdpClient } from "@coinbase/cdp-sdk";
import {
  parseUnits,
  createPublicClient,
  http,
  erc20Abi,
  encodeFunctionData,
  formatEther,
  type Address,
} from "viem";
import { base } from "viem/chains";

// Define supported networks
type EvmSwapsNetwork = "base" | "ethereum";

// Permit2 contract address is the same across all networks
const PERMIT2_ADDRESS: Address = "0x000000000022D473030F116dDEE9F6B43aC78BA3";

export class SwapService {
  private static instance: SwapService;
  private cdp: CdpClient | null = null;
  private publicClient: any = null;

  private constructor() {
    // Initialize viem public client for transaction monitoring
    this.publicClient = createPublicClient({
      chain: base,
      transport: http("https://base-mainnet.g.alchemy.com/v2/dnbpgJAxbCT9dbs-cHKAXVSYLNYDrt_n"),
    });
  }

  private initializeCdp() {
    if (!this.cdp) {
      this.cdp = new CdpClient({
        apiKeyId: process.env.CDP_API_KEY_ID,
        apiKeySecret: process.env.CDP_API_KEY_SECRET,
        walletSecret: process.env.CDP_WALLET_SECRET,
      });
    }
  }

  static getInstance(): SwapService {
    if (!SwapService.instance) {
      SwapService.instance = new SwapService();
    }
    return SwapService.instance;
  }

  /**
   * Get price estimate for a swap
   */
  async getSwapPrice(params: {
    accountName: string;
    fromToken: string;
    toToken: string;
    fromAmount: string;
    network: EvmSwapsNetwork;
  }) {
    try {
      this.initializeCdp();
      // Get the account
      const account = await this.cdp!.evm.getAccount({
        name: params.accountName,
      });

      // Convert amount to BigInt
      const fromAmount = BigInt(params.fromAmount);

      // Get swap price
      const swapPrice = await this.cdp!.evm.getSwapPrice({
        fromToken: params.fromToken as `0x${string}`,
        toToken: params.toToken as `0x${string}`,
        fromAmount,
        network: params.network,
        taker: account.address,
      });

      // Check if liquidity is available
      if (!swapPrice.liquidityAvailable) {
        return {
          success: false,
          error: "No liquidity available for this swap",
          message: "Insufficient liquidity for this swap",
        };
      }

      return {
        success: true,
        data: {
          liquidityAvailable: true,
          fromAmount: swapPrice.fromAmount.toString(),
          toAmount: swapPrice.toAmount.toString(),
          minToAmount: swapPrice.minToAmount.toString(),
          expectedOutputFormatted: this.formatAmount(swapPrice.toAmount.toString()),
          minOutputFormatted: this.formatAmount(swapPrice.minToAmount.toString()),
          exchangeRate: this.calculateExchangeRate(
            swapPrice.fromAmount,
            swapPrice.toAmount
          ),
        },
        message: "Swap price estimated successfully",
      };
    } catch (error) {
      throw new Error(`Failed to get swap price: ${(error as Error).message}`);
    }
  }

  /**
   * Execute a swap between tokens
   * Handles token allowance checking and approval automatically
   */
  async executeSwap(params: {
    accountName: string;
    fromToken: string;
    toToken: string;
    fromAmount: string;
    slippageBps?: number;
    network: EvmSwapsNetwork;
  }) {
    try {
      this.initializeCdp();
      // Get the account
      const account = await this.cdp!.evm.getAccount({
        name: params.accountName,
      });

      // Convert amount to BigInt
      const fromAmount = BigInt(params.fromAmount);

      // Check if fromToken is native ETH
      const isNativeAsset = params.fromToken.toLowerCase() === "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";

      console.log(
        `Executing swap: ${fromAmount.toString()} ${params.fromToken} -> ${
          params.toToken
        } on network: ${params.network}`
      );

      // Handle token allowance check and approval if needed (only for non-native assets)
      if (!isNativeAsset) {
        await this.handleTokenAllowance(
          account.address as Address,
          params.fromToken as Address,
          fromAmount,
          params.network
        );
      }

      // Execute swap
      console.log(`Initiating swap transaction...`);
      const swapResult = await account.swap({
        network: params.network,
        fromToken: params.fromToken as `0x${string}`,
        toToken: params.toToken as `0x${string}`,
        fromAmount,
        slippageBps: params.slippageBps || 100, // Default 1% slippage tolerance
      });

      console.log(`Swap executed successfully: ${swapResult.transactionHash}`);

      // Wait for transaction confirmation
      console.log(`Waiting for transaction confirmation...`);
      const receipt = await this.publicClient.waitForTransactionReceipt({
        hash: swapResult.transactionHash,
      });

      // Ensure all BigInt values are converted to strings
      const blockNumber = receipt.blockNumber.toString();
      const gasUsed = receipt.gasUsed.toString();

      // Create response object with all BigInt values converted to strings
      const responseData = {
        transactionHash: swapResult.transactionHash,
        fromAmount: fromAmount.toString(),
        network: params.network,
        blockNumber: blockNumber,
        gasUsed: gasUsed,
        status: receipt.status === "success" ? "Success" : "Failed",
        transactionExplorer: `https://basescan.org/tx/${swapResult.transactionHash}`,
      };

      // Helper function to serialize BigInt values
      const serializeBigInts = (obj: any): any => {
        if (obj === null || obj === undefined) {
          return obj;
        }
        
        if (typeof obj === 'bigint') {
          return obj.toString();
        }
        
        if (Array.isArray(obj)) {
          return obj.map(serializeBigInts);
        }
        
        if (typeof obj === 'object') {
          const result: any = {};
          for (const [key, value] of Object.entries(obj)) {
            result[key] = serializeBigInts(value);
          }
          return result;
        }
        
        return obj;
      };

      // Serialize any BigInt values in the response
      const serializedData = serializeBigInts(responseData);

      return {
        success: true,
        data: serializedData,
        message: "Swap executed successfully",
      };
    } catch (error) {
      console.error("Swap execution error:", error);
      
      // Handle specific error cases
      if ((error as Error).message?.includes("Insufficient liquidity")) {
        throw new Error("Insufficient liquidity for this swap pair or amount. Try reducing the swap amount or using a different token pair.");
      }
      
      if ((error as Error).message?.includes("Request timed out")) {
        throw new Error("Swap request timed out. Please try again with a smaller amount or check network conditions.");
      }
      
      if ((error as Error).message?.includes("Invalid request")) {
        throw new Error("Invalid swap request. Please check token addresses and amounts.");
      }
      
      throw new Error(`Failed to execute swap: ${(error as Error).message}`);
    }
  }

  /**
   * Handles token allowance check and approval if needed
   * @param ownerAddress - The address of the token owner
   * @param tokenAddress - The address of the token to be sent
   * @param fromAmount - The amount to be sent
   * @param network - The network to perform the operation on
   * @returns A promise that resolves when allowance is sufficient
   */
  private async handleTokenAllowance(
    ownerAddress: Address,
    tokenAddress: Address,
    fromAmount: bigint,
    network: EvmSwapsNetwork
  ): Promise<void> {
    // Check allowance before attempting the swap
    const currentAllowance = await this.getAllowance(
      ownerAddress,
      tokenAddress
    );

    // If allowance is insufficient, approve tokens
    if (currentAllowance < fromAmount) {
      console.log(
        `\nAllowance insufficient. Current: ${currentAllowance.toString()}, Required: ${fromAmount.toString()}`
      );

      // Set the allowance to the required amount
      await this.approveTokenAllowance(
        ownerAddress,
        tokenAddress,
        fromAmount,
        network
      );
      console.log(`Set allowance to ${fromAmount.toString()}`);
    } else {
      console.log(
        `\nToken allowance sufficient. Current: ${currentAllowance.toString()}, Required: ${fromAmount.toString()}`
      );
    }
  }

  /**
   * Handle approval for token allowance if needed
   * @param ownerAddress - The token owner's address
   * @param tokenAddress - The token contract address
   * @param amount - The amount to approve
   * @returns The transaction receipt
   */
  private async approveTokenAllowance(
    ownerAddress: Address,
    tokenAddress: Address,
    amount: bigint,
    network: EvmSwapsNetwork
  ) {
    console.log(
      `\nApproving token allowance for ${tokenAddress} to spender ${PERMIT2_ADDRESS}`
    );

    // Encode the approve function call
    const data = encodeFunctionData({
      abi: erc20Abi,
      functionName: "approve",
      args: [PERMIT2_ADDRESS, amount],
    });

    // Send the approve transaction
    const txResult = await this.cdp!.evm.sendTransaction({
      address: ownerAddress,
      network: network,
      transaction: {
        to: tokenAddress,
        data,
        value: BigInt(0),
      },
    });

    console.log(`Approval transaction hash: ${txResult.transactionHash}`);

    // Wait for approval transaction to be confirmed
    const receipt = await this.publicClient.waitForTransactionReceipt({
      hash: txResult.transactionHash,
    });

    console.log(`Approval confirmed in block ${receipt.blockNumber} ✅`);
    return receipt;
  }

  /**
   * Check token allowance for the Permit2 contract
   * @param owner - The token owner's address
   * @param token - The token contract address
   * @returns The current allowance
   */
  private async getAllowance(
    owner: Address,
    token: Address
  ): Promise<bigint> {
    console.log(
      `\nChecking allowance for token (${token}) to Permit2 contract...`
    );

    try {
      const allowance = await this.publicClient.readContract({
        address: token,
        abi: erc20Abi,
        functionName: "allowance",
        args: [owner, PERMIT2_ADDRESS],
      });

      console.log(`Current allowance: ${allowance.toString()}`);
      return allowance;
    } catch (error) {
      console.error("Error checking allowance:", error);
      return BigInt(0);
    }
  }

  /**
   * Get or create an account
   */
  async getOrCreateAccount(name: string) {
    try {
      this.initializeCdp();
      const account = await this.cdp!.evm.getOrCreateAccount({ name });
      return {
        success: true,
        data: account,
        message: `Account ${name} retrieved or created successfully`,
      };
    } catch (error) {
      throw new Error(
        `Failed to get or create account: ${(error as Error).message}`
      );
    }
  }

  /**
   * List common token addresses
   * This is a helper function that returns common token addresses for ease of use
   */
  getCommonTokens(network: EvmSwapsNetwork | "base-sepolia") {
    const tokens: Record<string, Record<string, string>> = {
      base: {
        ETH: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE", // Native ETH
        WETH: "0x4200000000000000000000000000000000000006",
        USDC: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        USDT: "0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA",
      },
      ethereum: {
        ETH: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE", // Native ETH
        WETH: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
        USDC: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
        USDT: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
      },
      "base-sepolia": {
        ETH: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE", // Native ETH
        WETH: "0x4200000000000000000000000000000000000006",
        USDC: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      },
    };

    return tokens[network] || {};
  }

  /**
   * Format amount for better readability
   */
  private formatAmount(amount: string, decimals: number = 18): string {
    try {
      const amountBigInt = BigInt(amount);
      const divisor = BigInt(10 ** decimals);
      const wholePart = amountBigInt / divisor;
      const fractionalPart = amountBigInt % divisor;

      const fractionalStr = fractionalPart.toString().padStart(decimals, "0");
      const trimmedFractional = fractionalStr.replace(/0+$/, "") || "0";

      return `${wholePart.toString()}.${trimmedFractional}`;
    } catch (error) {
      console.warn(
        `Failed to format amount ${amount}: ${(error as Error).message}`
      );
      return "0.0";
    }
  }

  /**
   * Calculate exchange rate between tokens
   */
  private calculateExchangeRate(fromAmount: bigint, toAmount: bigint): string {
    if (fromAmount === BigInt(0)) return "0";

    // Calculate how much of toToken you get for 1 unit of fromToken
    const rate = Number(toAmount) / Number(fromAmount);
    return rate.toFixed(8);
  }
}
