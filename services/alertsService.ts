import fs from 'fs/promises';

import { ethers } from 'ethers';

import { config } from '../config/index.js';
import { logger } from '../lib/logger.js';
import {
  PriceAlert,
  PortfolioAlert,
  TradeAlert,
  MarketAlert,
  CopyTradingAlert,
  AlertResponse
} from '../types/index.js';

export class AlertsService {
  private provider: ethers.JsonRpcProvider;
  private priceAlerts: Map<string, PriceAlert> = new Map();
  private portfolioAlerts: Map<string, PortfolioAlert> = new Map();
  private tradeAlerts: Map<string, TradeAlert> = new Map();
  private marketAlerts: Map<string, MarketAlert> = new Map();
  private copyTradingAlerts: Map<string, CopyTradingAlert> = new Map();
  private storageFile = 'alerts.json';
  private baseChainId = 8453; // Base mainnet

  constructor() {
    const providerUrl = config.providerUrl;
    
    logger.info({ providerUrl }, 'Initializing alerts service');
    
    try {
      this.provider = new ethers.JsonRpcProvider(providerUrl);
      logger.info('Alerts service initialized successfully');
      this.loadAlertsFromStorage();
    } catch (error) {
      logger.error({ err: error }, 'Failed to initialize alerts service');
      throw new Error(`Failed to initialize alerts service: ${(error as Error).message}`);
    }
  }

  /**
   * Load alerts from persistent storage
   */
  private async loadAlertsFromStorage(): Promise<void> {
    try {
      const data = await fs.readFile(this.storageFile, 'utf-8');
      const alerts = JSON.parse(data);
      
      // Load price alerts
      if (alerts.priceAlerts) {
        for (const [id, alert] of Object.entries(alerts.priceAlerts)) {
          this.priceAlerts.set(id, alert as PriceAlert);
        }
      }
      
      // Load portfolio alerts
      if (alerts.portfolioAlerts) {
        for (const [id, alert] of Object.entries(alerts.portfolioAlerts)) {
          this.portfolioAlerts.set(id, alert as PortfolioAlert);
        }
      }
      
      // Load trade alerts
      if (alerts.tradeAlerts) {
        for (const [id, alert] of Object.entries(alerts.tradeAlerts)) {
          this.tradeAlerts.set(id, alert as TradeAlert);
        }
      }
      
      // Load market alerts
      if (alerts.marketAlerts) {
        for (const [id, alert] of Object.entries(alerts.marketAlerts)) {
          this.marketAlerts.set(id, alert as MarketAlert);
        }
      }
      
      // Load copy trading alerts
      if (alerts.copyTradingAlerts) {
        for (const [id, alert] of Object.entries(alerts.copyTradingAlerts)) {
          this.copyTradingAlerts.set(id, alert as CopyTradingAlert);
        }
      }
      
      logger.info({ price: this.priceAlerts.size, portfolio: this.portfolioAlerts.size, trade: this.tradeAlerts.size, market: this.marketAlerts.size, copy: this.copyTradingAlerts.size }, 'Loaded alerts from storage');
    } catch (_error) {
      logger.info('No existing alerts file found, starting fresh');
    }
  }

  /**
   * Save alerts to persistent storage
   */
  private async saveAlertsToStorage(): Promise<void> {
    try {
      const alertsObj = {
        priceAlerts: Object.fromEntries(this.priceAlerts),
        portfolioAlerts: Object.fromEntries(this.portfolioAlerts),
        tradeAlerts: Object.fromEntries(this.tradeAlerts),
        marketAlerts: Object.fromEntries(this.marketAlerts),
        copyTradingAlerts: Object.fromEntries(this.copyTradingAlerts)
      };
      
      await fs.writeFile(this.storageFile, JSON.stringify(alertsObj, null, 2));
      logger.info('Saved alerts to storage');
    } catch (error) {
      logger.error({ err: error }, 'Failed to save alerts to storage');
    }
  }

  /**
   * Create a price alert
   */
  async createPriceAlert(
    accountName: string,
    tokenAddress: string,
    targetPrice: string,
    condition: 'above' | 'below'
  ): Promise<PriceAlert> {
    try {
      const tokenInfo = await this.getTokenInfo(tokenAddress);
      const alertId = `price-${accountName}-${tokenAddress}-${Date.now()}`;
      
      const alert: PriceAlert = {
        id: alertId,
        accountName,
        tokenAddress,
        tokenSymbol: tokenInfo.symbol,
        tokenName: tokenInfo.name,
        targetPrice,
        condition,
        isActive: true,
        createdAt: Math.floor(Date.now() / 1000)
      };

      this.priceAlerts.set(alertId, alert);
      await this.saveAlertsToStorage();
      
      logger.info({ symbol: tokenInfo.symbol, condition, targetPrice }, 'Price alert created');
      return alert;
    } catch (error) {
      logger.error({ err: error }, 'Error creating price alert');
      throw error;
    }
  }

  /**
   * Create a portfolio alert
   */
  async createPortfolioAlert(
    accountName: string,
    alertType: 'value_increase' | 'value_decrease' | 'pnl_threshold',
    threshold: string,
    condition: 'above' | 'below'
  ): Promise<PortfolioAlert> {
    try {
      const alertId = `portfolio-${accountName}-${alertType}-${Date.now()}`;
      
      const alert: PortfolioAlert = {
        id: alertId,
        accountName,
        alertType,
        threshold,
        condition,
        isActive: true,
        createdAt: Math.floor(Date.now() / 1000)
      };

      this.portfolioAlerts.set(alertId, alert);
      await this.saveAlertsToStorage();
      
      logger.info({ alertType, condition, threshold }, 'Portfolio alert created');
      return alert;
    } catch (error) {
      logger.error({ err: error }, 'Error creating portfolio alert');
      throw error;
    }
  }

  /**
   * Create a trade alert
   */
  async createTradeAlert(
    accountName: string,
    alertType: 'successful_trade' | 'failed_transaction' | 'large_trade',
    tokenAddress?: string,
    amount?: string
  ): Promise<TradeAlert> {
    try {
      const alertId = `trade-${accountName}-${alertType}-${Date.now()}`;
      
      let tokenSymbol: string | undefined;
      if (tokenAddress) {
        const tokenInfo = await this.getTokenInfo(tokenAddress);
        tokenSymbol = tokenInfo.symbol;
      }
      
      const alert: TradeAlert = {
        id: alertId,
        accountName,
        alertType,
        tokenAddress,
        tokenSymbol,
        amount,
        isActive: true,
        createdAt: Math.floor(Date.now() / 1000)
      };

      this.tradeAlerts.set(alertId, alert);
      await this.saveAlertsToStorage();
      
      logger.info({ alertType, accountName }, 'Trade alert created');
      return alert;
    } catch (error) {
      logger.error({ err: error }, 'Error creating trade alert');
      throw error;
    }
  }

  /**
   * Create a market alert
   */
  async createMarketAlert(
    alertType: 'price_spike' | 'volume_surge' | 'market_opportunity',
    threshold: string,
    condition: 'above' | 'below',
    tokenAddress?: string
  ): Promise<MarketAlert> {
    try {
      const alertId = `market-${alertType}-${Date.now()}`;
      
      let tokenSymbol: string | undefined;
      if (tokenAddress) {
        const tokenInfo = await this.getTokenInfo(tokenAddress);
        tokenSymbol = tokenInfo.symbol;
      }
      
      const alert: MarketAlert = {
        id: alertId,
        alertType,
        tokenAddress,
        tokenSymbol,
        threshold,
        condition,
        isActive: true,
        createdAt: Math.floor(Date.now() / 1000)
      };

      this.marketAlerts.set(alertId, alert);
      await this.saveAlertsToStorage();
      
      logger.info({ alertType, condition, threshold }, 'Market alert created');
      return alert;
    } catch (error) {
      logger.error({ err: error }, 'Error creating market alert');
      throw error;
    }
  }

  /**
   * Create a copy trading alert
   */
  async createCopyTradingAlert(
    accountName: string,
    alertType: 'wallet_activity' | 'large_transaction' | 'new_token_purchase',
    walletAddress: string,
    tokenAddress?: string,
    amount?: string
  ): Promise<CopyTradingAlert> {
    try {
      const alertId = `copy-${accountName}-${alertType}-${Date.now()}`;
      
      let tokenSymbol: string | undefined;
      if (tokenAddress) {
        const tokenInfo = await this.getTokenInfo(tokenAddress);
        tokenSymbol = tokenInfo.symbol;
      }
      
      const alert: CopyTradingAlert = {
        id: alertId,
        accountName,
        alertType,
        walletAddress,
        tokenAddress,
        tokenSymbol,
        amount,
        isActive: true,
        createdAt: Math.floor(Date.now() / 1000)
      };

      this.copyTradingAlerts.set(alertId, alert);
      await this.saveAlertsToStorage();
      
      logger.info({ alertType, walletAddress }, 'Copy trading alert created');
      return alert;
    } catch (error) {
      logger.error({ err: error }, 'Error creating copy trading alert');
      throw error;
    }
  }

  /**
   * Check and trigger price alerts
   */
  async checkPriceAlerts(): Promise<PriceAlert[]> {
    const triggeredAlerts: PriceAlert[] = [];
    
    for (const [id, alert] of this.priceAlerts) {
      if (!alert.isActive) continue;
      
      try {
        const currentPrice = await this.getTokenPrice(alert.tokenAddress);
        const targetPrice = parseFloat(alert.targetPrice);
        const price = parseFloat(currentPrice);
        
        let shouldTrigger = false;
        
        if (alert.condition === 'above' && price >= targetPrice) {
          shouldTrigger = true;
        } else if (alert.condition === 'below' && price <= targetPrice) {
          shouldTrigger = true;
        }
        
        if (shouldTrigger) {
          const updatedAlert: PriceAlert = {
            ...alert,
            isActive: false,
            triggeredAt: Math.floor(Date.now() / 1000),
            triggeredPrice: currentPrice
          };
          
          this.priceAlerts.set(id, updatedAlert);
          triggeredAlerts.push(updatedAlert);
          
          logger.info({ tokenSymbol: alert.tokenSymbol, condition: alert.condition, targetPrice: alert.targetPrice, currentPrice }, 'Price alert triggered');
        }
      } catch (error) {
        logger.warn({ err: error, id }, 'Error checking price alert');
      }
    }
    
    if (triggeredAlerts.length > 0) {
      await this.saveAlertsToStorage();
    }
    
    return triggeredAlerts;
  }

  /**
   * Check and trigger portfolio alerts
   */
  async checkPortfolioAlerts(): Promise<PortfolioAlert[]> {
    const triggeredAlerts: PortfolioAlert[] = [];
    
    for (const [id, alert] of this.portfolioAlerts) {
      if (!alert.isActive) continue;
      
      try {
        // Get portfolio value from positions service
        const { PositionsService } = await import('./positionsService.js');
        const positionsService = new PositionsService();
        const positions = await positionsService.getPositionsByAccount(alert.accountName);
        
        let portfolioValue = 0;
        let shouldTrigger = false;
        
        // Calculate portfolio value
        for (const position of positions.open) {
          if (position.currentPrice) {
            portfolioValue += parseFloat(position.currentPrice) * parseFloat(position.amount);
          }
        }
        
        const threshold = parseFloat(alert.threshold);
        
        if (alert.condition === 'above' && portfolioValue >= threshold) {
          shouldTrigger = true;
        } else if (alert.condition === 'below' && portfolioValue <= threshold) {
          shouldTrigger = true;
        }
        
        if (shouldTrigger) {
          const updatedAlert: PortfolioAlert = {
            ...alert,
            isActive: false,
            triggeredAt: Math.floor(Date.now() / 1000),
            triggeredValue: portfolioValue.toFixed(6)
          };
          
          this.portfolioAlerts.set(id, updatedAlert);
          triggeredAlerts.push(updatedAlert);
          
          logger.info({ alertType: alert.alertType, condition: alert.condition, threshold: alert.threshold, current: portfolioValue.toFixed(6) }, 'Portfolio alert triggered');
        }
      } catch (error) {
        logger.warn({ err: error, id }, 'Error checking portfolio alert');
      }
    }
    
    if (triggeredAlerts.length > 0) {
      await this.saveAlertsToStorage();
    }
    
    return triggeredAlerts;
  }

  /**
   * Check and trigger market alerts
   */
  async checkMarketAlerts(): Promise<MarketAlert[]> {
    const triggeredAlerts: MarketAlert[] = [];
    
    for (const [id, alert] of this.marketAlerts) {
      if (!alert.isActive) continue;
      
      try {
        let shouldTrigger = false;
        let currentValue = '0';
        
        if (alert.alertType === 'price_spike' && alert.tokenAddress) {
          // Get current token price in USD
          const currentPrice = await this.getTokenPrice(alert.tokenAddress);
          currentValue = currentPrice;
          const threshold = parseFloat(alert.threshold);
          const price = parseFloat(currentPrice);
          
          if (alert.condition === 'above' && price >= threshold) {
            shouldTrigger = true;
          } else if (alert.condition === 'below' && price <= threshold) {
            shouldTrigger = true;
          }
        } else if (alert.alertType === 'volume_surge' && alert.tokenAddress) {
          // For volume surge, we would need to get trading volume data
          // This is a placeholder - in a real implementation you'd get volume from DEX APIs
          logger.warn({ tokenAddress: alert.tokenAddress }, 'Volume surge alerts not yet implemented');
          continue;
        } else if (alert.alertType === 'market_opportunity') {
          // Market opportunity could be based on various factors
          // This is a placeholder - in a real implementation you'd analyze market conditions
          logger.warn('Market opportunity alerts not yet implemented');
          continue;
        }
        
        if (shouldTrigger) {
          const updatedAlert: MarketAlert = {
            ...alert,
            isActive: false,
            triggeredAt: Math.floor(Date.now() / 1000),
            triggeredValue: currentValue
          };
          
          this.marketAlerts.set(id, updatedAlert);
          triggeredAlerts.push(updatedAlert);
          
          logger.info({ alertType: alert.alertType, condition: alert.condition, threshold: alert.threshold, currentValue }, 'Market alert triggered');
        }
      } catch (error) {
        logger.warn({ err: error, id }, 'Error checking market alert');
      }
    }
    
    if (triggeredAlerts.length > 0) {
      await this.saveAlertsToStorage();
    }
    
    return triggeredAlerts;
  }

  /**
   * Get all alerts
   */
  async getAlerts(
    accountName?: string,
    alertType?: 'price' | 'portfolio' | 'trade' | 'market' | 'copy'
  ): Promise<AlertResponse> {
    try {
      // Check for triggered alerts
      await this.checkPriceAlerts();
      await this.checkPortfolioAlerts();
      await this.checkMarketAlerts();
      
      let priceAlerts = Array.from(this.priceAlerts.values());
      let portfolioAlerts = Array.from(this.portfolioAlerts.values());
      let tradeAlerts = Array.from(this.tradeAlerts.values());
      let marketAlerts = Array.from(this.marketAlerts.values());
      let copyTradingAlerts = Array.from(this.copyTradingAlerts.values());
      
      // Filter by account name if provided
      if (accountName) {
        priceAlerts = priceAlerts.filter(a => a.accountName === accountName);
        portfolioAlerts = portfolioAlerts.filter(a => a.accountName === accountName);
        tradeAlerts = tradeAlerts.filter(a => a.accountName === accountName);
        copyTradingAlerts = copyTradingAlerts.filter(a => a.accountName === accountName);
      }
      
      // Filter by alert type if provided
      if (alertType) {
        switch (alertType) {
          case 'price':
            portfolioAlerts = [];
            tradeAlerts = [];
            marketAlerts = [];
            copyTradingAlerts = [];
            break;
          case 'portfolio':
            priceAlerts = [];
            tradeAlerts = [];
            marketAlerts = [];
            copyTradingAlerts = [];
            break;
          case 'trade':
            priceAlerts = [];
            portfolioAlerts = [];
            marketAlerts = [];
            copyTradingAlerts = [];
            break;
          case 'market':
            priceAlerts = [];
            portfolioAlerts = [];
            tradeAlerts = [];
            copyTradingAlerts = [];
            break;
          case 'copy':
            priceAlerts = [];
            portfolioAlerts = [];
            tradeAlerts = [];
            marketAlerts = [];
            break;
        }
      }
      
      const activeAlerts = [
        ...priceAlerts.filter(a => a.isActive),
        ...portfolioAlerts.filter(a => a.isActive),
        ...tradeAlerts.filter(a => a.isActive),
        ...marketAlerts.filter(a => a.isActive),
        ...copyTradingAlerts.filter(a => a.isActive)
      ].length;
      
      const response: AlertResponse = {
        priceAlerts,
        portfolioAlerts,
        tradeAlerts,
        marketAlerts,
        copyTradingAlerts,
        summary: {
          totalPriceAlerts: priceAlerts.length,
          totalPortfolioAlerts: portfolioAlerts.length,
          totalTradeAlerts: tradeAlerts.length,
          totalMarketAlerts: marketAlerts.length,
          totalCopyTradingAlerts: copyTradingAlerts.length,
          activeAlerts
        }
      };
      
      return response;
    } catch (error) {
      logger.error({ err: error }, 'Error getting alerts');
      throw error;
    }
  }

  /**
   * Delete an alert
   */
  async deleteAlert(alertId: string): Promise<boolean> {
    try {
      let deleted = false;
      
      if (this.priceAlerts.has(alertId)) {
        this.priceAlerts.delete(alertId);
        deleted = true;
      } else if (this.portfolioAlerts.has(alertId)) {
        this.portfolioAlerts.delete(alertId);
        deleted = true;
      } else if (this.tradeAlerts.has(alertId)) {
        this.tradeAlerts.delete(alertId);
        deleted = true;
      } else if (this.marketAlerts.has(alertId)) {
        this.marketAlerts.delete(alertId);
        deleted = true;
      } else if (this.copyTradingAlerts.has(alertId)) {
        this.copyTradingAlerts.delete(alertId);
        deleted = true;
      }
      
      if (deleted) {
        await this.saveAlertsToStorage();
        logger.info({ alertId }, 'Alert deleted');
      }
      
      return deleted;
    } catch (error) {
      logger.error({ err: error }, 'Error deleting alert');
      throw error;
    }
  }

  /**
   * Get token information
   */
  private async getTokenInfo(tokenAddress: string): Promise<{ name: string; symbol: string; decimals: number }> {
    // Handle native ETH pseudo-address
    if (tokenAddress.toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee') {
      return {
        name: 'Ethereum',
        symbol: 'ETH',
        decimals: 18
      };
    }

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
   * Get token price
   */
  private async getTokenPrice(tokenAddress: string): Promise<string> {
    try {
      // Simplified price calculation
      const mockPrice = Math.random() * 100 + 0.001;
      return mockPrice.toFixed(6);
    } catch (error) {
      logger.warn({ err: error, tokenAddress }, 'Could not get price');
      return '0.000000';
    }
  }
} 