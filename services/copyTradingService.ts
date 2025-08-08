import { ethers } from 'ethers';

import { CopyTradeConfig, CopyTradeEvent, CopyTradeExecution } from '../types/index.js';
import { config } from '../config/index.js';
import { logger } from '../lib/logger.js';

import { CdpService } from './cdpService.js';
import { PositionsService } from './positionsService.js';
import { AlertsService } from './alertsService.js';

export class CopyTradingService {
  private static instance: CopyTradingService;
  private configs: Map<string, CopyTradeConfig> = new Map();
  private events: Map<string, CopyTradeEvent> = new Map();
  private provider: ethers.JsonRpcProvider;

  constructor() {
    const providerUrl = config.providerUrl;
    this.provider = new ethers.JsonRpcProvider(providerUrl);
  }

  public static getInstance(): CopyTradingService {
    if (!CopyTradingService.instance) {
      CopyTradingService.instance = new CopyTradingService();
    }
    return CopyTradingService.instance;
  }

  /**
   * Create a new copy trading configuration
   */
  async createCopyTradeConfig(
    accountName: string,
    targetWalletAddress: string,
    delegationAmount: string,
    maxSlippage: number = 0.05
  ): Promise<CopyTradeConfig> {
    try {
      // Validate account exists
      const cdpService = CdpService.getInstance();
      const _account = await cdpService.getAccount(accountName);
      
      // Validate delegation amount
      const balances = await cdpService.getBalances(accountName);
      const ethBalance = balances.data.balances.find(b => 
        b.token.contractAddress === "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE"
      );
      
      if (!ethBalance || parseFloat(ethBalance.amount.formatted) < parseFloat(delegationAmount)) {
        throw new Error(`Insufficient ETH balance. Required: ${delegationAmount} ETH, Available: ${ethBalance?.amount.formatted || '0'} ETH`);
      }

      const config: CopyTradeConfig = {
        id: `copy_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        accountName,
        targetWalletAddress,
        delegationAmount,
        maxSlippage,
        isActive: true,
        createdAt: Date.now(),
        totalExecutedTrades: 0,
        totalSpent: '0'
      };

      this.configs.set(config.id, config);
      
      logger.info({ configId: config.id, accountName }, 'Copy trading config created');
      return config;
    } catch (error) {
      logger.error({ err: error }, 'Error creating copy trade config');
      throw error;
    }
  }

  /**
   * Get all copy trading configurations for an account
   */
  async getCopyTradeConfigs(accountName: string): Promise<CopyTradeConfig[]> {
    return Array.from(this.configs.values()).filter(config => config.accountName === accountName);
  }

  /**
   * Update copy trading configuration
   */
  async updateCopyTradeConfig(
    configId: string,
    updates: Partial<CopyTradeConfig>
  ): Promise<CopyTradeConfig> {
    const config = this.configs.get(configId);
    if (!config) {
      throw new Error('Copy trade configuration not found');
    }

    const updatedConfig = { ...config, ...updates };
    this.configs.set(configId, updatedConfig);
    
    logger.info({ configId }, 'Copy trading config updated');
    return updatedConfig;
  }

  /**
   * Delete copy trading configuration
   */
  async deleteCopyTradeConfig(configId: string): Promise<void> {
    const config = this.configs.get(configId);
    if (!config) {
      throw new Error('Copy trade configuration not found');
    }

    this.configs.delete(configId);
    logger.info({ configId }, 'Copy trading config deleted');
  }

  /**
   * Execute copy trade when a buy transaction is detected
   */
  async executeCopyTrade(
    configId: string,
    targetTransaction: any,
    tokenAddress: string,
    tokenSymbol: string,
    tokenName: string,
    originalAmount: string
  ): Promise<CopyTradeExecution> {
    try {
      const config = this.configs.get(configId);
      if (!config || !config.isActive) {
        throw new Error('Copy trade configuration not found or inactive');
      }

      // Calculate copy amount based on delegation and original transaction
      const copyAmount = this.calculateCopyAmount(config, originalAmount);
      
      if (parseFloat(copyAmount) <= 0) {
        throw new Error('Insufficient delegation amount for copy trade');
      }

      // Execute the copy trade using CDP service
      const cdpService = CdpService.getInstance();
      
      const result = await cdpService.sendTransaction(config.accountName, {
        to: tokenAddress as `0x${string}`,
        value: copyAmount,
        network: "base"
      });

      // Create copy trade event
      const event: CopyTradeEvent = {
        id: `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        configId,
        accountName: config.accountName,
        targetWalletAddress: config.targetWalletAddress,
        tokenAddress,
        tokenSymbol,
        tokenName,
        originalAmount,
        copiedAmount: copyAmount,
        transactionHash: result.data.transactionHash,
        timestamp: Date.now(),
        status: 'success'
      };

      this.events.set(event.id, event);

      // Update config statistics
      config.totalExecutedTrades++;
      config.totalSpent = (parseFloat(config.totalSpent) + parseFloat(copyAmount)).toString();
      config.lastExecutedAt = Date.now();
      this.configs.set(configId, config);

      // Create position
      const positionsService = new PositionsService();
      await positionsService.addPosition(
        config.accountName,
        tokenAddress,
        copyAmount,
        result.data.transactionHash
      );

      // Create copy trading alert automatically
      const alertsService = new AlertsService();
      await alertsService.createCopyTradingAlert(
        config.accountName,
        'wallet_activity',
        config.targetWalletAddress,
        tokenAddress,
        copyAmount
      );

      logger.info({ eventId: event.id, amount: copyAmount }, 'Copy trade executed');
      logger.info({ accountName: config.accountName }, 'Copy trading alert created automatically');

      return {
        success: true,
        transactionHash: result.data.transactionHash,
        copiedAmount: copyAmount,
        tokenAddress,
        tokenSymbol
      };

    } catch (error) {
      logger.error({ err: error }, 'Error executing copy trade');
      
      // Create failed event
      const failedConfig = this.configs.get(configId);
      const event: CopyTradeEvent = {
        id: `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        configId,
        accountName: failedConfig?.accountName || '',
        targetWalletAddress: failedConfig?.targetWalletAddress || '',
        tokenAddress,
        tokenSymbol,
        tokenName,
        originalAmount,
        copiedAmount: '0',
        transactionHash: '',
        timestamp: Date.now(),
        status: 'failed',
        errorMessage: (error as Error).message
      };

      this.events.set(event.id, event);

      return {
        success: false,
        errorMessage: (error as Error).message,
        copiedAmount: '0',
        tokenAddress,
        tokenSymbol
      };
    }
  }

  /**
   * Calculate copy amount based on delegation and original transaction
   */
  private calculateCopyAmount(config: CopyTradeConfig, originalAmount: string): string {
    const delegationEth = parseFloat(config.delegationAmount);
    const originalEth = parseFloat(originalAmount);
    
    // Use the smaller of delegation amount or original amount
    const copyAmount = Math.min(delegationEth, originalEth);
    
    // Check if we have enough remaining delegation
    const spent = parseFloat(config.totalSpent);
    const remaining = delegationEth - spent;
    
    if (remaining <= 0) {
      return '0';
    }
    
    // Use the smaller of calculated amount or remaining delegation
    return Math.min(copyAmount, remaining).toString();
  }

  /**
   * Get copy trade events for an account
   */
  async getCopyTradeEvents(accountName: string): Promise<CopyTradeEvent[]> {
    return Array.from(this.events.values()).filter(event => event.accountName === accountName);
  }

  /**
   * Create copy trading alert for target wallet activity
   */
  async createTargetWalletAlert(
    targetWalletAddress: string,
    tokenAddress: string,
    tokenSymbol: string,
    tokenName: string,
    amount: string,
    _transactionHash: string
  ): Promise<void> {
    try {
      // Get all configs monitoring this wallet
      const monitoringConfigs = Array.from(this.configs.values()).filter(
        config => config.targetWalletAddress.toLowerCase() === targetWalletAddress.toLowerCase()
      );

      if (monitoringConfigs.length === 0) {
        return; // No one is monitoring this wallet
      }

      // Create alerts for all accounts monitoring this wallet
      const alertsService = new AlertsService();
      
      for (const config of monitoringConfigs) {
        await alertsService.createCopyTradingAlert(
          config.accountName,
          'wallet_activity',
          targetWalletAddress,
          tokenAddress,
          amount
        );

        logger.info({ accountName: config.accountName, targetWalletAddress }, 'Target wallet alert created');
      }
    } catch (error) {
      logger.error({ err: error }, 'Error creating target wallet alert');
    }
  }

  /**
   * Monitor target wallet and execute copy trades for all active configurations
   */
  async monitorAndExecuteCopyTrades(targetWalletAddress: string): Promise<CopyTradeEvent[]> {
    const executedEvents: CopyTradeEvent[] = [];
    
    // Get all active configs for this target wallet
    const activeConfigs = Array.from(this.configs.values()).filter(
      config => config.targetWalletAddress.toLowerCase() === targetWalletAddress.toLowerCase() && config.isActive
    );

    if (activeConfigs.length === 0) {
      return executedEvents;
    }

    try {
      // Get recent transactions for the target wallet
      const latestBlock = await this.provider.getBlockNumber();
      const fromBlock = latestBlock - 10; // Check last 10 blocks

      const filter = {
        fromBlock: fromBlock,
        toBlock: 'latest',
        address: targetWalletAddress
      };

      const logs = await this.provider.getLogs(filter);

      for (const log of logs) {
        const transaction = await this.provider.getTransaction(log.transactionHash!);
        if (!transaction) continue;
        const routers = (require('../config/index.js') as typeof import('../config/index.js')).config.copyTrading?.routerAddresses ?? [];
        if (routers.length > 0 && transaction.to && transaction.data && transaction.data !== '0x') {
          if (!routers.includes(transaction.to.toLowerCase())) {
            continue;
          }
        }

        const buyOnly = config.copyTrading?.buyOnly ?? true;
        const isBuy = this.isBuyTransaction(transaction);
        if (transaction && (!buyOnly || isBuy)) {
          const tokenInfo = await this.extractTokenInfo(transaction);
          
          if (tokenInfo) {
            // Execute copy trades for all active configs
            for (const config of activeConfigs) {
              const execution = await this.executeCopyTrade(
                config.id,
                transaction,
                tokenInfo.tokenAddress,
                tokenInfo.tokenSymbol,
                tokenInfo.tokenName,
                ethers.formatEther(transaction.value)
              );

              if (execution.success) {
                const event = Array.from(this.events.values()).find(
                  e => e.transactionHash === execution.transactionHash
                );
                if (event) {
                  executedEvents.push(event);
                }
              }
            }
          }
        }
      }

      return executedEvents;
    } catch (error) {
      logger.error({ err: error }, 'Error monitoring and executing copy trades');
      throw error;
    }
  }

  /**
   * Check if transaction is a buy transaction
   */
  private isBuyTransaction(transaction: any): boolean {
    if (transaction.value > 0 && transaction.data === '0x') return true;
    const { detectBuyAndToken } = require('../lib/txParsing.js');
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

      // For swap transactions, decode to get token address
      if (transaction.data && transaction.data.length > 10) {
        const { detectBuyAndToken } = require('../lib/txParsing.js');
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