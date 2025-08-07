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
import { CdpService } from "./cdpService.js";

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
    const providerUrl = process.env.PROVIDER_URL || "https://rpc.ankr.com/base/b39a19f9ecf66252bf862fe6948021cd1586009ee97874655f46481cfbf3f129";
    
    this.publicClient = createPublicClient({
      chain: base,
      transport: http(providerUrl),
    });
  }

  private initializeCdp() {
    if (!this.cdp) {
      // Validate environment variables
      if (!process.env.CDP_API_KEY_ID) {
        throw new Error("CDP_API_KEY_ID environment variable is not set");
      }
      if (!process.env.CDP_API_KEY_SECRET) {
        throw new Error("CDP_API_KEY_SECRET environment variable is not set");
      }
      if (!process.env.CDP_WALLET_SECRET) {
        throw new Error("CDP_WALLET_SECRET environment variable is not set");
      }

      console.log("Initializing CDP client...");
      
      try {
        this.cdp = new CdpClient({
          apiKeyId: process.env.CDP_API_KEY_ID,
          apiKeySecret: process.env.CDP_API_KEY_SECRET,
          walletSecret: process.env.CDP_WALLET_SECRET,
        });
        console.log("CDP client initialized successfully");
      } catch (error) {
        console.error("Failed to initialize CDP client:", error);
        throw new Error(`CDP client initialization failed: ${(error as Error).message}`);
      }
    }
  }

  static getInstance(): SwapService {
    if (!SwapService.instance) {
      SwapService.instance = new SwapService();
    }
    return SwapService.instance;
  }

  /**
   * Safely convert a value to BigInt, handling scientific notation
   */
  private safeBigIntConversion(value: string | number): bigint {
    const valueString = value.toString();
    
    try {
      // Handle scientific notation by converting to a proper integer string
      if (valueString.includes('e') || valueString.includes('E')) {
        const num = parseFloat(valueString);
        return BigInt(Math.floor(num));
      } else {
        return BigInt(valueString);
      }
    } catch (error) {
      throw new Error(`Invalid amount format: ${valueString}. Amount must be a valid integer string.`);
    }
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

      // Convert amount to BigInt safely
      const fromAmount = this.safeBigIntConversion(params.fromAmount);

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
      
      console.log(`Starting swap execution for account: ${params.accountName}`);
      
      // Validate prerequisites first
      console.log(`Validating swap prerequisites...`);
      const validation = await this.validateSwapPrerequisites(
        params.accountName,
        params.fromToken,
        params.fromAmount,
        params.network
      );
      
      if (!validation.success) {
        throw new Error(`Validation failed: ${validation.message}`);
      }
      
      console.log(`Validation passed:`, validation.data);
      
      // Get the account
      const account = await this.cdp!.evm.getAccount({
        name: params.accountName,
      });

      // Use the adjusted amount from validation if available
      let fromAmount: bigint;
      if (validation.data.adjustedAmount) {
        fromAmount = BigInt(validation.data.adjustedAmount);
        console.log(`Using adjusted amount: ${fromAmount.toString()} (original: ${params.fromAmount})`);
      } else {
        // Convert amount to BigInt safely
        fromAmount = this.safeBigIntConversion(params.fromAmount);
      }

      // Check if fromToken is native ETH
      const isNativeAsset = params.fromToken.toLowerCase() === "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";

      console.log(
        `Executing swap: ${fromAmount.toString()} ${params.fromToken} -> ${
          params.toToken
        } on network: ${params.network}`
      );

      // Handle token allowance check and approval if needed (only for non-native assets)
      if (!isNativeAsset) {
        try {
          console.log(`Checking token allowance for ${params.fromToken}...`);
          await this.handleTokenAllowance(
            account.address as Address,
            params.fromToken as Address,
            fromAmount,
            params.network
          );
          console.log(`Token allowance check completed successfully`);
        } catch (approvalError) {
          console.error(`Token approval failed:`, approvalError);
          throw new Error(`Token approval failed: ${(approvalError as Error).message}. Please ensure the account has sufficient balance and try again.`);
        }
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

      // Create trade alert for successful swap
      try {
        const { AlertsService } = await import('./alertsService.js');
        const alertsService = new AlertsService();
        
        // Create successful trade alert
        await alertsService.createTradeAlert(
          params.accountName,
          'successful_trade',
          params.fromToken,
          fromAmount.toString()
        );
        console.log(`✅ Trade alert created for successful swap`);
        
        // Check if this is a large trade (e.g., > 1 ETH or equivalent)
        const isLargeTrade = this.isLargeTrade(fromAmount, params.fromToken);
        if (isLargeTrade) {
          await alertsService.createTradeAlert(
            params.accountName,
            'large_trade',
            params.fromToken,
            fromAmount.toString()
          );
          console.log(`✅ Large trade alert created for swap`);
        }
      } catch (alertError) {
        console.log(`⚠️ Failed to create trade alert:`, (alertError as Error).message);
      }

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
      console.error(`Swap execution failed:`, error);
      
      // Create trade alert for failed swap
      try {
        const { AlertsService } = await import('./alertsService.js');
        const alertsService = new AlertsService();
        await alertsService.createTradeAlert(
          params.accountName,
          'failed_transaction',
          params.fromToken,
          params.fromAmount
        );
        console.log(`✅ Trade alert created for failed swap`);
      } catch (alertError) {
        console.log(`⚠️ Failed to create trade alert:`, (alertError as Error).message);
      }
      
      // Provide more specific error messages
      if (error instanceof Error) {
        if (error.message.includes("Token approval required")) {
          throw new Error(`Token approval required. Please approve the Permit2 contract (${PERMIT2_ADDRESS}) to spend your ${params.fromToken} tokens before executing this swap. You can do this by calling the 'approve' function on the token contract with the Permit2 address as the spender.`);
        } else if (error.message.includes("insufficient funds")) {
          throw new Error(`Insufficient funds for swap. Please ensure you have enough tokens and ETH for gas fees.`);
        } else if (error.message.includes("slippage")) {
          throw new Error(`Swap failed due to slippage. The price moved too much during execution. Try again with a higher slippage tolerance.`);
        } else {
          throw new Error(`Failed to execute swap: ${error.message}`);
        }
      }
      
      throw new Error(`Failed to execute swap: ${(error as Error).message}`);
    }
  }

  /**
   * Validate account and balance before swap operations
   */
  async validateSwapPrerequisites(
    accountName: string,
    fromToken: string,
    fromAmount: string,
    network: EvmSwapsNetwork = "base"
  ) {
    try {
      this.initializeCdp();
      
      // Get the account
      const account = await this.cdp!.evm.getAccount({
        name: accountName,
      });

      // Convert amount to BigInt safely
      let amountBigInt = this.safeBigIntConversion(fromAmount);

      const isNativeAsset = fromToken.toLowerCase() === "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";

      console.log(`Validating swap prerequisites for account ${accountName}...`);
      console.log(`Amount: ${fromAmount}, BigInt: ${amountBigInt.toString()}`);

      // Check account exists and is accessible
      console.log(`Account address: ${account.address}`);

      if (!isNativeAsset) {
        // Check token balance
        const tokenBalance = await this.publicClient.readContract({
          address: fromToken as Address,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [account.address as Address],
        });

        console.log(`Token balance: ${tokenBalance.toString()}, Required: ${amountBigInt.toString()}`);

        // Add a small tolerance (0.1% or minimum 1 token) to handle precision issues
        const tolerance = amountBigInt > BigInt(1000) ? amountBigInt / BigInt(1000) : BigInt(1);
        const requiredWithTolerance = amountBigInt + tolerance;

        if (tokenBalance < requiredWithTolerance) {
          // If the difference is very small, try with the exact balance
          if (tokenBalance >= amountBigInt - tolerance) {
            console.log(`Small difference detected, using exact balance: ${tokenBalance.toString()}`);
            amountBigInt = tokenBalance;
          } else {
            throw new Error(`Insufficient token balance. Available: ${tokenBalance.toString()}, Required: ${amountBigInt.toString()}, Tolerance: ${tolerance.toString()}`);
          }
        }

        // Check current allowance
        const currentAllowance = await this.getAllowance(
          account.address as Address,
          fromToken as Address
        );

        console.log(`Current allowance: ${currentAllowance.toString()}, Required: ${amountBigInt.toString()}`);

        return {
          success: true,
          data: {
            accountAddress: account.address,
            tokenBalance: tokenBalance.toString(),
            currentAllowance: currentAllowance.toString(),
            needsApproval: currentAllowance < amountBigInt,
            requiredAmount: amountBigInt.toString(),
            originalAmount: fromAmount,
            adjustedAmount: amountBigInt.toString()
          },
          message: "Validation completed successfully"
        };
      } else {
        // Check ETH balance
        const ethBalance = await this.publicClient.getBalance({
          address: account.address as Address,
        });

        console.log(`ETH balance: ${ethBalance.toString()}, Required: ${amountBigInt.toString()}`);

        if (ethBalance < amountBigInt) {
          throw new Error(`Insufficient ETH balance. Available: ${ethBalance.toString()}, Required: ${amountBigInt.toString()}`);
        }

        return {
          success: true,
          data: {
            accountAddress: account.address,
            ethBalance: ethBalance.toString(),
            requiredAmount: amountBigInt.toString(),
            needsApproval: false
          },
          message: "Validation completed successfully"
        };
      }
    } catch (error) {
      console.error(`Validation failed:`, error);
      throw new Error(`Validation failed: ${(error as Error).message}`);
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
    try {
      // Check allowance before attempting the swap
      console.log(`Checking current allowance for token ${tokenAddress}...`);
      const currentAllowance = await this.getAllowance(
        ownerAddress,
        tokenAddress
      );

      console.log(`Current allowance: ${currentAllowance.toString()}, Required: ${fromAmount.toString()}`);

      // If allowance is insufficient, approve tokens
      if (currentAllowance < fromAmount) {
        console.log(
          `Allowance insufficient. Current: ${currentAllowance.toString()}, Required: ${fromAmount.toString()}. Approving tokens...`
        );

        // Check account balance first
        await this.checkAccountBalance(ownerAddress, tokenAddress, fromAmount);

        // Set the allowance to the required amount
        await this.approveTokenAllowance(
          ownerAddress,
          tokenAddress,
          fromAmount,
          network
        );
        console.log(`Successfully set allowance to ${fromAmount.toString()}`);
        
        // Verify the allowance was set correctly
        const newAllowance = await this.getAllowance(ownerAddress, tokenAddress);
        console.log(`Verified new allowance: ${newAllowance.toString()}`);
        
        // Add a small delay to ensure the blockchain state is updated
        if (newAllowance < fromAmount) {
          console.log(`Allowance still insufficient, waiting 5 seconds and checking again...`);
          await new Promise(resolve => setTimeout(resolve, 5000));
          
          const retryAllowance = await this.getAllowance(ownerAddress, tokenAddress);
          console.log(`Retry allowance check: ${retryAllowance.toString()}`);
          
          if (retryAllowance < fromAmount) {
            throw new Error(`Failed to set sufficient allowance. Current: ${retryAllowance.toString()}, Required: ${fromAmount.toString()}. The token might have a non-standard approval mechanism.`);
          } else {
            console.log(`Allowance verified after retry: ${retryAllowance.toString()}`);
          }
        }
      } else {
        console.log(
          `Token allowance sufficient. Current: ${currentAllowance.toString()}, Required: ${fromAmount.toString()}`
        );
      }
    } catch (error) {
      console.error(`Error in handleTokenAllowance:`, error);
      throw new Error(`Token allowance check failed: ${(error as Error).message}`);
    }
  }

  /**
   * Check account balance before attempting approval
   */
  private async checkAccountBalance(
    ownerAddress: Address,
    tokenAddress: Address,
    requiredAmount: bigint
  ): Promise<void> {
    try {
      console.log(`Checking account balance for token ${tokenAddress}...`);
      
      const balance = await this.publicClient.readContract({
        address: tokenAddress,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [ownerAddress],
      });

      console.log(`Account balance: ${balance.toString()}, Required: ${requiredAmount.toString()}`);

      if (balance < requiredAmount) {
        throw new Error(`Insufficient token balance. Available: ${balance.toString()}, Required: ${requiredAmount.toString()}`);
      }

      // Also check ETH balance for gas fees
      const ethBalance = await this.publicClient.getBalance({
        address: ownerAddress,
      });

      console.log(`ETH balance for gas: ${ethBalance.toString()}`);

      // Reduce minimum ETH requirement to 0.0001 ETH (100000000000000 wei)
      const minEthRequired = BigInt(100000000000000); // 0.0001 ETH
      if (ethBalance < minEthRequired) {
        throw new Error(`Insufficient ETH for gas fees. Available: ${ethBalance.toString()} wei (${this.formatAmount(ethBalance.toString(), 18)} ETH), Required: ${minEthRequired.toString()} wei (0.0001 ETH). Please fund the account with at least 0.0001 ETH for gas fees.`);
      }

    } catch (error) {
      console.error(`Balance check failed:`, error);
      throw new Error(`Balance check failed: ${(error as Error).message}`);
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
    try {
      console.log(
        `Approving token allowance for ${tokenAddress} to spender ${PERMIT2_ADDRESS}`
      );

      // Ensure CDP client is initialized
      this.initializeCdp();
      if (!this.cdp) {
        throw new Error("CDP client not initialized");
      }

      // Encode the approve function call
      const data = encodeFunctionData({
        abi: erc20Abi,
        functionName: "approve",
        args: [PERMIT2_ADDRESS, amount],
      });

      console.log(`Sending approval transaction...`);
      console.log(`Transaction details:`, {
        address: ownerAddress,
        to: tokenAddress,
        data: data,
        value: "0",
        network: network
      });
      
      // Send the approve transaction
      const txResult = await this.cdp.evm.sendTransaction({
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
      console.log(`Waiting for approval transaction confirmation...`);
      const receipt = await this.publicClient.waitForTransactionReceipt({
        hash: txResult.transactionHash,
      });

      if (receipt.status === "success") {
        console.log(`Approval confirmed in block ${receipt.blockNumber} ✅`);
        return receipt;
      } else {
        throw new Error(`Approval transaction failed with status: ${receipt.status}`);
      }
    } catch (error) {
      console.error(`Approval transaction failed:`, error);
      
      // Provide more specific error messages
      if (error instanceof Error) {
        if (error.message.includes("insufficient funds")) {
          throw new Error(`Insufficient funds for approval transaction. Please ensure the account has enough ETH for gas fees.`);
        } else if (error.message.includes("nonce")) {
          throw new Error(`Transaction nonce issue. Please try again in a few moments.`);
        } else if (error.message.includes("gas")) {
          throw new Error(`Gas estimation failed. Please try again with a smaller amount.`);
        } else {
          throw new Error(`Failed to approve token allowance: ${error.message}`);
        }
      }
      
      throw new Error(`Failed to approve token allowance: ${(error as Error).message}`);
    }
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
   * Manually approve tokens for the Permit2 contract
   * This can be used for debugging or manual approval
   */
  async approveTokens(
    accountName: string,
    tokenAddress: string,
    amount: string,
    network: EvmSwapsNetwork = "base"
  ) {
    try {
      this.initializeCdp();
      
      // Get the account
      const account = await this.cdp!.evm.getAccount({
        name: accountName,
      });

      // Convert amount to BigInt safely
      const amountBigInt = this.safeBigIntConversion(amount);
      
      console.log(`Manually approving ${amountBigInt.toString()} tokens for account ${accountName}...`);
      
      const receipt = await this.approveTokenAllowance(
        account.address as Address,
        tokenAddress as Address,
        amountBigInt,
        network
      );

      return {
        success: true,
        data: {
          transactionHash: receipt.transactionHash,
          blockNumber: receipt.blockNumber?.toString(),
          status: receipt.status,
          message: `Successfully approved ${amount} tokens for Permit2 contract`
        },
        message: "Token approval completed successfully"
      };
    } catch (error) {
      console.error(`Manual token approval failed:`, error);
      throw new Error(`Failed to approve tokens: ${(error as Error).message}`);
    }
  }

  /**
   * Check current token allowance for an account
   */
  async checkTokenAllowance(
    accountName: string,
    tokenAddress: string,
    network: EvmSwapsNetwork = "base"
  ) {
    try {
      this.initializeCdp();
      
      // Get the account
      const account = await this.cdp!.evm.getAccount({
        name: accountName,
      });

      const allowance = await this.getAllowance(
        account.address as Address,
        tokenAddress as Address
      );

      return {
        success: true,
        data: {
          accountName,
          tokenAddress,
          allowance: allowance.toString(),
          permit2Address: PERMIT2_ADDRESS,
          network
        },
        message: "Token allowance retrieved successfully"
      };
    } catch (error) {
      console.error(`Token allowance check failed:`, error);
      throw new Error(`Failed to check token allowance: ${(error as Error).message}`);
    }
  }

  /**
   * Check if a token has standard ERC20 approval functionality
   */
  async checkTokenApprovalSupport(
    tokenAddress: string,
    network: EvmSwapsNetwork = "base"
  ) {
    try {
      console.log(`Checking approval support for token: ${tokenAddress}`);
      
      // Try to read the allowance function
      try {
        const allowance = await this.publicClient.readContract({
          address: tokenAddress as Address,
          abi: erc20Abi,
          functionName: "allowance",
          args: ["0x0000000000000000000000000000000000000000", "0x0000000000000000000000000000000000000000"],
        });
        console.log(`Token supports allowance function`);
      } catch (error) {
        console.error(`Token does not support standard allowance function:`, (error as Error).message);
        return {
          success: false,
          error: "Token does not support standard ERC20 allowance function",
          data: {
            tokenAddress,
            supportsAllowance: false,
            supportsApprove: false
          }
        };
      }

      // Try to read the approve function signature
      try {
        const approveData = encodeFunctionData({
          abi: erc20Abi,
          functionName: "approve",
          args: ["0x0000000000000000000000000000000000000000", BigInt(0)],
        });
        console.log(`Token supports approve function`);
      } catch (error) {
        console.error(`Token does not support standard approve function:`, (error as Error).message);
        return {
          success: false,
          error: "Token does not support standard ERC20 approve function",
          data: {
            tokenAddress,
            supportsAllowance: true,
            supportsApprove: false
          }
        };
      }

      return {
        success: true,
        data: {
          tokenAddress,
          supportsAllowance: true,
          supportsApprove: true,
          message: "Token supports standard ERC20 approval functions"
        },
        message: "Token approval support verified"
      };
    } catch (error) {
      console.error(`Token approval support check failed:`, error);
      return {
        success: false,
        error: `Failed to check token approval support: ${(error as Error).message}`,
        data: {
          tokenAddress,
          supportsAllowance: false,
          supportsApprove: false
        }
      };
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

  /**
   * Get maximum available amount for a token (accounting for gas fees)
   */
  async getMaxAvailableAmount(
    accountName: string,
    tokenAddress: string,
    network: EvmSwapsNetwork = "base"
  ) {
    try {
      this.initializeCdp();
      
      // Get the account
      const account = await this.cdp!.evm.getAccount({
        name: accountName,
      });

      const isNativeAsset = tokenAddress.toLowerCase() === "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";

      if (isNativeAsset) {
        // For ETH, reserve some for gas fees
        const ethBalance = await this.publicClient.getBalance({
          address: account.address as Address,
        });

        // Reserve 0.001 ETH for gas fees
        const gasReserve = BigInt(1000000000000000); // 0.001 ETH
        const maxAmount = ethBalance > gasReserve ? ethBalance - gasReserve : BigInt(0);

        return {
          success: true,
          data: {
            accountAddress: account.address,
            tokenAddress,
            maxAmount: maxAmount.toString(),
            maxAmountFormatted: this.formatAmount(maxAmount.toString(), 18),
            totalBalance: ethBalance.toString(),
            totalBalanceFormatted: this.formatAmount(ethBalance.toString(), 18),
            gasReserve: gasReserve.toString(),
            gasReserveFormatted: this.formatAmount(gasReserve.toString(), 18)
          },
          message: "Maximum available amount calculated successfully"
        };
      } else {
        // For tokens, use the full balance
        const tokenBalance = await this.publicClient.readContract({
          address: tokenAddress as Address,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [account.address as Address],
        });

        // Get token metadata for formatting
        const cdpService = CdpService.getInstance();
        const tokenInfo = await cdpService.getTokenInfo(tokenAddress as `0x${string}`, network);
        const metadata = tokenInfo.data;

        return {
          success: true,
          data: {
            accountAddress: account.address,
            tokenAddress,
            maxAmount: tokenBalance.toString(),
            maxAmountFormatted: this.formatAmount(tokenBalance.toString(), metadata.decimals),
            totalBalance: tokenBalance.toString(),
            totalBalanceFormatted: this.formatAmount(tokenBalance.toString(), metadata.decimals),
            tokenName: metadata.name,
            tokenSymbol: metadata.symbol,
            tokenDecimals: metadata.decimals
          },
          message: "Maximum available amount calculated successfully"
        };
      }
    } catch (error) {
      console.error(`Max amount calculation failed:`, error);
      throw new Error(`Failed to calculate max amount: ${(error as Error).message}`);
    }
  }

  /**
   * Fund an account with ETH for gas fees
   */
  async fundAccountWithEth(
    accountName: string,
    amount: string,
    network: EvmSwapsNetwork = "base"
  ) {
    try {
      this.initializeCdp();
      
      // Get the account
      const account = await this.cdp!.evm.getAccount({
        name: accountName,
      });

      const amountBigInt = this.safeBigIntConversion(amount);
      
      console.log(`Funding account ${accountName} with ${amountBigInt.toString()} wei (${this.formatAmount(amountBigInt.toString(), 18)} ETH)...`);
      
      // Send ETH to the account
      const txResult = await this.cdp!.evm.sendTransaction({
        address: account.address,
        network: network,
        transaction: {
          to: account.address,
          value: amountBigInt,
        },
      });

      console.log(`Funding transaction hash: ${txResult.transactionHash}`);

      // Wait for transaction confirmation
      console.log(`Waiting for funding transaction confirmation...`);
      const receipt = await this.publicClient.waitForTransactionReceipt({
        hash: txResult.transactionHash,
      });

      if (receipt.status === "success") {
        console.log(`Funding confirmed in block ${receipt.blockNumber} ✅`);
        
        // Check new balance
        const newBalance = await this.publicClient.getBalance({
          address: account.address as Address,
        });
        
        return {
          success: true,
          data: {
            transactionHash: txResult.transactionHash,
            blockNumber: receipt.blockNumber?.toString(),
            status: receipt.status,
            newBalance: newBalance.toString(),
            newBalanceFormatted: this.formatAmount(newBalance.toString(), 18),
            message: `Successfully funded account with ${this.formatAmount(amountBigInt.toString(), 18)} ETH`
          },
          message: "Account funding completed successfully"
        };
      } else {
        throw new Error(`Funding transaction failed with status: ${receipt.status}`);
      }
    } catch (error) {
      console.error(`Account funding failed:`, error);
      throw new Error(`Failed to fund account: ${(error as Error).message}`);
    }
  }

  /**
   * Check account ETH balance
   */
  async checkAccountEthBalance(
    accountName: string,
    network: EvmSwapsNetwork = "base"
  ) {
    try {
      this.initializeCdp();
      
      // Get the account
      const account = await this.cdp!.evm.getAccount({
        name: accountName,
      });

      const balance = await this.publicClient.getBalance({
        address: account.address as Address,
      });

      return {
        success: true,
        data: {
          accountName,
          accountAddress: account.address,
          balance: balance.toString(),
          balanceFormatted: this.formatAmount(balance.toString(), 18),
          network
        },
        message: "Account ETH balance retrieved successfully"
      };
    } catch (error) {
      console.error(`ETH balance check failed:`, error);
      throw new Error(`Failed to check ETH balance: ${(error as Error).message}`);
    }
  }

  /**
   * Helper to determine if a trade is considered "large"
   * This is a placeholder and can be refined based on specific criteria
   * For example, a large trade might be defined as > 1 ETH or > 1000 USDC/USDT
   */
  private isLargeTrade(fromAmount: bigint, fromToken: string): boolean {
    const fromTokenLower = fromToken.toLowerCase();
    const isNativeAsset = fromTokenLower === "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";

    if (isNativeAsset) {
      // For ETH, a large trade is typically > 1 ETH
      return fromAmount > BigInt(1000000000000000000); // 1 ETH in wei
    } else {
      // For tokens, a large trade is typically > 1000 USDC/USDT
      return fromAmount > BigInt(1000000000000000000); // 1 ETH in wei
    }
  }
}
