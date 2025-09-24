import { CdpClient } from "@coinbase/cdp-sdk";
import { createPublicClient, http, erc20Abi, encodeFunctionData, type Address } from "viem";
import { base } from "viem/chains";

import { config } from '../config/index.js';
import { logger } from '../lib/logger.js';

import { CdpService } from "./cdpService.js";

// Define supported networks
export type EvmSwapsNetwork = "base" | "ethereum";

// Permit2 contract address is the same across all networks
const PERMIT2_ADDRESS: Address = "0x000000000022D473030F116dDEE9F6B43aC78BA3";

export class SwapService {
  private static instance: SwapService;
  private cdp: CdpClient | null = null;
  private publicClient: any = null;

  private constructor() {
    // Initialize viem public client for transaction monitoring
    const providerUrl = config.providerUrl;
    
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

      logger.info('Initializing CDP client');
      
      try {
        this.cdp = new CdpClient({
          apiKeyId: process.env.CDP_API_KEY_ID,
          apiKeySecret: process.env.CDP_API_KEY_SECRET,
          walletSecret: process.env.CDP_WALLET_SECRET,
        });
        logger.info('CDP client initialized successfully');
      } catch (error) {
        logger.error({ err: error }, 'Failed to initialize CDP client');
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
    } catch (_error) {
      throw new Error(`Invalid amount format: ${valueString}. Amount must be a valid integer string.`);
    }
  }

  /**
   * Calculate the fee amount (5% of the swap amount)
   */
  private calculateFee(amount: bigint): bigint {
    // Calculate 5% fee: amount * 5 / 100
    return (amount * BigInt(config.fee.percentage)) / BigInt(100);
  }

  /**
   * Calculate the amount after deducting the fee
   */
  private calculateAmountAfterFee(amount: bigint): bigint {
    const fee = this.calculateFee(amount);
    return amount - fee;
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
      
      // Calculate fee and amount after fee
      const fee = this.calculateFee(fromAmount);
      const amountAfterFee = this.calculateAmountAfterFee(fromAmount);

      // Get swap price using the amount after fee
      const swapPrice = await this.cdp!.evm.getSwapPrice({
        fromToken: params.fromToken as `0x${string}`,
        toToken: params.toToken as `0x${string}`,
        fromAmount: amountAfterFee,
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
          fee: {
            amount: fee.toString(),
            amountFormatted: this.formatAmount(fee.toString()),
            percentage: config.fee.percentage,
            address: config.fee.address,
          },
          totalFromAmount: fromAmount.toString(),
          totalFromAmountFormatted: this.formatAmount(fromAmount.toString()),
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
      
      logger.info({ accountName: params.accountName }, 'Starting swap execution');
      
      // Validate prerequisites first
      logger.info('Validating swap prerequisites');
      const validation = await this.validateSwapPrerequisites(
        params.accountName,
        params.fromToken,
        params.fromAmount,
        params.network
      );
      
      if (!validation.success) {
        throw new Error(`Validation failed: ${validation.message}`);
      }
      
      logger.info({ validation: validation.data }, 'Validation passed');
      
      // Get the account
      const account = await this.cdp!.evm.getAccount({
        name: params.accountName,
      });

      // Use the adjusted amount from validation if available
      let fromAmount: bigint;
      if (validation.data.adjustedAmount) {
        fromAmount = BigInt(validation.data.adjustedAmount);
        logger.info({ adjustedAmount: fromAmount.toString(), original: params.fromAmount }, 'Using adjusted amount');
      } else {
        // Convert amount to BigInt safely
        fromAmount = this.safeBigIntConversion(params.fromAmount);
      }

      // Calculate fee and amount after fee
      const fee = this.calculateFee(fromAmount);
      const amountAfterFee = this.calculateAmountAfterFee(fromAmount);
      
      logger.info({ 
        totalAmount: fromAmount.toString(), 
        fee: fee.toString(), 
        amountAfterFee: amountAfterFee.toString() 
      }, 'Fee calculation completed');

      // Check if fromToken is native ETH
      const isNativeAsset = params.fromToken.toLowerCase() === "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";

      logger.info({ fromAmount: fromAmount.toString(), fromToken: params.fromToken, toToken: params.toToken, network: params.network }, 'Executing swap');

      // Handle token allowance check and approval if needed (only for non-native assets)
      if (!isNativeAsset) {
        try {
          logger.info({ fromToken: params.fromToken }, 'Checking token allowance');
          await this.handleTokenAllowance(
            account.address as Address,
            params.fromToken as Address,
            fromAmount,
            params.network
          );
          logger.info('Token allowance check completed successfully');
        } catch (approvalError) {
          logger.error({ err: approvalError }, 'Token approval failed');
          throw new Error(`Token approval failed: ${(approvalError as Error).message}. Please ensure the account has sufficient balance and try again.`);
        }
      }

      // Send fee to fee address before executing swap
      try {
        logger.info({ fee: fee.toString(), feeAddress: config.fee.address }, 'Sending fee to fee address');
        await this.sendFeeToAddress(
          account.address as Address,
          params.fromToken as Address,
          fee,
          params.network
        );
        logger.info('Fee sent successfully');
      } catch (feeError) {
        logger.error({ err: feeError }, 'Fee transfer failed');
        throw new Error(`Fee transfer failed: ${(feeError as Error).message}. Please ensure the account has sufficient balance for the fee.`);
      }

      // Execute swap with amount after fee
      logger.info('Initiating swap transaction');
      const swapResult = await account.swap({
        network: params.network,
        fromToken: params.fromToken as `0x${string}`,
        toToken: params.toToken as `0x${string}`,
        fromAmount: amountAfterFee,
        slippageBps: params.slippageBps || 100, // Default 1% slippage tolerance
      });

      logger.info({ tx: swapResult.transactionHash }, 'Swap executed successfully');

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
        logger.info('Trade alert created for successful swap');
        
        // Check if this is a large trade (e.g., > 1 ETH or equivalent)
        const isLargeTrade = this.isLargeTrade(fromAmount, params.fromToken);
        if (isLargeTrade) {
          await alertsService.createTradeAlert(
            params.accountName,
            'large_trade',
            params.fromToken,
            fromAmount.toString()
          );
          logger.info('Large trade alert created for swap');
        }
      } catch (alertError) {
        logger.warn({ err: alertError }, 'Failed to create trade alert');
      }

      // Wait for transaction confirmation
      logger.info('Waiting for transaction confirmation');
      const receipt = await this.publicClient.waitForTransactionReceipt({
        hash: swapResult.transactionHash,
      });

      // Ensure all BigInt values are converted to strings
      const blockNumber = receipt.blockNumber.toString();
      const gasUsed = receipt.gasUsed.toString();

      // Create response object with all BigInt values converted to strings
      const responseData = {
        transactionHash: swapResult.transactionHash,
        fromAmount: amountAfterFee.toString(),
        totalFromAmount: fromAmount.toString(),
        fee: {
          amount: fee.toString(),
          amountFormatted: this.formatAmount(fee.toString()),
          percentage: config.fee.percentage,
          address: config.fee.address,
        },
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
      logger.error({ err: error }, 'Swap execution failed');
      
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
        logger.info('Trade alert created for failed swap');
      } catch (alertError) {
        logger.warn({ err: alertError }, 'Failed to create trade alert');
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
    _network: EvmSwapsNetwork = "base"
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

      logger.info({ accountName }, 'Validating swap prerequisites');
      logger.debug({ amount: fromAmount, bigInt: amountBigInt.toString() }, 'Parsed amount');
      logger.debug({ accountAddress: account.address }, 'Account resolved');

      if (!isNativeAsset) {
        // Check token balance
        const tokenBalance = await this.publicClient.readContract({
          address: fromToken as Address,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [account.address as Address],
        });

        logger.debug({ tokenBalance: tokenBalance.toString(), required: amountBigInt.toString() }, 'Token balance check');

        // Add a small tolerance (0.1% or minimum 1 token) to handle precision issues
        const tolerance = amountBigInt > BigInt(1000) ? amountBigInt / BigInt(1000) : BigInt(1);
        const requiredWithTolerance = amountBigInt + tolerance;

        if (tokenBalance < requiredWithTolerance) {
          // If the difference is very small, try with the exact balance
          if (tokenBalance >= amountBigInt - tolerance) {
            logger.info({ tokenBalance: tokenBalance.toString() }, 'Small diff detected, using exact balance');
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

        logger.debug({ currentAllowance: currentAllowance.toString(), required: amountBigInt.toString() }, 'Allowance check');

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

        logger.debug({ ethBalance: ethBalance.toString(), required: amountBigInt.toString() }, 'ETH balance check');

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
      logger.error({ err: error }, 'Validation failed');
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
      logger.info({ tokenAddress }, 'Checking current allowance');
      const currentAllowance = await this.getAllowance(
        ownerAddress,
        tokenAddress
      );

      logger.debug({ currentAllowance: currentAllowance.toString(), required: fromAmount.toString() }, 'Current allowance');

      // If allowance is insufficient, approve tokens
      if (currentAllowance < fromAmount) {
        logger.info({ currentAllowance: currentAllowance.toString(), required: fromAmount.toString() }, 'Allowance insufficient, approving tokens');

        // Check account balance first
        await this.checkAccountBalance(ownerAddress, tokenAddress, fromAmount);

        // Set the allowance to the required amount
        await this.approveTokenAllowance(
          ownerAddress,
          tokenAddress,
          fromAmount,
          network
        );
        logger.info({ allowance: fromAmount.toString() }, 'Allowance set');
        
        // Verify the allowance was set correctly
        const newAllowance = await this.getAllowance(ownerAddress, tokenAddress);
        logger.debug({ newAllowance: newAllowance.toString() }, 'Verified new allowance');
        
        // Add a small delay to ensure the blockchain state is updated
        if (newAllowance < fromAmount) {
          logger.info('Allowance still insufficient, retrying after delay');
          await new Promise(resolve => setTimeout(resolve, 5000));
          
          const retryAllowance = await this.getAllowance(ownerAddress, tokenAddress);
          logger.debug({ retryAllowance: retryAllowance.toString() }, 'Retry allowance check');
          
          if (retryAllowance < fromAmount) {
            throw new Error(`Failed to set sufficient allowance. Current: ${retryAllowance.toString()}, Required: ${fromAmount.toString()}. The token might have a non-standard approval mechanism.`);
          } else {
            logger.info({ retryAllowance: retryAllowance.toString() }, 'Allowance verified after retry');
          }
        }
      } else {
        logger.info({ currentAllowance: currentAllowance.toString(), required: fromAmount.toString() }, 'Token allowance sufficient');
      }
    } catch (error) {
      logger.error({ err: error }, 'Error in handleTokenAllowance');
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
      logger.info({ tokenAddress }, 'Checking account balance');
      
      const balance = await this.publicClient.readContract({
        address: tokenAddress,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [ownerAddress],
      });

      logger.debug({ balance: balance.toString(), required: requiredAmount.toString() }, 'Account token balance');

      if (balance < requiredAmount) {
        throw new Error(`Insufficient token balance. Available: ${balance.toString()}, Required: ${requiredAmount.toString()}`);
      }

      // Also check ETH balance for gas fees
      const ethBalance = await this.publicClient.getBalance({
        address: ownerAddress,
      });

      logger.debug({ ethBalance: ethBalance.toString() }, 'ETH balance for gas');

      // Reduce minimum ETH requirement to 0.0001 ETH (100000000000000 wei)
      const minEthRequired = BigInt(100000000000000); // 0.0001 ETH
      if (ethBalance < minEthRequired) {
        throw new Error(`Insufficient ETH for gas fees. Available: ${ethBalance.toString()} wei (${this.formatAmount(ethBalance.toString(), 18)} ETH), Required: ${minEthRequired.toString()} wei (0.0001 ETH). Please fund the account with at least 0.0001 ETH for gas fees.`);
      }

    } catch (error) {
      logger.error({ err: error }, 'Balance check failed');
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
      logger.info({ tokenAddress, spender: PERMIT2_ADDRESS, amount: amount.toString() }, 'Approving token allowance');

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

      logger.info('Sending approval transaction');
      logger.debug({
        address: ownerAddress,
        to: tokenAddress,
        data: data,
        value: "0",
        network: network
      }, 'Approval transaction details');
      
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

      logger.info({ tx: txResult.transactionHash }, 'Approval transaction sent');

      // Wait for approval transaction to be confirmed
      logger.info('Waiting for approval transaction confirmation');
      const receipt = await this.publicClient.waitForTransactionReceipt({
        hash: txResult.transactionHash,
      });

      if (receipt.status === "success") {
        logger.info({ blockNumber: receipt.blockNumber }, 'Approval confirmed');
        return receipt;
      } else {
        throw new Error(`Approval transaction failed with status: ${receipt.status}`);
      }
    } catch (error) {
      logger.error({ err: error }, 'Approval transaction failed');
      
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
    logger.info({ token }, 'Checking allowance to Permit2');

    try {
      const allowance = await this.publicClient.readContract({
        address: token,
        abi: erc20Abi,
        functionName: "allowance",
        args: [owner, PERMIT2_ADDRESS],
      });

      logger.debug({ allowance: allowance.toString() }, 'Current allowance');
      return allowance;
    } catch (error) {
      logger.error({ err: error }, 'Error checking allowance');
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
      
      logger.info({ amount: amountBigInt.toString(), accountName }, 'Manual token approval');
      
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
      logger.error({ err: error }, 'Manual token approval failed');
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
      logger.error({ err: error }, 'Token allowance check failed');
      throw new Error(`Failed to check token allowance: ${(error as Error).message}`);
    }
  }

  /**
   * Send fee to the fee address
   */
  private async sendFeeToAddress(
    fromAddress: Address,
    tokenAddress: Address,
    feeAmount: bigint,
    network: EvmSwapsNetwork
  ): Promise<void> {
    try {
      this.initializeCdp();
      if (!this.cdp) {
        throw new Error("CDP client not initialized");
      }

      const isNativeAsset = tokenAddress.toLowerCase() === "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";

      if (isNativeAsset) {
        // For ETH, send directly
        logger.info({ feeAmount: feeAmount.toString(), feeAddress: config.fee.address }, 'Sending ETH fee');
        
        const txResult = await this.cdp.evm.sendTransaction({
          address: fromAddress,
          network: network,
          transaction: {
            to: config.fee.address as `0x${string}`,
            value: feeAmount,
          },
        });

        logger.info({ tx: txResult.transactionHash }, 'ETH fee transaction sent');

        // Wait for transaction confirmation
        const receipt = await this.publicClient.waitForTransactionReceipt({
          hash: txResult.transactionHash,
        });

        if (receipt.status !== "success") {
          throw new Error(`Fee transaction failed with status: ${receipt.status}`);
        }

        logger.info({ blockNumber: receipt.blockNumber }, 'ETH fee transaction confirmed');
      } else {
        // For tokens, use transfer function
        logger.info({ feeAmount: feeAmount.toString(), feeAddress: config.fee.address }, 'Sending token fee');
        
        const data = encodeFunctionData({
          abi: erc20Abi,
          functionName: "transfer",
          args: [config.fee.address as `0x${string}`, feeAmount],
        });

        const txResult = await this.cdp.evm.sendTransaction({
          address: fromAddress,
          network: network,
          transaction: {
            to: tokenAddress,
            data,
            value: BigInt(0),
          },
        });

        logger.info({ tx: txResult.transactionHash }, 'Token fee transaction sent');

        // Wait for transaction confirmation
        const receipt = await this.publicClient.waitForTransactionReceipt({
          hash: txResult.transactionHash,
        });

        if (receipt.status !== "success") {
          throw new Error(`Fee transaction failed with status: ${receipt.status}`);
        }

        logger.info({ blockNumber: receipt.blockNumber }, 'Token fee transaction confirmed');
      }
    } catch (error) {
      logger.error({ err: error }, 'Fee transfer failed');
      throw new Error(`Failed to send fee: ${(error as Error).message}`);
    }
  }

  /**
   * Check if a token has standard ERC20 approval functionality
   */
  async checkTokenApprovalSupport(
    tokenAddress: string,
    _network: EvmSwapsNetwork = "base"
  ) {
    try {
      logger.info({ tokenAddress }, 'Checking approval support for token');
      
      // Try to read the allowance function
      try {
        await this.publicClient.readContract({
          address: tokenAddress as Address,
          abi: erc20Abi,
          functionName: "allowance",
          args: ["0x0000000000000000000000000000000000000000", "0x0000000000000000000000000000000000000000"],
        });
        logger.info('Token supports allowance function');
      } catch (error) {
        logger.warn({ err: error }, 'Token does not support standard allowance function');
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
        encodeFunctionData({
          abi: erc20Abi,
          functionName: "approve",
          args: ["0x0000000000000000000000000000000000000000", BigInt(0)],
        });
        logger.info('Token supports approve function');
      } catch (error) {
        logger.warn({ err: error }, 'Token does not support standard approve function');
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
      logger.error({ err: error }, 'Token approval support check failed');
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
      logger.warn({ err: error, amount }, 'Failed to format amount');
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
      logger.error({ err: error }, 'Max amount calculation failed');
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
      
      logger.info({ accountName, wei: amountBigInt.toString(), eth: this.formatAmount(amountBigInt.toString(), 18) }, 'Funding account');
      
      // Send ETH to the account
      const txResult = await this.cdp!.evm.sendTransaction({
        address: account.address,
        network: network,
        transaction: {
          to: account.address,
          value: amountBigInt,
        },
      });

      logger.info({ tx: txResult.transactionHash }, 'Funding transaction sent');

      // Wait for transaction confirmation
      logger.info('Waiting for funding transaction confirmation');
      const receipt = await this.publicClient.waitForTransactionReceipt({
        hash: txResult.transactionHash,
      });

      if (receipt.status === "success") {
        logger.info({ blockNumber: receipt.blockNumber }, 'Funding confirmed');
        
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
      logger.error({ err: error }, 'Account funding failed');
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
      logger.error({ err: error }, 'ETH balance check failed');
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
