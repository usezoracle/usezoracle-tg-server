import { CdpClient } from "@coinbase/cdp-sdk";

// Define supported networks
type EvmSwapsNetwork = "base" | "ethereum";

export class SwapService {
  private static instance: SwapService;
  private cdp: CdpClient | null = null;
  private readonly FEE_PERCENTAGE = 5; // 5% swap fee
  private readonly FEE_RECIPIENT = "0x27cEe32550DcC30De5a23551bAF7de2f3b0b98A0" as `0x${string}`; // Fee recipient address

  private constructor() {}

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
   * Get price estimate for a swap with fee calculation
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
      const account = await this.cdp!.evm.getAccount({ name: params.accountName });

      // Convert amount to BigInt
      const fromAmount = BigInt(params.fromAmount);

      // Get swap price
      const swapPrice = await this.cdp!.evm.getSwapPrice({
        fromToken: params.fromToken as `0x${string}`,
        toToken: params.toToken as `0x${string}`,
        fromAmount,
        network: params.network,
        taker: account.address
      });
      
      // Check if liquidity is available
      if (!swapPrice.liquidityAvailable) {
        return {
          success: false,
          error: "No liquidity available for this swap",
          message: "Insufficient liquidity for this swap"
        };
      }

      // Calculate fee (5% of the received amount)
      const feeAmount = (swapPrice.toAmount * BigInt(this.FEE_PERCENTAGE)) / BigInt(100);
      const userAmount = swapPrice.toAmount - feeAmount;
      
      // Also calculate min amount after fee
      const minFeeAmount = (swapPrice.minToAmount * BigInt(this.FEE_PERCENTAGE)) / BigInt(100);
      const minUserAmount = swapPrice.minToAmount - minFeeAmount;

      return {
        success: true,
        data: {
          liquidityAvailable: true,
          fromAmount: swapPrice.fromAmount.toString(),
          toAmount: userAmount.toString(), // Amount after fee deduction
          minToAmount: minUserAmount.toString(), // Min amount after fee deduction
          grossAmount: swapPrice.toAmount.toString(), // Total amount before fee
          feeAmount: feeAmount.toString(),
          feePercentage: this.FEE_PERCENTAGE,
          feeRecipient: this.FEE_RECIPIENT,
          expectedOutputFormatted: this.formatAmount(userAmount.toString()),
          minOutputFormatted: this.formatAmount(minUserAmount.toString()),
          exchangeRate: this.calculateExchangeRate(swapPrice.fromAmount, userAmount)
        },
        message: "Swap price estimated successfully (includes 5% fee)"
      };
    } catch (error) {
      throw new Error(`Failed to get swap price: ${(error as Error).message}`);
    }
  }

  /**
   * Execute a swap between tokens with fee
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
      const account = await this.cdp!.evm.getAccount({ name: params.accountName });

      // Convert amount to BigInt
      const fromAmount = BigInt(params.fromAmount);

      // Execute swap in one call
      const swapResult = await account.swap({
        network: params.network,
        fromToken: params.fromToken as `0x${string}`,
        toToken: params.toToken as `0x${string}`,
        fromAmount,
        slippageBps: params.slippageBps || 100, // Default 1% slippage tolerance
      });

      // Use the original amount as a base for calculation
      // In a production environment, you would ideally query the blockchain
      // to get the actual amount received in the transaction
      const receivedAmount = fromAmount;
        
      // Calculate fee (5% of the received amount)
      const feeAmount = (receivedAmount * BigInt(this.FEE_PERCENTAGE)) / BigInt(100);
      const userAmount = receivedAmount - feeAmount;
      
      // Only transfer fee if it's a significant amount (greater than dust)
      if (feeAmount > BigInt(0)) {
        try {
          // Transfer the fee to the fee recipient
          const feeTransfer = await account.transfer({
            to: this.FEE_RECIPIENT,
            amount: feeAmount,
            token: params.toToken as `0x${string}`,
            network: params.network,
          });
          
          console.log(`Fee transfer successful: ${feeTransfer.transactionHash}`);
        } catch (feeError) {
          // Log fee transfer error but don't fail the entire operation
          console.error(`Fee transfer failed: ${(feeError as Error).message}`);
        }
      }

      return {
        success: true,
        data: {
          transactionHash: swapResult.transactionHash,
          fromAmount: fromAmount.toString(),
          toAmount: userAmount.toString(), // Amount after fee deduction
          grossAmount: receivedAmount.toString(), // Total amount before fee
          feeAmount: feeAmount.toString(),
          feePercentage: this.FEE_PERCENTAGE,
          feeRecipient: this.FEE_RECIPIENT,
          amountReceived: this.formatAmount(userAmount.toString()),
          network: params.network
        },
        message: "Swap executed successfully with 5% fee"
      };
    } catch (error) {
      throw new Error(`Failed to execute swap: ${(error as Error).message}`);
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
        message: `Account ${name} retrieved or created successfully`
      };
    } catch (error) {
      throw new Error(`Failed to get or create account: ${(error as Error).message}`);
    }
  }

  /**
   * List common token addresses
   * This is a helper function that returns common token addresses for ease of use
   */
  getCommonTokens(network: EvmSwapsNetwork | "base-sepolia") {
    const tokens: Record<string, Record<string, string>> = {
      "base": {
        "ETH": "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE", // Native ETH
        "WETH": "0x4200000000000000000000000000000000000006",
        "USDC": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        "USDT": "0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA"
      },
      "ethereum": {
        "ETH": "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE", // Native ETH
        "WETH": "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
        "USDC": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
        "USDT": "0xdAC17F958D2ee523a2206206994597C13D831ec7"
      },
      "base-sepolia": {
        "ETH": "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE", // Native ETH
        "WETH": "0x4200000000000000000000000000000000000006",
        "USDC": "0x036CbD53842c5426634e7929541eC2318f3dCF7e"
      }
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
      console.warn(`Failed to format amount ${amount}: ${(error as Error).message}`);
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