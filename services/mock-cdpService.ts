import { CdpClient } from "@coinbase/cdp-sdk";

export class MockCdpService {
  private static instance: MockCdpService;

  private constructor() {
    console.log("Using MockCdpService for development/testing");
  }

  static getInstance(): MockCdpService {
    if (!MockCdpService.instance) {
      MockCdpService.instance = new MockCdpService();
    }
    return MockCdpService.instance;
  }

  // Mock method for demonstration purposes
  async createAccount(name: string) {
    return {
      success: true,
      data: {
        id: "mock-account-id",
        name,
        address: "0xMockAddress123456789",
        createdAt: new Date().toISOString(),
      },
      message: `Mock account ${name} created successfully`,
    };
  }

  // Mock method for demonstration purposes
  async getAccount(name: string) {
    return {
      success: true,
      data: {
        id: "mock-account-id",
        name,
        address: "0xMockAddress123456789",
        createdAt: new Date().toISOString(),
      },
      message: `Mock account ${name} retrieved successfully`,
    };
  }

  // Mock method for demonstration purposes
  async listAccounts() {
    return {
      success: true,
      data: [
        {
          id: "mock-account-1",
          name: "mock-account-1",
          address: "0xMockAddress123456789",
          createdAt: new Date().toISOString(),
        },
        {
          id: "mock-account-2",
          name: "mock-account-2",
          address: "0xMockAddress987654321",
          createdAt: new Date().toISOString(),
        },
      ],
      message: "Mock accounts retrieved successfully",
    };
  }

  // Mock method for demonstration purposes
  async getBalances(accountName: string) {
    return {
      success: true,
      data: {
        account: accountName,
        network: "base",
        balances: [
          {
            token: {
              contractAddress: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
              name: "Ethereum",
              symbol: "ETH",
              decimals: 18,
            },
            amount: {
              raw: "1000000000000000000", // 1 ETH
              formatted: "1.0",
            },
          },
          {
            token: {
              contractAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
              name: "USD Coin",
              symbol: "USDC",
              decimals: 6,
            },
            amount: {
              raw: "1000000", // 1 USDC
              formatted: "1.0",
            },
          },
        ],
      },
      message: "Mock balances retrieved successfully",
    };
  }

  // Add a simple formatAmount method for completeness
  formatAmount(amount: string, decimals: number): string {
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
        (error as Error).message
      );
      return "0.0";
    }
  }
}