import { ethers } from 'ethers';
import { AnkrProvider } from '@ankr.com/ankr.js';
import { CopyTradingService } from './copyTradingService.js';
import { CopyTradeEvent } from '../types/index.js';

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
    // Use proper Ankr RPC endpoint format for Base network
    const providerUrl = process.env.PROVIDER_URL || "https://rpc.ankr.com/base/b39a19f9ecf66252bf862fe6948021cd1586009ee97874655f46481cfbf3f129";
    
    console.log('🔗 Initializing monitoring service with provider URL:', providerUrl);
    
    try {
      this.provider = new ethers.JsonRpcProvider(providerUrl);
      this.ankrProvider = new AnkrProvider(providerUrl);
      console.log('✅ Monitoring service initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize monitoring service:', error);
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
        if (obj.hasOwnProperty(key)) {
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
                  tokenContract.name(),
                  tokenContract.symbol(),
                  tokenContract.decimals()
                ]);
              } catch (error) {
                console.log(`Could not fetch token info for ${log.address}:`, (error as Error).message);
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
          console.log(`Error processing ERC-20 transfer log:`, (error as Error).message);
          continue;
        }
      }

      // Sort events by timestamp (newest first)
      depositEvents.sort((a, b) => b.timestamp - a.timestamp);

      // Serialize any BigInt values in the results
      const serializedEvents = this.serializeBigInts(depositEvents);

      return serializedEvents;
    } catch (error) {
      console.error('Error monitoring deposits:', error);
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
      console.error('Error monitoring copy trading:', error);
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
        
        if (transaction && this.isBuyTransaction(transaction)) {
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
      console.error('Error monitoring target wallet activity:', error);
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
      console.log(`🎯 Snipe initiated for account: ${accountName}`);
      console.log(`Token Address: ${tokenAddress}`);
      console.log(`Amount: ${amount} ETH`);
      console.log(`Slippage: ${slippage * 100}%`);

      // Use CDP service for secure transaction execution
      const { CdpService } = await import('./cdpService.js');
      const cdpService = CdpService.getInstance();

      // Get account details from CDP
      const account = await cdpService.getAccount(accountName);
      console.log(`Account Address: ${account.data.address}`);

      // Check account balance
      const balances = await cdpService.getBalances(accountName);
      const ethBalance = balances.data.balances.find(b => 
        b.token.contractAddress === "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE"
      );
      
      if (!ethBalance || parseFloat(ethBalance.amount.formatted) < parseFloat(amount)) {
        throw new Error(`Insufficient ETH balance. Required: ${amount} ETH, Available: ${ethBalance?.amount.formatted || '0'} ETH`);
      }

      // Execute the snipe transaction using CDP
      const result = await cdpService.sendTransaction(accountName, {
        to: tokenAddress as `0x${string}`,
        value: amount,
        network: "base"
      });

      console.log(`✅ Snipe transaction executed: ${result.data.transactionHash}`);

      // Create position in positions service
      const { PositionsService } = await import('./positionsService.js');
      const positionsService = new PositionsService();
      await positionsService.addPosition(
        accountName,
        tokenAddress,
        amount,
        result.data.transactionHash
      );

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
        tokenAddress: tokenAddress,
        amount: amount,
        transactionHash: result.data.transactionHash,
        timestamp: Math.floor(Date.now() / 1000)
      };

      return snipeEvent;
    } catch (error) {
      console.error('Error sniping token:', error);
      throw error;
    }
  }

  /**
   * Decode transaction data to understand what the wallet is doing
   */
  private decodeTransactionData(data: string): { method: string; params: any } {
    try {
      // Common function signatures for DeFi operations
      const functionSignatures = {
        '0xa9059cbb': 'transfer(address,uint256)',
        '0x23b872dd': 'transferFrom(address,address,uint256)',
        '0x095ea7b3': 'approve(address,uint256)',
        '0x38ed1739': 'swapExactTokensForTokens(uint256,uint256,address[],address,uint256)',
        '0x7ff36ab5': 'swapExactETHForTokens(uint256,address[],address,uint256)',
        '0x18cbafe5': 'swapExactTokensForETH(uint256,uint256,address[],address,uint256)',
        '0xfb3bdb41': 'swapExactTokensForTokensSupportingFeeOnTransferTokens(uint256,uint256,address[],address,uint256)',
        '0xb6f9de95': 'swapExactETHForTokensSupportingFeeOnTransferTokens(uint256,address[],address,uint256)',
        '0x4a25d94a': 'swapExactTokensForETHSupportingFeeOnTransferTokens(uint256,uint256,address[],address,uint256)'
      };

      const methodId = data.slice(0, 10);
      const method = functionSignatures[methodId as keyof typeof functionSignatures] || 'unknown';

      // Basic parameter decoding
      const params = data.slice(10);
      
      return {
        method,
        params: {
          rawData: params,
          methodId
        }
      };
    } catch (error) {
      return {
        method: 'unknown',
        params: { rawData: data }
      };
    }
  }

  /**
   * Get wallet balance
   */
  async getWalletBalance(address: string): Promise<string> {
    try {
      const balance = await this.provider.getBalance(address);
      return ethers.formatEther(balance);
    } catch (error) {
      console.error('Error getting wallet balance:', error);
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

      const [balance, decimals, symbol] = await Promise.all([
        tokenContract.balanceOf(walletAddress),
        tokenContract.decimals(),
        tokenContract.symbol()
      ]);

      return ethers.formatUnits(balance, decimals);
    } catch (error) {
      console.error('Error getting token balance:', error);
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
          console.log(`Error getting block ${blockNumber}:`, (error as Error).message);
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
      console.error('Error getting recent transactions:', error);
      throw error;
    }
  }

  /**
   * Check if transaction is a buy transaction
   */
  private isBuyTransaction(transaction: any): boolean {
    // Check if it's a direct ETH transfer (buying tokens)
    if (transaction.value > 0 && transaction.data === '0x') {
      return true;
    }

    // Check for common buy function signatures
    const buySignatures = [
      '0x7ff36ab5', // swapExactETHForTokens
      '0xb6f9de95', // swapExactETHForTokensSupportingFeeOnTransferTokens
      '0xfb3bdb41', // swapExactTokensForTokensSupportingFeeOnTransferTokens
      '0x38ed1739'  // swapExactTokensForTokens
    ];

    const methodId = transaction.data.slice(0, 10);
    return buySignatures.includes(methodId);
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
          tokenContract.symbol(),
          tokenContract.name()
        ]);

        return {
          tokenAddress: transaction.to,
          tokenSymbol: symbol,
          tokenName: name
        };
      }

      // For swap transactions, decode the data to get token address
      if (transaction.data.length > 10) {
        // This is a simplified version - in production you'd want more robust decoding
        const methodId = transaction.data.slice(0, 10);
        
        if (methodId === '0x7ff36ab5' || methodId === '0xb6f9de95') {
          // swapExactETHForTokens - token address is in the path
          const pathData = transaction.data.slice(10);
          // Simplified path extraction - in production use proper ABI decoding
          const tokenAddress = '0x' + pathData.slice(24, 64);
          
          const tokenContract = new ethers.Contract(
            tokenAddress,
            [
              'function symbol() view returns (string)',
              'function name() view returns (string)'
            ],
            this.provider
          );

          const [symbol, name] = await Promise.all([
            tokenContract.symbol(),
            tokenContract.name()
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
      console.error('Error extracting token info:', error);
      return null;
    }
  }
} 