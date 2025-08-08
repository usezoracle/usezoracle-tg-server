import fs from 'fs/promises';
import path from 'path'; // eslint-disable-line @typescript-eslint/no-unused-vars

import { ethers } from 'ethers';

import { Position, PositionsResponse } from '../types/index.js';
import { config } from '../config/index.js';
import { logger } from '../lib/logger.js';

export class PositionsService {
  private provider: ethers.JsonRpcProvider;
  private positions: Map<string, Position> = new Map();
  private baseChainId = 8453; // Base mainnet
  private storageFile = 'positions.json';
  
  // Configuration for blockchain scanning
  private readonly SCAN_BLOCKS = 1000; // Number of blocks to scan (reduced from 10000)
  private readonly CHUNK_SIZE = 100; // Number of blocks per chunk
  private readonly FALLBACK_BLOCKS = 100; // Very conservative fallback
  private readonly CHUNK_DELAY = 100; // Delay between chunks in ms

  constructor() {
    const providerUrl = config.providerUrl;
    
    logger.info({ providerUrl }, 'Initializing positions service');
    
    try {
      this.provider = new ethers.JsonRpcProvider(providerUrl);
      logger.info('Positions service initialized successfully');
      this.loadPositionsFromStorage();
    } catch (error) {
      logger.error({ err: error }, 'Failed to initialize positions service');
      throw new Error(`Failed to initialize positions service: ${(error as Error).message}`);
    }
  }

  /**
   * Load positions from persistent storage
   */
  private async loadPositionsFromStorage(): Promise<void> {
    try {
      const data = await fs.readFile(this.storageFile, 'utf-8');
      const positions = JSON.parse(data);
      
      for (const [id, position] of Object.entries(positions)) {
        this.positions.set(id, position as Position);
      }
      
      logger.info({ count: this.positions.size }, 'Loaded positions from storage');
    } catch (_error) {
      logger.info('No existing positions file found, starting fresh');
    }
  }

  /**
   * Save positions to persistent storage
   */
  private async savePositionsToStorage(): Promise<void> {
    try {
      const positionsObj = Object.fromEntries(this.positions);
      await fs.writeFile(this.storageFile, JSON.stringify(positionsObj, null, 2));
      logger.info({ count: this.positions.size }, 'Saved positions to storage');
    } catch (error) {
      logger.error({ err: error }, 'Failed to save positions to storage');
    }
  }

  /**
   * Fetch positions from blockchain transactions for a specific account
   * Uses chunked approach to avoid "Block range is too large" errors
   */
  async fetchPositionsFromBlockchain(accountName: string): Promise<Position[]> {
    try {
      logger.info({ accountName }, 'Fetching blockchain positions');
      
      // Get account address from CDP service
      const { CdpService } = await import('./cdpService.js');
      const cdpService = CdpService.getInstance();
      
      const account = await cdpService.getAccount(accountName);
      const accountAddress = account.data.address;
      
      logger.info({ accountAddress }, 'Using account address');
      
      // Get recent transactions for this account
      const latestBlock = await this.provider.getBlockNumber();
      const fromBlock = Math.max(0, latestBlock - this.SCAN_BLOCKS);
      
      logger.info({ fromBlock, latestBlock, scanBlocks: this.SCAN_BLOCKS }, 'Scanning blocks');
      
      const positions: Position[] = [];
      
      // Use chunked approach to avoid "Block range is too large" errors
      const chunks = Math.ceil((latestBlock - fromBlock) / this.CHUNK_SIZE);
      
              for (let i = 0; i < chunks; i++) {
          const chunkFromBlock = fromBlock + (i * this.CHUNK_SIZE);
          const chunkToBlock = Math.min(chunkFromBlock + this.CHUNK_SIZE - 1, latestBlock);
        
        try {
          logger.debug({ chunk: i + 1, chunks, chunkFromBlock, chunkToBlock }, 'Processing chunk');
          
          // Scan for token purchase transactions in this chunk
          const logs = await this.provider.getLogs({
            fromBlock: chunkFromBlock,
            toBlock: chunkToBlock,
            address: accountAddress
          });
          
          logger.debug({ logs: logs.length, chunk: i + 1 }, 'Found logs in chunk');
          
          for (const log of logs) {
            try {
              const transaction = await this.provider.getTransaction(log.transactionHash!);
              const block = await this.provider.getBlock(log.blockNumber!);
              
              if (transaction && block && transaction.value > 0) {
                // This is a token purchase transaction
                const tokenAddress = transaction.to!;
                const tokenInfo = await this.getTokenInfo(tokenAddress);
                const entryPrice = await this.getTokenPrice(tokenAddress);
                
                const positionId = `${accountName}-${tokenAddress}-${block.timestamp}`;
                
                const position: Position = {
                  id: positionId,
                  accountName,
                  tokenAddress,
                  tokenSymbol: tokenInfo.symbol,
                  tokenName: tokenInfo.name,
                  amount: ethers.formatEther(transaction.value),
                  entryPrice,
                  status: 'open',
                  transactionHash: log.transactionHash!,
                  timestamp: Number(block.timestamp)
                };
                
                positions.push(position);
                this.positions.set(positionId, position);
                
                logger.info({ symbol: tokenInfo.symbol, amount: ethers.formatEther(transaction.value) }, 'Found position');
              }
            } catch (error) {
              logger.warn({ err: error, tx: log.transactionHash }, 'Error processing transaction');
              continue;
            }
          }
          
          // Add a small delay between chunks to avoid rate limiting
          if (i < chunks - 1) {
            await new Promise(resolve => setTimeout(resolve, this.CHUNK_DELAY));
          }
          
        } catch (error) {
          logger.warn({ err: error, chunk: i + 1 }, 'Error processing chunk');
          continue; // Continue with next chunk even if this one fails
        }
      }
      
      logger.info({ count: positions.length, accountName }, 'Found positions from blockchain');
      await this.savePositionsToStorage();
      
      return positions;
    } catch (error) {
      logger.error({ err: error }, 'Error fetching positions from blockchain');
      
      // If chunked approach fails, try a more conservative approach
      logger.info('Trying fallback approach with smaller block range...');
      return this.fetchPositionsFromBlockchainFallback(accountName);
    }
  }

  /**
   * Fallback method for fetching positions with very conservative block range
   */
  private async fetchPositionsFromBlockchainFallback(accountName: string): Promise<Position[]> {
    try {
      logger.info({ accountName }, 'Using fallback method for positions');
      
      // Get account address from CDP service
      const { CdpService } = await import('./cdpService.js');
      const cdpService = CdpService.getInstance();
      
      const account = await cdpService.getAccount(accountName);
      const accountAddress = account.data.address;
      
      const latestBlock = await this.provider.getBlockNumber();
      const fromBlock = Math.max(0, latestBlock - this.FALLBACK_BLOCKS);
      
      logger.info({ fromBlock, latestBlock, fallbackBlocks: this.FALLBACK_BLOCKS }, 'Fallback scanning blocks');
      
      const positions: Position[] = [];
      
      try {
        // Try with a very small block range
        const logs = await this.provider.getLogs({
          fromBlock: fromBlock,
          toBlock: latestBlock,
          address: accountAddress
        });
        
        logger.debug({ logs: logs.length }, 'Found logs in fallback scan');
        
        for (const log of logs) {
          try {
            const transaction = await this.provider.getTransaction(log.transactionHash!);
            const block = await this.provider.getBlock(log.blockNumber!);
            
            if (transaction && block && transaction.value > 0) {
              const tokenAddress = transaction.to!;
              const tokenInfo = await this.getTokenInfo(tokenAddress);
              const entryPrice = await this.getTokenPrice(tokenAddress);
              
              const positionId = `${accountName}-${tokenAddress}-${block.timestamp}`;
              
              const position: Position = {
                id: positionId,
                accountName,
                tokenAddress,
                tokenSymbol: tokenInfo.symbol,
                tokenName: tokenInfo.name,
                amount: ethers.formatEther(transaction.value),
                entryPrice,
                status: 'open',
                transactionHash: log.transactionHash!,
                timestamp: Number(block.timestamp)
              };
              
              positions.push(position);
              this.positions.set(positionId, position);
              
              logger.info({ symbol: tokenInfo.symbol, amount: ethers.formatEther(transaction.value) }, 'Found position (fallback)');
            }
          } catch (error) {
            logger.warn({ err: error, tx: log.transactionHash }, 'Error processing transaction (fallback)');
            continue;
          }
        }
      } catch (error) {
        logger.warn({ err: error }, 'Fallback method also failed');
        logger.info('Returning empty positions array - will rely on CDP service data');
      }
      
      logger.info({ count: positions.length, accountName }, 'Fallback found positions');
      await this.savePositionsToStorage();
      
      return positions;
    } catch (error) {
      logger.error({ err: error }, 'Error in fallback method');
      return []; // Return empty array if everything fails
    }
  }

  /**
   * Fetch all positions from CDP service accounts
   */
  async fetchPositionsFromCDP(): Promise<Position[]> {
    try {
      logger.info('Fetching positions from CDP service');
      
      const { CdpService } = await import('./cdpService.js');
      const cdpService = CdpService.getInstance();
      
      // Get all accounts from CDP
      const accountsResponse = await cdpService.listAccounts();
      const accounts = accountsResponse.data.accounts || [];
      
      const allPositions: Position[] = [];
      
      for (const account of accounts) {
        if (!account.name) continue;
        try {
          logger.info({ accountName: account.name }, 'Processing account');
          
          // Get account balances to identify positions
          const balancesResponse = await cdpService.getBalances(account.name);
          const balances = balancesResponse.data.balances;
          
          for (const balance of balances) {
            // Skip ETH balance, focus on token balances
            if (balance.token.contractAddress === "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE") {
              continue;
            }
            
                         // If there's a token balance, it represents a position
             if (parseFloat(balance.amount.formatted) > 0 && balance.token.contractAddress) {
               const tokenInfo = await this.getTokenInfo(balance.token.contractAddress);
               const currentPrice = await this.getTokenPrice(balance.token.contractAddress);
               
               const positionId = `${account.name}-${balance.token.contractAddress}-${Date.now()}`;
              
              const position: Position = {
                id: positionId,
                accountName: account.name,
                tokenAddress: balance.token.contractAddress,
                tokenSymbol: tokenInfo.symbol,
                tokenName: tokenInfo.name,
                amount: balance.amount.formatted,
                entryPrice: currentPrice, // Use current price as entry (approximation)
                currentPrice,
                status: 'open',
                transactionHash: 'unknown', // We don't have the original transaction hash
                timestamp: Math.floor(Date.now() / 1000)
              };
              
              allPositions.push(position);
              this.positions.set(positionId, position);
            }
          }
        } catch (error) {
          logger.warn({ err: error, accountName: account.name }, 'Error processing account');
          continue;
        }
      }
      
      logger.info({ count: allPositions.length }, 'Found positions from CDP service');
      await this.savePositionsToStorage();
      
      return allPositions;
    } catch (error) {
      logger.error({ err: error }, 'Error fetching positions from CDP');
      throw error;
    }
  }

  /**
   * Sync positions from all sources
   */
  async syncPositions(): Promise<void> {
    try {
      logger.info('Syncing positions from all sources');
      
      // 1. Load from persistent storage
      await this.loadPositionsFromStorage();
      
      // 2. Fetch from CDP service
      await this.fetchPositionsFromCDP();
      
      // 3. Fetch from blockchain for each account
      const { CdpService } = await import('./cdpService.js');
      const cdpService = CdpService.getInstance();
      
      const accountsResponse = await cdpService.listAccounts();
      const accounts = accountsResponse.data.accounts || [];
      
      for (const account of accounts) {
        if (!account.name) continue;
        try {
          await this.fetchPositionsFromBlockchain(account.name);
        } catch (error) {
          logger.warn({ err: error, accountName: account.name }, 'Error syncing positions for account');
        }
      }
      
      logger.info({ total: this.positions.size }, 'Position sync completed');
    } catch (error) {
      logger.error({ err: error }, 'Error syncing positions');
      throw error;
    }
  }

  /**
   * Add a new position (when a snipe is executed)
   */
  async addPosition(
    accountName: string,
    tokenAddress: string,
    amount: string,
    transactionHash: string
  ): Promise<Position> {
    try {
      // Get token information
      const tokenInfo = await this.getTokenInfo(tokenAddress);
      
      // Generate position ID
      const positionId = `${accountName}-${tokenAddress}-${Date.now()}`;
      
      // Get current token price (simplified - in real implementation, you'd use price feeds)
      const entryPrice = await this.getTokenPrice(tokenAddress);
      
      const position: Position = {
        id: positionId,
        accountName,
        tokenAddress,
        tokenSymbol: tokenInfo.symbol,
        tokenName: tokenInfo.name,
        amount,
        entryPrice,
        status: 'open',
        transactionHash,
        timestamp: Math.floor(Date.now() / 1000)
      };

      this.positions.set(positionId, position);
      logger.info({ positionId }, 'Position added');
      
      // Save to persistent storage
      await this.savePositionsToStorage();
      
      return position;
    } catch (error) {
      logger.error({ err: error }, 'Error adding position');
      throw error;
    }
  }

  /**
   * Close a position (when a position is sold)
   */
  async closePosition(
    positionId: string,
    exitTransactionHash: string
  ): Promise<Position> {
    try {
      const position = this.positions.get(positionId);
      if (!position) {
        throw new Error(`Position not found: ${positionId}`);
      }

      if (position.status !== 'open') {
        throw new Error(`Position is not open: ${positionId}`);
      }

      // Get current price for PnL calculation
      const currentPrice = await this.getTokenPrice(position.tokenAddress);
      const entryPrice = parseFloat(position.entryPrice);
      const exitPrice = parseFloat(currentPrice);
      
      // Calculate PnL
      const pnl = (exitPrice - entryPrice) * parseFloat(position.amount);
      const pnlPercentage = ((exitPrice - entryPrice) / entryPrice) * 100;

      const updatedPosition: Position = {
        ...position,
        status: 'closed',
        currentPrice,
        pnl: pnl.toFixed(6),
        pnlPercentage: parseFloat(pnlPercentage.toFixed(2)),
        closedAt: Math.floor(Date.now() / 1000),
        exitTransactionHash
      };

      this.positions.set(positionId, updatedPosition);
      logger.info({ positionId, pnl: pnl.toFixed(6), pnlPercentage: pnlPercentage.toFixed(2) }, 'Position closed');
      
      // Save to persistent storage
      await this.savePositionsToStorage();
      
      return updatedPosition;
    } catch (error) {
      logger.error({ err: error }, 'Error closing position');
      throw error;
    }
  }

  /**
   * Update position status to pending (when a transaction is pending)
   */
  async setPositionPending(positionId: string): Promise<Position> {
    try {
      const position = this.positions.get(positionId);
      if (!position) {
        throw new Error(`Position not found: ${positionId}`);
      }

      const updatedPosition: Position = {
        ...position,
        status: 'pending'
      };

      this.positions.set(positionId, updatedPosition);
      logger.info({ positionId }, 'Position set to pending');
      
      // Save to persistent storage
      await this.savePositionsToStorage();
      
      return updatedPosition;
    } catch (error) {
      logger.error({ err: error }, 'Error setting position to pending');
      throw error;
    }
  }

  /**
   * Get all positions with filtering
   */
  async getPositions(
    accountName?: string,
    status?: 'open' | 'closed' | 'pending'
  ): Promise<PositionsResponse> {
    try {
      // Sync positions from all sources first
      await this.syncPositions();
      
      let positions = Array.from(this.positions.values());

      // Filter by account name if provided
      if (accountName) {
        positions = positions.filter(p => p.accountName === accountName);
      }

      // Filter by status if provided
      if (status) {
        positions = positions.filter(p => p.status === status);
      }

      // Update current prices and PnL for open positions
      const updatedPositions = await Promise.all(
        positions.map(async (position) => {
          if (position.status === 'open') {
            try {
              const currentPrice = await this.getTokenPrice(position.tokenAddress);
              const entryPrice = parseFloat(position.entryPrice);
              const exitPrice = parseFloat(currentPrice);
              
              const pnl = (exitPrice - entryPrice) * parseFloat(position.amount);
              const pnlPercentage = ((exitPrice - entryPrice) / entryPrice) * 100;

              return {
                ...position,
                currentPrice,
                pnl: pnl.toFixed(6),
                pnlPercentage: parseFloat(pnlPercentage.toFixed(2))
              };
              } catch (error) {
                logger.warn({ err: error, tokenAddress: position.tokenAddress }, 'Could not update price');
              return position;
            }
          }
          return position;
        })
      );

      // Group positions by status
      const open = updatedPositions.filter(p => p.status === 'open');
      const closed = updatedPositions.filter(p => p.status === 'closed');
      const pending = updatedPositions.filter(p => p.status === 'pending');

      // Calculate summary
      const totalPnl = closed.reduce((sum, p) => sum + parseFloat(p.pnl || '0'), 0);
      const totalPnlPercentage = closed.length > 0 
        ? closed.reduce((sum, p) => sum + (p.pnlPercentage || 0), 0) / closed.length 
        : 0;

      const response: PositionsResponse = {
        open,
        closed,
        pending,
        summary: {
          totalOpen: open.length,
          totalClosed: closed.length,
          totalPending: pending.length,
          totalPnl: totalPnl.toFixed(6),
          totalPnlPercentage: parseFloat(totalPnlPercentage.toFixed(2))
        }
      };

      return response;
    } catch (error) {
      logger.error({ err: error }, 'Error getting positions');
      throw error;
    }
  }

  /**
   * Get a specific position by ID
   */
  async getPosition(positionId: string): Promise<Position | null> {
    try {
      // Sync positions first
      await this.syncPositions();
      
      const position = this.positions.get(positionId);
      if (!position) {
        return null;
      }

      // Update current price and PnL if position is open
      if (position.status === 'open') {
        try {
          const currentPrice = await this.getTokenPrice(position.tokenAddress);
          const entryPrice = parseFloat(position.entryPrice);
          const exitPrice = parseFloat(currentPrice);
          
          const pnl = (exitPrice - entryPrice) * parseFloat(position.amount);
          const pnlPercentage = ((exitPrice - entryPrice) / entryPrice) * 100;

          return {
            ...position,
            currentPrice,
            pnl: pnl.toFixed(6),
            pnlPercentage: parseFloat(pnlPercentage.toFixed(2))
          };
        } catch (error) {
          logger.warn({ err: error, tokenAddress: position.tokenAddress }, 'Could not update price');
          return position;
        }
      }

      return position;
    } catch (error) {
      logger.error({ err: error }, 'Error getting position');
      throw error;
    }
  }

  /**
   * Get token information (name, symbol, decimals)
   */
  private async getTokenInfo(tokenAddress: string): Promise<{ name: string; symbol: string; decimals: number }> {
    try {
      const tokenContract = new ethers.Contract(
        tokenAddress,
        [
          'function name() view returns (string)',
          'function symbol() view returns (string)',
          'function decimals() view returns (uint8)'
        ],
        this.provider
      );

      const [name, symbol, decimals] = await Promise.all([
        tokenContract.getFunction('name')() as Promise<string>,
        tokenContract.getFunction('symbol')() as Promise<string>,
        tokenContract.getFunction('decimals')() as Promise<number>
      ]);

      return {
        name: name || 'Unknown',
        symbol: symbol || 'Unknown',
        decimals: Number(decimals)
      };
    } catch (error) {
      logger.warn({ err: error, tokenAddress }, 'Could not fetch token info');
      return {
        name: 'Unknown',
        symbol: 'Unknown',
        decimals: 18
      };
    }
  }

  /**
   * Get token price (simplified implementation)
   * In a real implementation, you would use price feeds like Chainlink or DEX aggregators
   */
  private async getTokenPrice(tokenAddress: string): Promise<string> {
    try {
      // This is a simplified price calculation
      // In a real implementation, you would:
      // 1. Use Chainlink price feeds
      // 2. Query DEX aggregators like 1inch
      // 3. Calculate price from liquidity pools
      
      // For now, return a mock price based on token address
      const mockPrice = Math.random() * 100 + 0.001; // Random price between 0.001 and 100
      return mockPrice.toFixed(6);
    } catch (error) {
      logger.warn({ err: error, tokenAddress }, 'Could not get price');
      return '0.000000';
    }
  }

  /**
   * Get positions by account name
   */
  async getPositionsByAccount(accountName: string): Promise<PositionsResponse> {
    return this.getPositions(accountName);
  }

  /**
   * Get positions by status
   */
  async getPositionsByStatus(status: 'open' | 'closed' | 'pending'): Promise<Position[]> {
    const response = await this.getPositions(undefined, status);
    return response[status];
  }

  /**
   * Create a limit order that will trigger when the token reaches a specific price
   * @param accountName - The account name
   * @param tokenAddress - The token contract address
   * @param orderType - Type of order (buy or sell)
   * @param targetPrice - The target price at which the order should trigger
   * @param amount - The amount of tokens to buy/sell
   * @param slippage - Maximum allowed slippage percentage (optional)
   * @returns The created position with pending status
   */
  async createLimitOrder(
    accountName: string,
    tokenAddress: string,
    orderType: 'buy' | 'sell',
    targetPrice: string,
    amount: string,
    _slippage?: string
  ): Promise<Position> {
    try {
      logger.info({ orderType, accountName, amount, targetPrice }, 'Creating limit order');
      
      // Get token information
      const tokenInfo = await this.getTokenInfo(tokenAddress);
      
      // Generate unique position ID
      const timestamp = Date.now();
      const positionId = `${accountName}-${tokenAddress}-limit-${orderType}-${timestamp}`;
      
      // Create the position with pending status
      const position: Position = {
        id: positionId,
        accountName,
        tokenAddress,
        tokenSymbol: tokenInfo.symbol,
        tokenName: tokenInfo.name,
        amount,
        entryPrice: targetPrice, // Target price becomes the entry price
        currentPrice: '0.000000', // Will be updated when order is triggered
        pnl: '0.000000',
        pnlPercentage: 0,
        status: 'pending', // Start as pending until price condition is met
        transactionHash: '', // No transaction hash yet
        timestamp,
        closedAt: undefined,
        exitTransactionHash: undefined
      };
      
      // Store the position
      this.positions.set(positionId, position);
      await this.savePositionsToStorage();
      
      logger.info({ orderType, positionId }, 'Limit order created');
      logger.info({ symbol: tokenInfo.symbol, targetPrice }, 'Waiting for target price');
      
      return position;
    } catch (error) {
      logger.error({ err: error }, 'Error creating limit order');
      throw new Error(`Failed to create limit order: ${(error as Error).message}`);
    }
  }

  /**
   * Check if any pending limit orders should be triggered
   * This method should be called periodically to check price conditions
   */
  async checkPendingLimitOrders(): Promise<Position[]> {
    try {
      const triggeredOrders: Position[] = [];
      
      // Get all pending positions
      const pendingPositions = await this.getPositionsByStatus('pending');
      
      for (const position of pendingPositions) {
        try {
          const currentPrice = await this.getTokenPrice(position.tokenAddress);
          const targetPrice = parseFloat(position.entryPrice);
          const currentPriceNum = parseFloat(currentPrice);
          
          // Check if price condition is met
          // For buy orders: current price <= target price
          // For sell orders: current price >= target price
          const positionId = position.id;
          const isBuyOrder = positionId.includes('-limit-buy-');
          const isSellOrder = positionId.includes('-limit-sell-');
          
          let shouldTrigger = false;
          
          if (isBuyOrder && currentPriceNum <= targetPrice) {
            shouldTrigger = true;
            logger.info({ token: position.tokenSymbol, currentPrice, targetPrice }, 'Buy order triggered');
          } else if (isSellOrder && currentPriceNum >= targetPrice) {
            shouldTrigger = true;
            logger.info({ token: position.tokenSymbol, currentPrice, targetPrice }, 'Sell order triggered');
          }
          
          if (shouldTrigger) {
            // Update position to open status
            const updatedPosition: Position = {
              ...position,
              status: 'open',
              currentPrice,
              transactionHash: `limit-triggered-${Date.now()}`, // Mock transaction hash
              timestamp: Date.now()
            };
            
            this.positions.set(positionId, updatedPosition);
            triggeredOrders.push(updatedPosition);
          }
        } catch (error) {
          logger.warn({ err: error, tokenAddress: position.tokenAddress }, 'Could not check price');
        }
      }
      
      if (triggeredOrders.length > 0) {
        await this.savePositionsToStorage();
        logger.info({ count: triggeredOrders.length }, 'Triggered limit orders');
      }
      
      return triggeredOrders;
    } catch (error) {
      logger.error({ err: error }, 'Error checking pending limit orders');
      throw new Error(`Failed to check pending limit orders: ${(error as Error).message}`);
    }
  }
} 