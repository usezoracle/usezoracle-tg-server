import fs from 'fs/promises';
import path from 'path'; // eslint-disable-line @typescript-eslint/no-unused-vars

import { Position, PositionsResponse } from '../types/index.js';
import { logger } from '../lib/logger.js';

import { TokenDetailsService } from './tokenDetailsService.js';

export class PositionsService {
  private positions: Map<string, Position> = new Map();
  private storageFile = 'positions.json';

  constructor() {
    logger.info('Initializing positions service');
    this.loadPositionsFromStorage().catch((err) => {
      logger.warn({ err }, 'Unable to eagerly load positions from storage');
    });
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

  // Deprecated: on-chain scanning removed. Positions derive from CDP balances only.

  // Deprecated: fallback scanning removed.

  /**
   * Fetch all positions from CDP service accounts
   */
  async fetchPositionsFromCDP(): Promise<Position[]> {
    try {
      logger.info('Fetching positions from CDP service');
      
      const { CdpService } = await import('./cdpService.js');
      const cdpService = CdpService.getInstance();
      const tokenDetails = TokenDetailsService.getInstance();
      
      // Get all accounts from CDP
      const accountsResponse = await cdpService.listAccounts();
      const accounts = accountsResponse.data.accounts || [];
      
      const allPositions: Position[] = [];
      // Preserve existing entry prices by canonical id (account-token)
      const existingEntryPriceById = new Map<string, string>();
      for (const [posId, pos] of this.positions.entries()) {
        const canonicalIdMatch = posId.match(/^(.+)-0x[a-fA-F0-9]{40}$/);
        const isCanonical = canonicalIdMatch !== null;
        if (isCanonical && pos.entryPrice) {
          existingEntryPriceById.set(posId, pos.entryPrice);
        }
      }
      // Build a fresh positions map (canonical ids only)
      const rebuilt = new Map<string, Position>();
      
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
            const quantity = parseFloat(balance.amount.formatted);
            if (quantity > 0 && balance.token.contractAddress) {
              const tokenAddress = balance.token.contractAddress;
              const id = `${account.name}-${tokenAddress}`;

              // Get current price from token details service (GeckoTerminal)
              let currentPrice = '0.000000';
              try {
                const details = await tokenDetails.getTokenDetailsWithPools({
                  network: 'base',
                  address: tokenAddress,
                });
                const priceUsd = details?.data?.attributes?.price_usd;
                if (priceUsd) currentPrice = Number(priceUsd).toFixed(6);
              } catch (priceErr) {
                logger.warn({ err: priceErr, tokenAddress }, 'Failed to fetch current price from token details');
              }

              // Preserve existing entry price if present; otherwise set to current price
              const preserved = existingEntryPriceById.get(id);
              const entryPrice = preserved && parseFloat(preserved) > 0 ? preserved : currentPrice;

              // Compute PnL (long)
              const buy = parseFloat(entryPrice || '0');
              const sell = parseFloat(currentPrice || '0');
              const pnlValue = buy > 0 ? (sell - buy) * quantity : 0;
              const pnlPct = buy > 0 ? ((sell - buy) / buy) * 100 : 0;

              const position: Position = {
                id,
                accountName: account.name,
                tokenAddress,
                tokenSymbol: balance.token.symbol,
                tokenName: balance.token.name,
                amount: balance.amount.formatted,
                entryPrice: entryPrice || '0.000000',
                currentPrice,
                pnl: pnlValue.toFixed(6),
                pnlPercentage: parseFloat(pnlPct.toFixed(2)),
                status: 'open',
                transactionHash: 'unknown',
                timestamp: Math.floor(Date.now() / 1000),
              };

              allPositions.push(position);
              rebuilt.set(id, position);
            }
          }
        } catch (error) {
          logger.warn({ err: error, accountName: account.name }, 'Error processing account');
          continue;
        }
      }
      
      // Replace in-memory positions with rebuilt canonical set
      this.positions = rebuilt;
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
      
      // 2. Fetch from CDP service only (no on-chain scanning)
      await this.fetchPositionsFromCDP();
      
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
      // Fetch metadata and current price as entry from token details
      const tokenDetails = TokenDetailsService.getInstance();
      let tokenSymbol = '';
      let tokenName = '';
      let entryPrice = '0.000000';
      try {
        const details = await tokenDetails.getTokenDetailsWithPools({ network: 'base', address: tokenAddress });
        const attrs = details?.data?.attributes as any;
        const priceUsd = attrs?.price_usd;
        tokenSymbol = attrs?.symbol || '';
        tokenName = attrs?.name || '';
        if (priceUsd) entryPrice = Number(priceUsd).toFixed(6);
      } catch (err) {
        logger.warn({ err, tokenAddress }, 'Failed to fetch entry price from token details');
      }

      // Generate position ID
      const positionId = `${accountName}-${tokenAddress}`;
      
      const position: Position = {
        id: positionId,
        accountName,
        tokenAddress,
        tokenSymbol,
        tokenName,
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
      const tokenDetails = TokenDetailsService.getInstance();
      let currentPrice = '0.000000';
      try {
        const details = await tokenDetails.getTokenDetailsWithPools({ network: 'base', address: position.tokenAddress });
        const priceUsd = details?.data?.attributes?.price_usd;
        if (priceUsd) currentPrice = Number(priceUsd).toFixed(6);
      } catch (err) {
        logger.warn({ err, tokenAddress: position.tokenAddress }, 'Failed to fetch current price for close');
      }
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
              const tokenDetails = TokenDetailsService.getInstance();
              let currentPrice = '0.000000';
              try {
                const details = await tokenDetails.getTokenDetailsWithPools({ network: 'base', address: position.tokenAddress });
                const priceUsd = details?.data?.attributes?.price_usd;
                if (priceUsd) currentPrice = Number(priceUsd).toFixed(6);
              } catch (err) {
                logger.warn({ err, tokenAddress: position.tokenAddress }, 'Could not update price');
              }
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
          const tokenDetails = TokenDetailsService.getInstance();
          let currentPrice = '0.000000';
          try {
            const details = await tokenDetails.getTokenDetailsWithPools({ network: 'base', address: position.tokenAddress });
            const priceUsd = details?.data?.attributes?.price_usd;
            if (priceUsd) currentPrice = Number(priceUsd).toFixed(6);
          } catch (err) {
            logger.warn({ err, tokenAddress: position.tokenAddress }, 'Failed to fetch current price');
          }
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

  // Removed ethers-based metadata/price helpers in favor of TokenDetailsService

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
      
      // Fetch token info via token details service
      const tokenDetails = TokenDetailsService.getInstance();
      let tokenSymbol = '';
      let tokenName = '';
      try {
        const details = await tokenDetails.getTokenDetailsWithPools({ network: 'base', address: tokenAddress });
        const attrs = details?.data?.attributes as any;
        tokenSymbol = attrs?.symbol || '';
        tokenName = attrs?.name || '';
      } catch (err) {
        logger.warn({ err, tokenAddress }, 'Failed to fetch token metadata for limit order');
      }
      
      // Generate unique position ID
      const timestamp = Date.now();
      const positionId = `${accountName}-${tokenAddress}-limit-${orderType}-${timestamp}`;
      
      // Create the position with pending status
      const position: Position = {
        id: positionId,
        accountName,
        tokenAddress,
        tokenSymbol,
        tokenName,
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
      logger.info({ symbol: tokenSymbol, targetPrice }, 'Waiting for target price');
      
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
          const tokenDetails = TokenDetailsService.getInstance();
          let currentPrice = '0.000000';
          try {
            const details = await tokenDetails.getTokenDetailsWithPools({ network: 'base', address: position.tokenAddress });
            const priceUsd = details?.data?.attributes?.price_usd;
            if (priceUsd) currentPrice = Number(priceUsd).toFixed(6);
          } catch (err) {
            logger.warn({ err, tokenAddress: position.tokenAddress }, 'Failed to fetch current price for pending order');
          }
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