import { CdpClient } from "@coinbase/cdp-sdk";
import { parseEther } from "viem";

let cdp: CdpClient;

const initializeClient = () => {
  if (!cdp) {
    cdp = new CdpClient({
      apiKeyId: process.env.CDP_API_KEY_ID,
      apiKeySecret: process.env.CDP_API_KEY_SECRET,
      walletSecret: process.env.CDP_WALLET_SECRET,
    });
  }
  return cdp;
};

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
      const account = await cdp.evm.createAccount({ name });
      return {
        success: true,
        data: account,
        message: `Account ${name} created successfully`
      };
    } catch (error) {
      throw new Error(`Failed to create account: ${error.message}`);
    }
  }

  async getAccount(name: string) {
    try {
      const cdp = initializeClient();
      const account = await cdp.evm.getAccount({ name });
      return {
        success: true,
        data: account,
        message: `Account ${name} retrieved successfully`
      };
    } catch (error) {
      throw new Error(`Failed to get account: ${error.message}`);
    }
  }

  async listAccounts() {
    try {
      const cdp = initializeClient();
      const accounts = await cdp.evm.listAccounts();
      return {
        success: true,
        data: accounts,
        message: 'Accounts retrieved successfully'
      };
    } catch (error) {
      throw new Error(`Failed to list accounts: ${error.message}`);
    }
  }

  async sendTransaction(accountName: string, transactionData: {
    to: `0x${string}`;
    value: string;
    network?: "base" | "base-sepolia";
  }) {
    try {
      const account = await this.getAccount(accountName);
      const cdp = initializeClient();
      const { transactionHash } = await cdp.evm.sendTransaction({
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
        message: 'Transaction sent successfully'
      };
    } catch (error) {
      throw new Error(`Failed to send transaction: ${error.message}`);
    }
  }

  async transfer(accountName: string, transferData: {
    to: `0x${string}`;
    amount: string;
    token: "eth" | "usdc";
    network?: "base" | "base-sepolia";
  }) {
    try {
      const account = await this.getAccount(accountName);
      const { transactionHash } = await account.data.transfer({
        to: transferData.to,
        amount: parseEther(transferData.amount),
        token: transferData.token,
        network: transferData.network || "base"
      });

      return {
        success: true,
        data: { transactionHash },
        message: 'Transfer completed successfully'
      };
    } catch (error) {
      throw new Error(`Failed to transfer: ${error.message}`);
    }
  }
}
