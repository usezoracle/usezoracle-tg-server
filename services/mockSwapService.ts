/**
 * MockSwapService - A mock implementation of the swap service for testing
 * Focuses specifically on testing the 5% fee calculation logic
 */

export class MockSwapService {
  private static instance: MockSwapService;
  
  // Fee constants - these match the real implementation
  private readonly FEE_PERCENTAGE = 5; // 5% swap fee
  private readonly FEE_RECIPIENT = "0x27cEe32550DcC30De5a23551bAF7de2f3b0b98A0";

  private constructor() {
    console.log("Using MockSwapService for testing");
  }

  static getInstance(): MockSwapService {
    if (!MockSwapService.instance) {
      MockSwapService.instance = new MockSwapService();
    }
    return MockSwapService.instance;
  }

  /**
   * Mock implementation of getSwapPrice that focuses on fee calculation
   */
  async getSwapPrice(params: {
    accountName: string;
    fromToken: string;
    toToken: string;
    fromAmount: string;
    network: string;
  }) {
    try {
      // Mock account lookup - in a real implementation, this would check if the account exists
      console.log(`Looking up account: ${params.accountName}`);
      
      // Convert amount to BigInt for accurate calculation
      const fromAmount = BigInt(params.fromAmount);
      
      // Simulate swap price API call with mock data
      // In this example, we're assuming a fixed exchange rate for simplicity
      const exchangeRate = 1.8; // 1 fromToken = 1.8 toToken
      
      // Calculate mock toAmount (would be returned by CDP API in real implementation)
      const grossAmount = BigInt(Math.floor(Number(fromAmount) * exchangeRate));
      
      // 1% slippage for minToAmount simulation
      const minGrossAmount = grossAmount - (grossAmount * BigInt(1) / BigInt(100));
      
      // Calculate the 5% fee amount
      const feeAmount = (grossAmount * BigInt(this.FEE_PERCENTAGE)) / BigInt(100);
      const netAmount = grossAmount - feeAmount;
      
      // Calculate min amount after fee
      const minFeeAmount = (minGrossAmount * BigInt(this.FEE_PERCENTAGE)) / BigInt(100);
      const minNetAmount = minGrossAmount - minFeeAmount;
      
      // Return simulated response with fee calculation
      return {
        success: true,
        data: {
          liquidityAvailable: true,
          fromAmount: fromAmount.toString(),
          toAmount: netAmount.toString(), // Amount after fee deduction
          minToAmount: minNetAmount.toString(), // Min amount after fee deduction
          grossAmount: grossAmount.toString(), // Total amount before fee
          feeAmount: feeAmount.toString(),
          feePercentage: this.FEE_PERCENTAGE,
          feeRecipient: this.FEE_RECIPIENT,
          expectedOutputFormatted: this.formatAmount(netAmount.toString()),
          minOutputFormatted: this.formatAmount(minNetAmount.toString()),
          exchangeRate: this.calculateExchangeRate(fromAmount, netAmount),
          // Add token details for clarity in testing
          fromToken: params.fromToken,
          toToken: params.toToken,
          network: params.network
        },
        message: "Swap price estimated successfully (includes 5% fee)"
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to get swap price: ${(error as Error).message}`,
        message: "Error calculating swap price"
      };
    }
  }

  /**
   * Mock implementation of executeSwap that focuses on fee calculation
   */
  async executeSwap(params: {
    accountName: string;
    fromToken: string;
    toToken: string;
    fromAmount: string;
    slippageBps?: number;
    network: string;
  }) {
    try {
      // Mock account lookup
      console.log(`Looking up account: ${params.accountName}`);
      
      // Convert amount to BigInt for accurate calculation
      const fromAmount = BigInt(params.fromAmount);
      
      // Simulate swap execution with mock data
      const exchangeRate = 1.8; // 1 fromToken = 1.8 toToken
      
      // Calculate mock received amount (would come from blockchain in real implementation)
      const grossAmount = BigInt(Math.floor(Number(fromAmount) * exchangeRate));
      
      // Calculate the 5% fee amount
      const feeAmount = (grossAmount * BigInt(this.FEE_PERCENTAGE)) / BigInt(100);
      const netAmount = grossAmount - feeAmount;
      
      console.log(`Mock swap execution:`);
      console.log(`- From: ${params.fromAmount} ${params.fromToken}`);
      console.log(`- Gross receive: ${this.formatAmount(grossAmount.toString())} ${params.toToken}`);
      console.log(`- Fee (${this.FEE_PERCENTAGE}%): ${this.formatAmount(feeAmount.toString())} ${params.toToken}`);
      console.log(`- Net receive: ${this.formatAmount(netAmount.toString())} ${params.toToken}`);
      console.log(`- Fee recipient: ${this.FEE_RECIPIENT}`);
      
      // Simulate sending fee to the recipient
      console.log(`Mock fee transfer of ${this.formatAmount(feeAmount.toString())} ${params.toToken} to ${this.FEE_RECIPIENT}`);
      
      // Return simulated response with transaction data
      return {
        success: true,
        data: {
          transactionHash: "0x" + Math.random().toString(16).substring(2, 66), // Random mock transaction hash
          fromAmount: fromAmount.toString(),
          toAmount: netAmount.toString(), // Amount after fee deduction
          grossAmount: grossAmount.toString(), // Total amount before fee
          feeAmount: feeAmount.toString(),
          feePercentage: this.FEE_PERCENTAGE,
          feeRecipient: this.FEE_RECIPIENT,
          amountReceived: this.formatAmount(netAmount.toString()),
          network: params.network
        },
        message: "Swap executed successfully with 5% fee"
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to execute swap: ${(error as Error).message}`,
        message: "Error executing swap"
      };
    }
  }

  /**
   * Mock implementation of common tokens
   */
  getCommonTokens(network: string) {
    const tokens: Record<string, Record<string, string>> = {
      "base": {
        "ETH": "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
        "WETH": "0x4200000000000000000000000000000000000006",
        "USDC": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        "USDT": "0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA"
      },
      "ethereum": {
        "ETH": "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
        "WETH": "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
        "USDC": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
        "USDT": "0xdAC17F958D2ee523a2206206994597C13D831ec7"
      },
      "base-sepolia": {
        "ETH": "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
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