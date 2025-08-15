import { ethers } from 'ethers';
import { AnkrProvider } from '@ankr.com/ankr.js';

import { decodeTransactionInput, detectBuyAndToken } from '../lib/txParsing.js';
import { config } from '../config/index.js';
import { logger } from '../lib/logger.js';
import { CopyTradeEvent } from '../types/index.js';

import { CopyTradingService } from './copyTradingService.js';

export interface DepositEvent {
  from: string;
  to: string;
  value: string;
  transactionHash: string;
  blockNumber: number;
  timestamp: number;
  tokenAddress?: string; // For ERC-20 tokens
  tokenSymbol?: string; // For ERC-20 tokens
  tokenName?: string; // For ERC-20 tokens
  tokenDecimals?: number; // For ERC-20 tokens
  isERC20: boolean; // Whether this is an ERC-20 transfer or ETH transfer
}

export interface SnipeEvent {
  tokenAddress: string;
  amount: string;
  transactionHash: string;
  timestamp: number;
}

export class MonitoringService {
  private provider: ethers.JsonRpcProvider;
  private ankrProvider: AnkrProvider;
  private baseChainId = 8453; // Base mainnet

  constructor() {
    // Use Ankr RPC endpoint from config
    const providerUrl = config.providerUrl;
    
    logger.info({ providerUrl }, 'Initializing monitoring service');
    
    try {
      this.provider = new ethers.JsonRpcProvider(providerUrl);
      this.ankrProvider = new AnkrProvider(providerUrl);
      logger.info('Monitoring service initialized successfully');
    } catch (error) {
      logger.error({ err: error }, 'Failed to initialize monitoring service');
      throw new Error(`Failed to initialize monitoring service: ${(error as Error).message}`);
    }
  }

  /**
   * Helper function to serialize BigInt values for JSON
   */
  private serializeBigInts(obj: any): any {
    if (obj === null || obj === undefined) {
      return obj;
    }
    
    if (typeof obj === 'bigint') {
      return obj.toString();
    }
    
    if (Array.isArray(obj)) {
      return obj.map(item => this.serializeBigInts(item));
    }
    
    if (typeof obj === 'object') {
      const result: any = {};
      for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
          result[key] = this.serializeBigInts(obj[key]);
        }
      }
      return result;
    }
    
    return obj;
  }

  /**
   * Monitor wallet for incoming deposits (ETH and ERC-20 tokens)
   */
  async monitorDeposits(walletAddress: string, callback?: (event: DepositEvent) => void): Promise<DepositEvent[]> {
    try {
      const latestBlock = await this.provider.getBlockNumber();
      const fromBlock = latestBlock - 1000; // Monitor last 1000 blocks
      const depositEvents: DepositEvent[] = [];

      // 1. Monitor ETH transfers (direct deposits)
      const ethFilter = {
        address: walletAddress,
        fromBlock: fromBlock,
        toBlock: 'latest',
        topics: [
          null, // any from address
          ethers.zeroPadValue(walletAddress, 32) // to address
        ]
      };

      const ethLogs = await this.provider.getLogs(ethFilter);
      
      for (const log of ethLogs) {
        const block = await this.provider.getBlock(log.blockNumber!);
        const transaction = await this.provider.getTransaction(log.transactionHash!);

        if (transaction && block && transaction.value > 0) {
          const event: DepositEvent = {
            from: transaction.from,
            to: transaction.to!,
            value: transaction.value.toString(), // Ensure BigInt is converted to string
            transactionHash: log.transactionHash!,
            blockNumber: Number(log.blockNumber!), // Ensure BigInt is converted to number
            timestamp: Number(block.timestamp), // Ensure BigInt is converted to number
            isERC20: false
          };

          depositEvents.push(event);
          if (callback) {
            callback(event);
          }
        }
      }

      // 2. Monitor ERC-20 token transfers
      // Transfer event signature: Transfer(address,address,uint256)
      const transferEventSignature = ethers.id("Transfer(address,address,uint256)");
      
      // Get all Transfer events where the wallet is the recipient
      const erc20Filter = {
        fromBlock: fromBlock,
        toBlock: 'latest',
        topics: [
          transferEventSignature,
          null, // from address (any)
          ethers.zeroPadValue(walletAddress, 32) // to address (our wallet)
        ]
      };

      const erc20Logs = await this.provider.getLogs(erc20Filter);
      
      for (const log of erc20Logs) {
        try {
          const block = await this.provider.getBlock(log.blockNumber!);
          const transaction = await this.provider.getTransaction(log.transactionHash!);

          if (transaction && block) {
            // Decode the Transfer event
            const iface = new ethers.Interface([
              "event Transfer(address indexed from, address indexed to, uint256 value)"
            ]);
            
            const decodedLog = iface.parseLog(log);
            
            if (decodedLog) {
              const fromAddress = decodedLog.args[0];
              const toAddress = decodedLog.args[1];
              const tokenAmount = decodedLog.args[2];

              // Get token information
              const tokenContract = new ethers.Contract(
                log.address,
                [
                  'function name() view returns (string)',
                  'function symbol() view returns (string)',
                  'function decimals() view returns (uint8)'
                ],
                this.provider
              );

              let tokenName = 'Unknown';
              let tokenSymbol = 'Unknown';
              let tokenDecimals = 18;

              try {
                [tokenName, tokenSymbol, tokenDecimals] = await Promise.all([
                  tokenContract.getFunction('name')() as Promise<string>,
                  tokenContract.getFunction('symbol')() as Promise<string>,
                  tokenContract.getFunction('decimals')() as Promise<number>
                ]);
              } catch (error) {
                logger.warn({ err: error, token: log.address }, 'Could not fetch token info');
              }

              const event: DepositEvent = {
                from: fromAddress,
                to: toAddress,
                value: tokenAmount.toString(), // Ensure BigInt is converted to string
                transactionHash: log.transactionHash!,
                blockNumber: Number(log.blockNumber!), // Ensure BigInt is converted to number
                timestamp: Number(block.timestamp), // Ensure BigInt is converted to number
                tokenAddress: log.address,
                tokenSymbol: tokenSymbol,
                tokenName: tokenName,
                tokenDecimals: Number(tokenDecimals), // Ensure BigInt is converted to number
                isERC20: true
              };

              depositEvents.push(event);
              if (callback) {
                callback(event);
              }
            }
          }
        } catch (error) {
          logger.warn({ err: error }, 'Error processing ERC-20 transfer log');
          continue;
        }
      }

      // Sort events by timestamp (newest first)
      depositEvents.sort((a, b) => b.timestamp - a.timestamp);

      // Serialize any BigInt values in the results
      const serializedEvents = this.serializeBigInts(depositEvents);

      return serializedEvents;
    } catch (error) {
      logger.error({ err: error }, 'Error monitoring deposits');
      throw error;
    }
  }

  /**
   * Monitor a wallet for copy trading opportunities
   */
  async monitorCopyTrading(walletAddress: string, callback?: (event: CopyTradeEvent) => void): Promise<CopyTradeEvent[]> {
    try {
      // Use the copy trading service to monitor and execute copy trades
      const copyTradingService = CopyTradingService.getInstance();
      const executedEvents = await copyTradingService.monitorAndExecuteCopyTrades(walletAddress);
      
      // Also create alerts for any target wallet activity (even if no copy trade executed)
      await this.monitorTargetWalletActivity(walletAddress);
      
      // Call callback for each executed event
      if (callback) {
        for (const event of executedEvents) {
          callback(event);
        }
      }

      return executedEvents;
    } catch (error) {
      logger.error({ err: error }, 'Error monitoring copy trading');
      throw error;
    }
  }

  /**
   * Monitor target wallet activity and create alerts
   */
  async monitorTargetWalletActivity(walletAddress: string): Promise<void> {
    try {
      const copyTradingService = CopyTradingService.getInstance();
      
      // Get recent transactions for the target wallet
      const latestBlock = await this.provider.getBlockNumber();
      const fromBlock = latestBlock - 10; // Check last 10 blocks

      const filter = {
        fromBlock: fromBlock,
        toBlock: 'latest',
        address: walletAddress
      };

      const logs = await this.provider.getLogs(filter);

      for (const log of logs) {
        const transaction = await this.provider.getTransaction(log.transactionHash!);
        if (!transaction) continue;
        // Router filter: if configured and tx.to not in routers, skip for swaps
        const routers = config.copyTrading?.routerAddresses ?? [];
        if (routers.length > 0 && transaction.to && transaction.data && transaction.data !== '0x') {
          if (!routers.includes(transaction.to.toLowerCase())) {
            continue;
          }
        }
        
        if (this.isBuyTransaction(transaction)) {
          const tokenInfo = await this.extractTokenInfo(transaction);
          
          if (tokenInfo) {
            // Create alert for target wallet activity
            await copyTradingService.createTargetWalletAlert(
              walletAddress,
              tokenInfo.tokenAddress,
              tokenInfo.tokenSymbol,
              tokenInfo.tokenName,
              ethers.formatEther(transaction.value),
              log.transactionHash!
            );
          }
        }
      }
    } catch (error) {
      logger.error({ err: error }, 'Error monitoring target wallet activity');
    }
  }

  /**
   * Snipe a token using CDP service (secure, no private key required)
   */
  async snipeToken(
    accountName: string,
    tokenAddress: string,
    amount: string,
    slippage: number = 0.05 // 5% default slippage
  ): Promise<SnipeEvent> {
    try {
      logger.info({ accountName, tokenAddress, amount, slippage }, 'Snipe initiated');

      // Use CDP service for secure transaction execution
      const { CdpService } = await import('./cdpService.js');
      const cdpService = CdpService.getInstance();

      // Get account details from CDP
      const account = await cdpService.getAccount(accountName);
      logger.info({ accountAddress: account.data.address }, 'Fetched account');

      // Check account balance
      const balances = await cdpService.getBalances(accountName);
      const ethBalance = balances.data.balances.find(b => 
        b.token.contractAddress === "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE"
      );
      
      if (!ethBalance || parseFloat(ethBalance.amount.formatted) < parseFloat(amount)) {
        throw new Error(`Insufficient ETH balance. Required: ${amount} ETH, Available: ${ethBalance?.amount.formatted || '0'} ETH`);
      }

      // Execute snipe via swap (ETH->token) to ensure gas estimation works on non-payable tokens
      const { SwapService } = await import('./swapService.js');
      const swapService = SwapService.getInstance();
      const fromToken = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
      const slippageBps = Math.round((slippage || 0.05) * 10000);
      const { parseEther } = await import('viem');
      const wei = parseEther(amount).toString();
      const swap = await swapService.executeSwap({
        accountName,
        fromToken,
        toToken: tokenAddress,
        fromAmount: wei,
        slippageBps,
        network: "base"
      });

      logger.info({ tx: (swap as any).data?.transactionHash }, 'Snipe transaction executed');

      // Create position in positions service
      const { PositionsService } = await import('./positionsService.js');
      const positionsService = new PositionsService();
      await positionsService.addPosition(accountName, tokenAddress, amount, (swap as any).data?.transactionHash);

      // Create trade alert for successful snipe
      const { AlertsService } = await import('./alertsService.js');
      const alertsService = new AlertsService();
      await alertsService.createTradeAlert(
        accountName,
        'successful_trade',
        tokenAddress,
        amount
      );

      const snipeEvent: SnipeEvent = {
        tokenAddress,
        amount,
        transactionHash: (swap as any).data?.transactionHash,
        timestamp: Math.floor(Date.now() / 1000)
      };

      return snipeEvent;
    } catch (error) {
      logger.error({ err: error }, 'Error sniping token');
      throw error;
    }
  }

  /**
   * Decode transaction data to understand what the wallet is doing
   */
  private decodeTransactionData(data: string): { method: string; methodId: string; rawData: string } {
    return decodeTransactionInput(data);
  }

  /**
   * Get wallet balance
   */
  async getWalletBalance(address: string): Promise<string> {
    try {
      const balance = await this.provider.getBalance(address);
      return ethers.formatEther(balance);
    } catch (error) {
      logger.error({ err: error }, 'Error getting wallet balance');
      throw error;
    }
  }

  /**
   * Get token balance for a wallet
   */
  async getTokenBalance(tokenAddress: string, walletAddress: string): Promise<string> {
    try {
      const tokenContract = new ethers.Contract(
        tokenAddress,
        [
          'function balanceOf(address) view returns (uint256)',
          'function decimals() view returns (uint8)',
          'function symbol() view returns (string)'
        ],
        this.provider
      );

      const [balance, decimals, _symbol] = await Promise.all([
        tokenContract.getFunction('balanceOf')(walletAddress) as Promise<bigint>,
        tokenContract.getFunction('decimals')() as Promise<number>,
        tokenContract.getFunction('symbol')() as Promise<string>
      ]);

      return ethers.formatUnits(balance, decimals);
    } catch (error) {
      logger.error({ err: error }, 'Error getting token balance');
      throw error;
    }
  }

  /**
   * Get recent transactions for a wallet
   */
  async getRecentTransactions(address: string, limit: number = 10): Promise<any[]> {
    try {
      const latestBlock = await this.provider.getBlockNumber();
      const fromBlock = latestBlock - 100; // Scan last 1000 blocks like deposit monitoring
      const transactions = [];

      // Scan through the last 1000 blocks
      for (let blockNumber = latestBlock; blockNumber >= fromBlock && transactions.length < limit; blockNumber--) {
        try {
          const block = await this.provider.getBlock(blockNumber, true);
          
          if (block) {
            const relevantTxs = block.transactions.filter((tx: any) => 
              tx.from === address || tx.to === address
            ).map((tx: any) => ({
              ...tx,
              blockNumber: blockNumber // Add blockNumber to each transaction
            }));
            
            transactions.push(...relevantTxs);
          }
        } catch (error) {
          logger.warn({ err: error, blockNumber }, 'Error getting block');
          continue; // Skip this block and continue with the next
        }
      }

      // Sort by block number (newest first) and limit results
      const sortedTransactions = transactions
        .sort((a, b) => b.blockNumber - a.blockNumber)
        .slice(0, limit);

      // Serialize any BigInt values
      return this.serializeBigInts(sortedTransactions);
    } catch (error) {
      logger.error({ err: error }, 'Error getting recent transactions');
      throw error;
    }
  }

  /**
   * Check if transaction is a buy transaction
   */
  private isBuyTransaction(transaction: any): boolean {
    if (transaction.value > 0 && transaction.data === '0x') return true;
    const detection = detectBuyAndToken(transaction.data ?? '0x');
    return detection.isBuy;
  }

  /**
   * Extract token information from transaction
   */
  private async extractTokenInfo(transaction: any): Promise<{ tokenAddress: string; tokenSymbol: string; tokenName: string } | null> {
    try {
      // For direct ETH transfers, the recipient is the token address
      if (transaction.data === '0x' && transaction.to) {
        const tokenContract = new ethers.Contract(
          transaction.to,
          [
            'function symbol() view returns (string)',
            'function name() view returns (string)'
          ],
          this.provider
        );

        const [symbol, name] = await Promise.all([
          tokenContract.getFunction('symbol')() as Promise<string>,
          tokenContract.getFunction('name')() as Promise<string>
        ]);

        return {
          tokenAddress: transaction.to,
          tokenSymbol: symbol,
          tokenName: name
        };
      }

      // For swap transactions, use detection helper to get token address
      if (transaction.data && transaction.data.length > 10) {
        const detection = detectBuyAndToken(transaction.data);
        if (detection.tokenAddress) {
          const tokenAddress = detection.tokenAddress;
          
          const tokenContract = new ethers.Contract(
            tokenAddress,
            [
              'function symbol() view returns (string)',
              'function name() view returns (string)'
            ],
            this.provider
          );

          const [symbol, name] = await Promise.all([
            tokenContract.getFunction('symbol')() as Promise<string>,
            tokenContract.getFunction('name')() as Promise<string>
          ]);

          return {
            tokenAddress,
            tokenSymbol: symbol,
            tokenName: name
          };
        }
      }

      return null;
    } catch (error) {
      logger.error({ err: error }, 'Error extracting token info');
      return null;
    }
  }
} 