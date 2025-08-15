import { ethers } from 'ethers';

import { CopyTradeConfig, CopyTradeEvent, CopyTradeExecution } from '../types/index.js';
import { config } from '../config/index.js';
import { logger } from '../lib/logger.js';
import { detectBuyAndToken } from '../lib/txParsing.js';

import { CdpService } from './cdpService.js';
import { PositionsService } from './positionsService.js';
import { AlertsService } from './alertsService.js';
import { SwapService } from './swapService.js';
import { TelegramService } from './telegramService.js';

export class CopyTradingService {
  private static instance: CopyTradingService;
  private configs: Map<string, CopyTradeConfig> = new Map();
  private events: Map<string, CopyTradeEvent> = new Map();
  private provider: ethers.JsonRpcProvider;
  private wsProvider: ethers.WebSocketProvider | null = null;
  private isWsActive = false;
  private lastHandledBlock: number | null = null;

  constructor() {
    const providerUrl = config.providerUrl;
    this.provider = new ethers.JsonRpcProvider(providerUrl);
    // Try to initialize WebSocket provider if configured
    if (config.providerWsUrl) {
      try {
        this.wsProvider = new ethers.WebSocketProvider(config.providerWsUrl);
        this.isWsActive = true;
        logger.info({ wsUrl: config.providerWsUrl }, 'CopyTradingService: WebSocket monitoring enabled');
      } catch (_e) {
        this.wsProvider = null;
        this.isWsActive = false;
        logger.warn('CopyTradingService: WebSocket init failed; falling back to HTTP polling when invoked');
      }
    }

    // Start WS monitoring for active configs if available
    if (this.wsProvider) {
      // Subscribe to new heads for new block numbers
      this.wsProvider.on('block', async (blockNumber: number) => {
        try {
          logger.debug({ blockNumber }, 'WS new block detected');
          await this.handleNewBlock(blockNumber);
        } catch (err) {
          logger.warn({ err }, 'WS block handler failed');
        }
      });
    } else {
      // Lightweight HTTP polling when WS is unavailable: periodically pull new blocks
      const intervalMs = 7000; // conservative for free tiers
      setInterval(async () => {
        try {
          const latest = await this.provider.getBlockNumber();
          if (this.lastHandledBlock === null) {
            this.lastHandledBlock = latest;
            logger.info({ latest }, 'HTTP poll initialized');
            return;
          }
          if (latest <= this.lastHandledBlock) return;
          const start = this.lastHandledBlock + 1;
          const end = latest;
          let matched = 0;
          let executed = 0;
          for (let b = start; b <= end; b++) {
            const counters = await this.handleNewBlock(b);
            matched += counters.matched;
            executed += counters.executed;
          }
          this.lastHandledBlock = latest;
          logger.info({ start, end, matched, executed }, 'HTTP poll cycle completed');
        } catch (err) {
          logger.warn({ err }, 'HTTP poll cycle failed');
        }
      }, intervalMs);
    }
  }

  private activeConfigsCache: { loadedAt: number; configs: Array<{ id: string; targetWalletAddress: string; beneficiaryAddresses: string[]; buyOnly: boolean; routerAllowlist: string[]; accountName: string; delegationAmount: string; maxSlippage: number; isActive: boolean; }> } = { loadedAt: 0, configs: [] };

  private async loadActiveConfigs(): Promise<typeof this.activeConfigsCache.configs> {
    const now = Date.now();
    if (now - this.activeConfigsCache.loadedAt < 60_000 && this.activeConfigsCache.configs.length > 0) {
      return this.activeConfigsCache.configs;
    }
    const { CopyTradeConfigModel } = await import('../models/CopyTradeConfig.js');
    const docs = await CopyTradeConfigModel.find({ isActive: true }).lean();
    const list = docs.map(d => ({
      id: d._id.toString(),
      targetWalletAddress: d.targetWalletAddress.toLowerCase(),
      beneficiaryAddresses: (d.beneficiaryAddresses ?? []).map((a: string) => a.toLowerCase()),
      buyOnly: d.buyOnly,
      routerAllowlist: d.routerAllowlist ?? [],
      accountName: d.accountName,
      delegationAmount: d.delegationAmount,
      maxSlippage: d.maxSlippage,
      isActive: d.isActive,
    }));
    this.activeConfigsCache = { loadedAt: now, configs: list };
    return list;
  }

  private async handleNewBlock(blockNumber: number): Promise<{ matched: number; executed: number }> {
    const block = await this.provider.getBlock(blockNumber, true);
    if (!block || !Array.isArray(block.transactions) || block.transactions.length === 0) {
      return { matched: 0, executed: 0 };
    }

    const configs = await this.loadActiveConfigs();
    if (configs.length === 0) return { matched: 0, executed: 0 };

    // Group configs by all watched addresses (target + beneficiaries)
    const walletToConfigs = new Map<string, typeof configs>();
    for (const cfg of configs) {
      const keys = [cfg.targetWalletAddress, ...(cfg.beneficiaryAddresses ?? [])];
      for (const key of keys) {
        const arr = walletToConfigs.get(key) ?? [];
        arr.push(cfg);
        walletToConfigs.set(key, arr);
      }
    }

    let matchedCount = 0;
    let executedCount = 0;

    for (const tx of block.transactions) {
      const fromLower = (tx.from ?? '').toLowerCase();
      const matches = walletToConfigs.get(fromLower);
      if (!matches || matches.length === 0) continue;
      matchedCount += matches.length;

      // Idempotency: skip if already processed
      const { CopyTradeEventModel } = await import('../models/CopyTradeEvent.js');
      const existing = await CopyTradeEventModel.findOne({ targetWalletAddress: fromLower, originalTxHash: tx.hash }).lean();
      if (existing) continue;

      for (const cfg of matches) {
        // Router allowlist check
        if (cfg.routerAllowlist.length > 0 && tx.to && tx.data && tx.data !== '0x') {
          if (!cfg.routerAllowlist.includes(tx.to.toLowerCase())) continue;
        }

        const detection = detectBuyAndToken(tx.data ?? '0x');
        const isDirectEthTransfer = (tx.value ?? 0n) > 0n && (tx.data ?? '0x') === '0x';
        const isBuy = isDirectEthTransfer || detection.isBuy;
        if (cfg.buyOnly && !isBuy) continue;

        let tokenInfo: { tokenAddress: string; tokenSymbol: string; tokenName: string } | null = null;
        if (isDirectEthTransfer && tx.to) {
          try {
            const tokenContract = new ethers.Contract(tx.to, [ 'function symbol() view returns (string)', 'function name() view returns (string)' ], this.provider);
            const [symbol, name] = await Promise.all([
              tokenContract.getFunction('symbol')() as Promise<string>,
              tokenContract.getFunction('name')() as Promise<string>,
            ]);
            tokenInfo = { tokenAddress: tx.to, tokenSymbol: symbol, tokenName: name };
          } catch (_e) {
            tokenInfo = null;
          }
        } else if (detection.tokenAddress) {
          try {
            const tokenContract = new ethers.Contract(detection.tokenAddress, [ 'function symbol() view returns (string)', 'function name() view returns (string)' ], this.provider);
            const [symbol, name] = await Promise.all([
              tokenContract.getFunction('symbol')() as Promise<string>,
              tokenContract.getFunction('name')() as Promise<string>,
            ]);
            tokenInfo = { tokenAddress: detection.tokenAddress, tokenSymbol: symbol, tokenName: name };
          } catch (_e) {
            tokenInfo = null;
          }
        }

        if (!tokenInfo) continue;

        try {
          await this.executeCopyTrade(
            cfg.id,
            tx,
            tokenInfo.tokenAddress,
            tokenInfo.tokenSymbol,
            tokenInfo.tokenName,
            ethers.formatEther(tx.value ?? 0)
          );
          executedCount += 1;
        } catch (err) {
          // errors are recorded inside executeCopyTrade via failure event
          logger.warn({ err }, 'Copy trade execution failed for WS block');
        }
      }
    }
    // AA/Universal Router fallback: scan receipts for transfers to watched wallets within this block
    try {
      const transferTopic = ethers.id('Transfer(address,address,uint256)');
      for (const tx of block.transactions) {
        // Guard: ensure hash is a valid 0x string
        if (!tx?.hash || typeof tx.hash !== 'string' || !tx.hash.startsWith('0x') || tx.hash.length !== 66) continue;

        const receipt = await this.provider.getTransactionReceipt(tx.hash);
        if (!receipt || !Array.isArray(receipt.logs)) continue;

        // Collect any Transfer logs to watched wallets (AA/UR and generic)
        for (const log of receipt.logs) {
          if ((log.topics?.[0] ?? '') !== transferTopic) continue;
          const toTopic = log.topics?.[2];
          if (!toTopic) continue;
          // topics[2] is 32-byte right-padded address
          for (const [wallet, cfgs] of walletToConfigs.entries()) {
            const padded = ethers.zeroPadValue(wallet, 32).toLowerCase();
            if (toTopic.toLowerCase() !== padded) continue;
            // Require sender of Transfer be a contract (reduce false positives)
            const fromTopic = log.topics?.[1];
            if (!fromTopic) continue;
            const fromAddress = '0x' + fromTopic.slice(-40);
            try {
              const code = await this.provider.getCode(fromAddress);
              if (!code || code === '0x') continue;
            } catch {
              continue;
            }

            // Build token info
            const tokenAddress: string = log.address;
            let tokenSymbol = 'UNKNOWN';
            let tokenName = 'Unknown Token';
            try {
              const tokenContract = new ethers.Contract(tokenAddress, [ 'function symbol() view returns (string)', 'function name() view returns (string)' ], this.provider);
              const [sym, name] = await Promise.all([
                tokenContract.getFunction('symbol')() as Promise<string>,
                tokenContract.getFunction('name')() as Promise<string>,
              ]);
              tokenSymbol = sym; tokenName = name;
            } catch {}

            for (const cfg of cfgs) {
              try {
                // Fallback original amount: if no ETH in top-level tx, use delegation to enable mirroring
                const originalAmount = (tx.value && tx.value > 0n) ? ethers.formatEther(tx.value) : cfg.delegationAmount;
                await this.executeCopyTrade(
                  cfg.id,
                  tx,
                  tokenAddress,
                  tokenSymbol,
                  tokenName,
                  originalAmount
                );
                executedCount += 1;
              } catch (err) {
                logger.warn({ err }, 'AA-based copy trade execution failed');
              }
            }
          }
        }
      }
    } catch (err) {
      logger.warn({ err }, 'AA/v4 receipt scan failed');
    }
    logger.info({ blockNumber, txs: block.transactions.length, configs: configs.length, matched: matchedCount, executed: executedCount }, 'Block processed');
    this.lastHandledBlock = Math.max(this.lastHandledBlock ?? 0, blockNumber);
    return { matched: matchedCount, executed: executedCount };
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

      // Persist to Mongo
      const { CopyTradeConfigModel } = await import('../models/CopyTradeConfig.js');
      const configDoc = await CopyTradeConfigModel.create({
        accountName,
        targetWalletAddress: targetWalletAddress.toLowerCase(),
        beneficiaryAddresses: [],
        delegationAmount,
        maxSlippage,
        buyOnly: (config.copyTrading?.buyOnly ?? true),
        routerAllowlist: (config.copyTrading?.routerAddresses ?? []),
        isActive: true,
      });

      const createdConfig: CopyTradeConfig = {
        id: (configDoc._id as any).toString(),
        accountName: configDoc.accountName,
        targetWalletAddress: configDoc.targetWalletAddress,
        delegationAmount: configDoc.delegationAmount,
        maxSlippage: configDoc.maxSlippage,
        isActive: configDoc.isActive,
        createdAt: configDoc.createdAt,
        lastExecutedAt: configDoc.lastExecutedAt,
        totalExecutedTrades: configDoc.totalExecutedTrades,
        totalSpent: configDoc.totalSpent,
      };

      logger.info({ configId: createdConfig.id, accountName }, 'Copy trading config created');
      return createdConfig;
    } catch (error) {
      logger.error({ err: error }, 'Error creating copy trade config');
      throw error;
    }
  }

  /**
   * Get all copy trading configurations for an account
   */
  async getCopyTradeConfigs(accountName: string): Promise<CopyTradeConfig[]> {
    const { CopyTradeConfigModel } = await import('../models/CopyTradeConfig.js');
    const docs = await CopyTradeConfigModel.find({ accountName }).lean();
    return docs.map(d => ({
      id: d._id.toString(),
      accountName: d.accountName,
      targetWalletAddress: d.targetWalletAddress,
      delegationAmount: d.delegationAmount,
      maxSlippage: d.maxSlippage,
      isActive: d.isActive,
      createdAt: d.createdAt,
      lastExecutedAt: d.lastExecutedAt,
      totalExecutedTrades: d.totalExecutedTrades,
      totalSpent: d.totalSpent,
    }));
  }

  /**
   * Clean up duplicate copy trading configurations
   * Keeps only the most recent config for each (accountName, targetWalletAddress) combination
   */
  async cleanupDuplicateConfigs(): Promise<{ removed: number; kept: number }> {
    const { CopyTradeConfigModel } = await import('../models/CopyTradeConfig.js');
    
    // Group configs by (accountName, targetWalletAddress) combination
    const configs = await CopyTradeConfigModel.find({}).lean();
    const accountWalletGroups = new Map<string, typeof configs>();
    
    for (const config of configs) {
      const key = `${config.accountName}-${config.targetWalletAddress.toLowerCase()}`;
      const group = accountWalletGroups.get(key) || [];
      group.push(config);
      accountWalletGroups.set(key, group);
    }
    
    let removed = 0;
    let kept = 0;
    
    // For each (account, wallet) combination with multiple configs, keep only the most recent one
    for (const [key, group] of accountWalletGroups) {
      if (group.length > 1) {
        // Sort by createdAt descending (most recent first)
        group.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        
        // Keep the first (most recent) one, delete the rest
        const toKeep = group[0]!; // Non-null assertion since we know group has at least 2 items
        const toDelete = group.slice(1);
        
        for (const config of toDelete) {
          await CopyTradeConfigModel.findByIdAndDelete(config._id);
          removed++;
        }
        
        kept++;
        logger.info({ 
          accountWalletKey: key, 
          keptConfigId: toKeep._id.toString(), 
          removedCount: toDelete.length 
        }, 'Cleaned up duplicate copy trade configs');
      } else {
        kept++;
      }
    }
    
    return { removed, kept };
  }

  /**
   * Update copy trading configuration
   */
  async updateCopyTradeConfig(
    configId: string,
    updates: Partial<CopyTradeConfig>
  ): Promise<CopyTradeConfig> {
    const { CopyTradeConfigModel } = await import('../models/CopyTradeConfig.js');
    const doc = await CopyTradeConfigModel.findByIdAndUpdate(
      configId,
      {
        $set: {
          delegationAmount: updates.delegationAmount,
          maxSlippage: updates.maxSlippage,
          isActive: updates.isActive,
          ...(Array.isArray((updates as any).beneficiaryAddresses)
            ? { beneficiaryAddresses: (updates as any).beneficiaryAddresses.map((a: string) => a.toLowerCase()) }
            : {}),
        }
      },
      { new: true }
    ).lean();
    if (!doc) throw new Error('Copy trade configuration not found');
    logger.info({ configId }, 'Copy trading config updated');
    return {
      id: doc._id.toString(),
      accountName: doc.accountName,
      targetWalletAddress: doc.targetWalletAddress,
      // @ts-expect-error include beneficiaries in response for clients
      beneficiaryAddresses: (doc as any).beneficiaryAddresses ?? [],
      delegationAmount: doc.delegationAmount,
      maxSlippage: doc.maxSlippage,
      isActive: doc.isActive,
      createdAt: doc.createdAt,
      lastExecutedAt: doc.lastExecutedAt,
      totalExecutedTrades: doc.totalExecutedTrades,
      totalSpent: doc.totalSpent,
    };
  }

  /**
   * Delete copy trading configuration
   */
  async deleteCopyTradeConfig(configId: string): Promise<void> {
    const { CopyTradeConfigModel } = await import('../models/CopyTradeConfig.js');
    const res = await CopyTradeConfigModel.findByIdAndDelete(configId);
    if (!res) throw new Error('Copy trade configuration not found');
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
      const { CopyTradeConfigModel } = await import('../models/CopyTradeConfig.js');
      const cfgDoc = await CopyTradeConfigModel.findById(configId).lean();
      if (!cfgDoc || !cfgDoc.isActive) {
        throw new Error('Copy trade configuration not found or inactive');
      }

      // Calculate copy amount based on delegation, spent and original amount
      const delegationEth = parseFloat(cfgDoc.delegationAmount);
      const originalEth = parseFloat(originalAmount);
      const spent = parseFloat(cfgDoc.totalSpent || '0');
      const remaining = Math.max(0, delegationEth - spent);
      const copyAmount = Math.min(remaining, Math.min(delegationEth, originalEth)).toString();
      
      if (parseFloat(copyAmount) <= 0) {
        throw new Error('Insufficient delegation amount for copy trade');
      }

      // Execute the copy trade using SwapService (DEX swap) for correctness
      const swapService = SwapService.getInstance();

      // Mirror using ETH as funding source.
      // Even if the original trade was token->token, we treat it as a buy of tokenAddress using ETH
      // based on the configured delegation. This ensures mirroring works when our account
      // doesn't hold the original source token.
      const fromToken = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

      // Ensure CDP account exists (clearer error if missing)
      try {
        const ensureCdp = CdpService.getInstance();
        await ensureCdp.getAccount(cfgDoc.accountName);
      } catch (_e) {
        throw new Error(`CDP account not found for accountName '${cfgDoc.accountName}'. Please create it first.`);
      }

      // Pre-flight price and liquidity check
      const priceQuote = await swapService.getSwapPrice({
        accountName: cfgDoc.accountName,
        fromToken,
        toToken: tokenAddress,
        fromAmount: ethers.parseEther(copyAmount).toString(),
        network: 'base'
      });
      if (!priceQuote.success || !(priceQuote as any).data?.liquidityAvailable) {
        throw new Error('Insufficient liquidity for mirrored swap');
      }

      // Execute swap with slippage control
      const slippageBps = Math.round(((cfgDoc.maxSlippage ?? 0.05) as number) * 10000);
      const swapResult = await swapService.executeSwap({
        accountName: cfgDoc.accountName,
        fromToken,
        toToken: tokenAddress,
        fromAmount: ethers.parseEther(copyAmount).toString(),
        slippageBps,
        network: 'base'
      });

      // Create copy trade event
      const { CopyTradeEventModel } = await import('../models/CopyTradeEvent.js');
      await CopyTradeEventModel.create({
        configId,
        accountName: cfgDoc.accountName,
        targetWalletAddress: cfgDoc.targetWalletAddress,
        originalTxHash: targetTransaction.hash ?? '',
        tokenAddress,
        tokenSymbol,
        tokenName,
        originalAmount,
        copiedAmount: copyAmount,
        transactionHash: (swapResult as any).data?.transactionHash ?? '',
        status: 'success',
      });

      // Update config statistics
      const newTotalSpent = (spent + parseFloat(copyAmount)).toString();
      await CopyTradeConfigModel.findByIdAndUpdate(configId, {
        $inc: { totalExecutedTrades: 1 },
        $set: { lastExecutedAt: Date.now(), totalSpent: newTotalSpent },
      });

      // Create position
      const positionsService = new PositionsService();
      await positionsService.addPosition(
        cfgDoc.accountName,
        tokenAddress,
        copyAmount,
        (swapResult as any).data?.transactionHash ?? ''
      );

      // Create copy trading alert automatically
      const alertsService = new AlertsService();
      await alertsService.createCopyTradingAlert(
        cfgDoc.accountName,
        'wallet_activity',
        cfgDoc.targetWalletAddress,
        tokenAddress,
        copyAmount
      );

      // Send Telegram notification for successful copy trade
      try {
        const telegramService = TelegramService.getInstance();
        await telegramService.sendCopyTradeNotification(
          cfgDoc.accountName,
          cfgDoc.targetWalletAddress,
          tokenSymbol,
          tokenName,
          copyAmount,
          (swapResult as any).data?.transactionHash ?? '',
          targetTransaction.hash ?? ''
        );
        logger.info({ 
          accountName: cfgDoc.accountName, 
          tokenSymbol, 
          amount: copyAmount 
        }, 'Copy trade Telegram notification sent');
      } catch (telegramError) {
        logger.warn({ err: telegramError }, 'Failed to send copy trade Telegram notification');
      }

      logger.info({ amount: copyAmount }, 'Copy trade executed');
      logger.info({ accountName: cfgDoc.accountName }, 'Copy trading alert created automatically');

      return {
        success: true,
        transactionHash: (swapResult as any).data?.transactionHash ?? '',
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

      // Send Telegram notification for failed copy trade
      try {
        const telegramService = TelegramService.getInstance();
        await telegramService.sendFailedCopyTradeNotification(
          failedConfig?.accountName || '',
          failedConfig?.targetWalletAddress || '',
          tokenSymbol,
          tokenName,
          (error as Error).message
        );
        logger.info({ 
          accountName: failedConfig?.accountName, 
          tokenSymbol, 
          error: (error as Error).message 
        }, 'Failed copy trade Telegram notification sent');
      } catch (telegramError) {
        logger.warn({ err: telegramError }, 'Failed to send failed copy trade Telegram notification');
      }

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
      // Scan a small recent window of blocks and filter by from-address
      const latestBlock = await this.provider.getBlockNumber();
      const fromBlock = Math.max(0, latestBlock - 10);

      for (let blockNumber = latestBlock; blockNumber >= fromBlock; blockNumber--) {
        let block: any;
        try {
          block = await this.provider.getBlock(blockNumber, true);
        } catch (e) {
          logger.warn({ err: e, blockNumber }, 'Failed to fetch block with transactions');
          continue;
        }
        if (!block || !Array.isArray(block.transactions)) continue;

        for (const tx of block.transactions) {
          if ((tx.from?.toLowerCase() ?? '') !== targetWalletAddress.toLowerCase()) continue;

          // Optional router allowlist filter for swaps
          const routers = config.copyTrading?.routerAddresses ?? [];
          if (routers.length > 0 && tx.to && tx.data && tx.data !== '0x') {
            if (!routers.includes(tx.to.toLowerCase())) continue;
          }

          const buyOnly = config.copyTrading?.buyOnly ?? true;
          const isBuy = this.isBuyTransaction(tx);
          if (tx && (!buyOnly || isBuy)) {
            const tokenInfo = await this.extractTokenInfo(tx);
            if (!tokenInfo) continue;

            for (const cfg of activeConfigs) {
              const execution = await this.executeCopyTrade(
                cfg.id,
                tx,
                tokenInfo.tokenAddress,
                tokenInfo.tokenSymbol,
                tokenInfo.tokenName,
                ethers.formatEther(tx.value ?? 0)
              );

              if (execution.success) {
                const event = Array.from(this.events.values()).find(
                  e => e.transactionHash === execution.transactionHash
                );
                if (event) executedEvents.push(event);
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