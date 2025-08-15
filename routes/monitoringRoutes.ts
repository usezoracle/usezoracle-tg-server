import { Router, Request, Response } from 'express';
import { z } from 'zod';

import { logger } from '../lib/logger.js';
import { MonitoringService, DepositEvent } from '../services/monitoringService.js';
import { validateParams, validateBody, hexAddressParamSchema, tokenBalanceBodySchema } from '../middleware/requestValidation.js';
import { CopyTradingService } from '../services/copyTradingService.js';
import { ApiResponse, Position, CopyTradeConfig, CopyTradeEvent } from '../types/index.js';

const router = Router();
let monitoringService: MonitoringService | null = null;

// Lazy initialization of monitoring service
function getMonitoringService(): MonitoringService {
  if (!monitoringService) {
    monitoringService = new MonitoringService();
  }
  return monitoringService;
}

/**
 * @swagger
 * /api/monitoring/deposits:
 *   post:
 *     summary: Monitor wallet for incoming deposits
 *     tags: [Monitoring]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - walletAddress
 *             properties:
 *               walletAddress:
 *                 type: string
 *                 description: The wallet address to monitor for deposits
 *               fromBlock:
 *                 type: number
 *                 description: Starting block number (optional, defaults to last 1000 blocks)
 *     responses:
 *       200:
 *         description: Deposit events found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       from:
 *                         type: string
 *                       to:
 *                         type: string
 *                       value:
 *                         type: string
 *                       transactionHash:
 *                         type: string
 *                       blockNumber:
 *                         type: number
 *                       timestamp:
 *                         type: number
 *       400:
 *         description: Bad request
 *       500:
 *         description: Internal server error
 */
router.post('/deposits', validateBody(z.object({ walletAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/) })), async (req: Request, res: Response) => {
  try {
    const { walletAddress, fromBlock: _fromBlock } = req.body;

    if (!walletAddress) {
      return res.status(400).json({
        success: false,
        error: 'walletAddress is required'
      } as ApiResponse);
    }

    // Validate wallet address format
    if (!/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid wallet address format'
      } as ApiResponse);
    }

    const depositEvents = await getMonitoringService().monitorDeposits(walletAddress);
    
    const response: ApiResponse<DepositEvent[]> = {
      success: true,
      data: depositEvents,
      message: `Found ${depositEvents.length} deposit events for wallet ${walletAddress}`
    };

    res.json(response);
  } catch (error) {
    logger.error({ err: error }, 'Error in deposit monitoring');
    res.status(500).json({
      success: false,
      error: 'Failed to monitor deposits'
    } as ApiResponse);
  }
});

/**
 * @swagger
 * /api/monitoring/copy-trading:
 *   post:
 *     summary: Monitor a wallet for copy trading opportunities and execute copy trades
 *     tags: [Monitoring]
 *     description: |
 *       Creates a copy-trade configuration and automatically updates the CDP webhook to monitor the target wallet.
 *       This endpoint handles the complete setup process for copy trading, including webhook integration.
 *       
 *       ## Webhook Integration
 *       
 *       ### Automatic Webhook Updates
 *       When you create a copy-trade configuration, the system automatically:
 *       1. **Adds the target wallet** to the CDP webhook monitoring list
 *       2. **Updates webhook addresses** with all active copy-trade target wallets
 *       3. **Ensures real-time monitoring** of the new wallet address
 *       
 *       ### CDP Webhook Configuration
 *       - **Event Type**: `wallet_activity` - Monitors all trading activities
 *       - **Network**: `base-mainnet` - Base network transactions
 *       - **Addresses**: Automatically managed list of all target wallet addresses
 *       - **Auto-Sync**: Webhook addresses are updated whenever copy-trade configs change
 *       
 *       ### Integration Process
 *       1. **Create Copy-Trade Config**: This endpoint creates the configuration
 *       2. **Webhook Update**: Automatically updates CDP webhook with new address
 *       3. **Monitor Activities**: CDP webhook sends real-time notifications
 *       4. **Execute Copy Trades**: System executes trades based on webhook events
 *       
 *       ### Manual Webhook Management
 *       If webhook addresses need manual synchronization:
 *       - Use `/api/monitoring/webhook/update-addresses` to force sync
 *       - Check webhook status via `/api/cdp/webhooks/{webhookId}`
 *       - List all webhooks via `/api/cdp/webhooks`
 *       
 *       ### Troubleshooting
 *       - **Missing Addresses**: Call webhook update endpoint to sync
 *       - **Webhook Not Working**: Verify CDP_WEBHOOK_ID environment variable
 *       - **No Notifications**: Check webhook status and addresses
 *       
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - walletAddress
 *               - accountName
 *               - delegationAmount
 *             properties:
 *               walletAddress:
 *                 type: string
 *                 description: The wallet address to monitor for trading activities (will be added to webhook)
 *               accountName:
 *                 type: string
 *                 description: The account name to use for copy trading
 *               delegationAmount:
 *                 type: string
 *                 description: Amount of ETH to delegate for copy trading
 *               maxSlippage:
 *                 type: number
 *                 description: Maximum slippage percentage (default 0.05 for 5%)
 *     responses:
 *       200:
 *         description: Copy trading configuration created and webhook updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     config:
 *                       type: object
 *                       description: The created copy-trade configuration
 *                     events:
 *                       type: array
 *                       items:
 *                         type: object
 *                         description: Copy-trade events found and executed
 *                 message:
 *                   type: string
 *                   description: Success message including webhook update confirmation
 *       400:
 *         description: Bad request (invalid wallet address, missing parameters)
 *       409:
 *         description: Wallet address already being copy-traded by this account
 *       500:
 *         description: Internal server error
 */
router.post('/copy-trading', async (req: Request, res: Response) => {
  try {
    const { walletAddress, accountName, delegationAmount, maxSlippage = 0.05 } = req.body;

    if (!walletAddress || !accountName || !delegationAmount) {
      return res.status(400).json({
        success: false,
        error: 'walletAddress, accountName, and delegationAmount are required'
      } as ApiResponse);
    }

    // Validate wallet address format
    if (!/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid wallet address format'
      } as ApiResponse);
    }

    // Validate delegation amount
    if (isNaN(parseFloat(delegationAmount)) || parseFloat(delegationAmount) <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid delegation amount'
      } as ApiResponse);
    }

    // Prevent duplicate: one config per (accountName, targetWalletAddress)
    const { CopyTradeConfigModel } = await import('../models/CopyTradeConfig.js');
    const existing = await CopyTradeConfigModel.findOne({ accountName, targetWalletAddress: walletAddress.toLowerCase() }).lean();
    if (existing) {
      return res.status(409).json({ 
        success: false, 
        error: `This wallet address ${walletAddress} is already being copy-traded by this account (${accountName}). Only one copy-trade config per wallet address per account is allowed.` 
      } as ApiResponse);
    }

    // Create copy trading configuration
    const copyTradingService = CopyTradingService.getInstance();
    const config = await copyTradingService.createCopyTradeConfig(
      accountName,
      walletAddress,
      delegationAmount,
      maxSlippage
    );

    // Update CDP webhook addresses list with all target wallets (if configured)
    try {
      const { config: appConfig } = await import('../config/index.js');
      const { CdpWebhookService } = await import('../services/cdpWebhookService.js');
      const svc = CdpWebhookService.getInstance();
      const webhookId = appConfig.cdp.webhookId || process.env.CDP_WEBHOOK_ID || '';
      if (webhookId) {
        // Get all target wallet addresses from all copy-trade configs
        const { CopyTradeConfigModel } = await import('../models/CopyTradeConfig.js');
        const allConfigs = await CopyTradeConfigModel.find({ isActive: true }).lean();
        const allTargetWallets = [...new Set(allConfigs.map(cfg => cfg.targetWalletAddress.toLowerCase()))];
        
        await svc.updateWalletActivityAddresses({
          webhookId,
          addresses: allTargetWallets,
          walletId: '',
        });
        logger.info({ webhookId, walletCount: allTargetWallets.length, wallets: allTargetWallets }, 'CDP webhook addresses updated with all target wallets');
      }
    } catch (_e) {
      // Non-fatal if webhook update fails
      logger.warn({ err: _e }, 'Failed to update CDP webhook addresses');
    }

    // Monitor and execute copy trades
    const copyTradeEvents = await copyTradingService.monitorAndExecuteCopyTrades(walletAddress);
    
    const response: ApiResponse<{ config: CopyTradeConfig; events: CopyTradeEvent[] }> = {
      success: true,
      data: {
        config,
        events: copyTradeEvents
      },
      message: `Copy trading setup complete. Found ${copyTradeEvents.length} buy transactions to copy.`
    };

    res.json(response);
  } catch (error) {
    logger.error({ err: error }, 'Error in copy trading monitoring');
    res.status(500).json({
      success: false,
      error: (error as Error).message || 'Failed to monitor copy trading'
    } as ApiResponse);
  }
});

/**
 * @swagger
 * /api/monitoring/copy-trading/configs:
 *   get:
 *     summary: Get copy trading configurations for an account
 *     tags: [Monitoring]
 *     parameters:
 *       - in: query
 *         name: accountName
 *         required: true
 *         schema:
 *           type: string
 *         description: The account name to get configurations for
 *     responses:
 *       200:
 *         description: Copy trading configurations retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: "#/components/schemas/CopyTradeConfig"
 *       400:
 *         description: Bad request
 *       500:
 *         description: Internal server error
 */
router.get('/copy-trading/configs', async (req: Request, res: Response) => {
  try {
    const { accountName } = req.query;

    if (!accountName) {
      return res.status(400).json({
        success: false,
        error: 'accountName is required'
      } as ApiResponse);
    }

    const copyTradingService = CopyTradingService.getInstance();
    const configs = await copyTradingService.getCopyTradeConfigs(accountName as string);
    
    const response: ApiResponse<CopyTradeConfig[]> = {
      success: true,
      data: configs,
      message: `Found ${configs.length} copy trading configurations for account ${accountName}`
    };

    res.json(response);
  } catch (error) {
    logger.error({ err: error }, 'Error getting copy trading configs');
    res.status(500).json({
      success: false,
      error: (error as Error).message || 'Failed to get copy trading configurations'
    } as ApiResponse);
  }
});

/**
 * @swagger
 * /api/monitoring/copy-trading/events:
 *   get:
 *     summary: Get copy trading events for an account
 *     tags: [Monitoring]
 *     parameters:
 *       - in: query
 *         name: accountName
 *         required: true
 *         schema:
 *           type: string
 *         description: The account name to get events for
 *     responses:
 *       200:
 *         description: Copy trading events retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: "#/components/schemas/CopyTradeEvent"
 *       400:
 *         description: Bad request
 *       500:
 *         description: Internal server error
 */
router.get('/copy-trading/events', async (req: Request, res: Response) => {
  try {
    const { accountName } = req.query;

    if (!accountName) {
      return res.status(400).json({
        success: false,
        error: 'accountName is required'
      } as ApiResponse);
    }

    const copyTradingService = CopyTradingService.getInstance();
    const events = await copyTradingService.getCopyTradeEvents(accountName as string);
    
    const response: ApiResponse<CopyTradeEvent[]> = {
      success: true,
      data: events,
      message: `Found ${events.length} copy trading events for account ${accountName}`
    };

    res.json(response);
  } catch (error) {
    logger.error({ err: error }, 'Error getting copy trading events');
    res.status(500).json({
      success: false,
      error: (error as Error).message || 'Failed to get copy trading events'
    } as ApiResponse);
  }
});

/**
 * @swagger
 * /api/monitoring/copy-trading/configs/{configId}:
 *   put:
 *     summary: Update copy trading configuration
 *     tags: [Monitoring]
 *     parameters:
 *       - in: path
 *         name: configId
 *         required: true
 *         schema:
 *           type: string
 *         description: The configuration ID to update
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               delegationAmount:
 *                 type: string
 *               maxSlippage:
 *                 type: number
 *               isActive:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Configuration updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: "#/components/schemas/CopyTradeConfig"
 *       400:
 *         description: Bad request
 *       500:
 *         description: Internal server error
 */
router.put('/copy-trading/configs/:configId', async (req: Request, res: Response) => {
  try {
    const configId = req.params.configId as string;
    const updates = req.body;

    const copyTradingService = CopyTradingService.getInstance();
    const updatedConfig = await copyTradingService.updateCopyTradeConfig(configId, updates);
    
    const response: ApiResponse<CopyTradeConfig> = {
      success: true,
      data: updatedConfig,
      message: 'Copy trading configuration updated successfully'
    };

    res.json(response);
  } catch (error) {
    logger.error({ err: error }, 'Error updating copy trading config');
    res.status(500).json({
      success: false,
      error: (error as Error).message || 'Failed to update copy trading configuration'
    } as ApiResponse);
  }
});

/**
 * @swagger
 * /api/monitoring/copy-trading/configs/{configId}:
 *   delete:
 *     summary: Delete copy trading configuration
 *     tags: [Monitoring]
 *     parameters:
 *       - in: path
 *         name: configId
 *         required: true
 *         schema:
 *           type: string
 *         description: The configuration ID to delete
 *     responses:
 *       200:
 *         description: Configuration deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *       400:
 *         description: Bad request
 *       500:
 *         description: Internal server error
 */
router.delete('/copy-trading/configs/:configId', async (req: Request, res: Response) => {
  try {
    const configId = req.params.configId as string;

    const copyTradingService = CopyTradingService.getInstance();
    await copyTradingService.deleteCopyTradeConfig(configId);
    
    const response: ApiResponse = {
      success: true,
      message: 'Copy trading configuration deleted successfully'
    };

    res.json(response);
  } catch (error) {
    logger.error({ err: error }, 'Error deleting copy trading config');
    res.status(500).json({
      success: false,
      error: (error as Error).message || 'Failed to delete copy trading configuration'
    } as ApiResponse);
  }
});

/**
 * @swagger
 * /api/monitoring/balance/{address}:
 *   get:
 *     summary: Get wallet balance
 *     tags: [Monitoring]
 *     parameters:
 *       - in: path
 *         name: address
 *         required: true
 *         schema:
 *           type: string
 *         description: The wallet address to get balance for
 *     responses:
 *       200:
 *         description: Wallet balance retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     address:
 *                       type: string
 *                     balance:
 *                       type: string
 *       400:
 *         description: Bad request
 *       500:
 *         description: Internal server error
 */
router.get('/balance/:address', validateParams(hexAddressParamSchema), async (req: Request, res: Response) => {
  try {
    const address = req.params.address as string;

    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid wallet address format'
      } as ApiResponse);
    }

    const balance = await getMonitoringService().getWalletBalance(address);
    
    const response: ApiResponse<{ address: string; balance: string }> = {
      success: true,
      data: {
        address,
        balance
      },
      message: `Balance retrieved for wallet ${address}`
    };

    res.json(response);
  } catch (error) {
    logger.error({ err: error }, 'Error getting wallet balance');
    res.status(500).json({
      success: false,
      error: 'Failed to get wallet balance'
    } as ApiResponse);
  }
});

/**
 * @swagger
 * /api/monitoring/token-balance:
 *   post:
 *     summary: Get token balance for a wallet
 *     tags: [Monitoring]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - tokenAddress
 *               - walletAddress
 *             properties:
 *               tokenAddress:
 *                 type: string
 *                 description: The token contract address
 *               walletAddress:
 *                 type: string
 *                 description: The wallet address to check balance for
 *     responses:
 *       200:
 *         description: Token balance retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     tokenAddress:
 *                       type: string
 *                     walletAddress:
 *                       type: string
 *                     balance:
 *                       type: string
 *       400:
 *         description: Bad request
 *       500:
 *         description: Internal server error
 */
router.post('/token-balance', validateBody(tokenBalanceBodySchema), async (req: Request, res: Response) => {
  try {
    const tokenAddress = req.body.tokenAddress as string;
    const walletAddress = req.body.walletAddress as string;

    if (!tokenAddress || !walletAddress) {
      return res.status(400).json({
        success: false,
        error: 'tokenAddress and walletAddress are required'
      } as ApiResponse);
    }

    // Validate addresses format
    if (!/^0x[a-fA-F0-9]{40}$/.test(tokenAddress) || !/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid address format'
      } as ApiResponse);
    }

    const balance = await getMonitoringService().getTokenBalance(tokenAddress, walletAddress);
    
    const response: ApiResponse<{ tokenAddress: string; walletAddress: string; balance: string }> = {
      success: true,
      data: {
        tokenAddress,
        walletAddress,
        balance
      },
      message: `Token balance retrieved for wallet ${walletAddress}`
    };

    res.json(response);
  } catch (error) {
    logger.error({ err: error }, 'Error getting token balance');
    res.status(500).json({
      success: false,
      error: 'Failed to get token balance'
    } as ApiResponse);
  }
});

/**
 * @swagger
 * /api/monitoring/recent-transactions/{address}:
 *   get:
 *     summary: Get recent transactions for a wallet
 *     tags: [Monitoring]
 *     parameters:
 *       - in: path
 *         name: address
 *         required: true
 *         schema:
 *           type: string
 *         description: The wallet address to get transactions for
 *       - in: query
 *         name: limit
 *         schema:
 *           type: number
 *           default: 10
 *         description: Number of recent transactions to retrieve
 *     responses:
 *       200:
 *         description: Recent transactions retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *       400:
 *         description: Bad request
 *       500:
 *         description: Internal server error
 */
router.get('/recent-transactions/:address', validateParams(hexAddressParamSchema), async (req: Request, res: Response) => {
  try {
    const address = req.params.address as string;
    const limit = parseInt(req.query.limit as string) || 10;

    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid wallet address format'
      } as ApiResponse);
    }

    const transactions = await getMonitoringService().getRecentTransactions(address, limit);
    
    const response: ApiResponse<any[]> = {
      success: true,
      data: transactions,
      message: `Retrieved ${transactions.length} recent transactions for wallet ${address}`
    };

    res.json(response);
  } catch (error) {
    logger.error({ err: error }, 'Error getting recent transactions');
    res.status(500).json({
      success: false,
      error: 'Failed to get recent transactions'
    } as ApiResponse);
  }
});

/**
 * @swagger
 * /api/monitoring/check-limit-orders:
 *   post:
 *     summary: Check and trigger pending limit orders
 *     description: Check all pending limit orders and trigger them if price conditions are met. This should be called periodically to monitor limit orders.
 *     tags: [Monitoring]
 *     responses:
 *       200:
 *         description: Limit orders checked successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: "#/components/schemas/Position"
 *                 message:
 *                   type: string
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 */
router.post('/check-limit-orders', async (req: Request, res: Response) => {
  try {
    // Import the positions service to check limit orders
    const { PositionsService } = await import('../services/positionsService.js');
    const positionsService = new PositionsService();
    
    const triggeredOrders = await positionsService.checkPendingLimitOrders();
    
    const response: ApiResponse<Position[]> = {
      success: true,
      data: triggeredOrders,
      message: `Checked limit orders: ${triggeredOrders.length} orders triggered`
    };

    res.json(response);
  } catch (error) {
    logger.error({ err: error }, 'Error checking limit orders');
    res.status(500).json({
      success: false,
      error: (error as Error).message || 'Failed to check limit orders'
    } as ApiResponse);
  }
});

/**
 * @swagger
 * /api/monitoring/copy-trading/cleanup:
 *   post:
 *     summary: Clean up duplicate copy trading configurations
 *     description: Remove duplicate copy trading configurations, keeping only the most recent one for each target wallet address. This helps maintain data integrity and prevents confusion from multiple configs for the same wallet.
 *     tags: [Monitoring]
 *     responses:
 *       200:
 *         description: Duplicate configurations cleaned up successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     removed:
 *                       type: number
 *                       description: Number of duplicate configurations removed
 *                     kept:
 *                       type: number
 *                       description: Number of configurations kept (one per unique wallet address)
 *                 message:
 *                   type: string
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 */
router.post('/copy-trading/cleanup', async (req: Request, res: Response) => {
  try {
    const copyTradingService = CopyTradingService.getInstance();
    const result = await copyTradingService.cleanupDuplicateConfigs();
    
    const response: ApiResponse<{ removed: number; kept: number }> = {
      success: true,
      data: result,
      message: `Cleanup completed: ${result.removed} duplicate configs removed, ${result.kept} configs kept`
    };

    res.json(response);
  } catch (error) {
    logger.error({ err: error }, 'Error cleaning up duplicate copy trading configs');
    res.status(500).json({
      success: false,
      error: (error as Error).message || 'Failed to clean up duplicate configurations'
    } as ApiResponse);
  }
});

/**
 * @swagger
 * /api/monitoring/test-telegram:
 *   post:
 *     summary: Test Telegram notification for copy trades
 *     description: Send a test Telegram notification to verify the notification system is working
 *     tags: [Monitoring]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - accountName
 *               - targetWalletAddress
 *               - tokenSymbol
 *               - tokenName
 *               - copiedAmount
 *               - transactionHash
 *               - originalTxHash
 *             properties:
 *               accountName:
 *                 type: string
 *                 description: The CDP account name
 *               targetWalletAddress:
 *                 type: string
 *                 description: The target wallet address being copied
 *               tokenSymbol:
 *                 type: string
 *                 description: The token symbol
 *               tokenName:
 *                 type: string
 *                 description: The token name
 *               copiedAmount:
 *                 type: string
 *                 description: The amount copied
 *               transactionHash:
 *                 type: string
 *                 description: The copy trade transaction hash
 *               originalTxHash:
 *                 type: string
 *                 description: The original transaction hash
 *     responses:
 *       200:
 *         description: Test notification sent successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 */
router.post('/test-telegram', async (req: Request, res: Response) => {
  try {
    const { 
      accountName, 
      targetWalletAddress, 
      tokenSymbol, 
      tokenName, 
      copiedAmount, 
      transactionHash, 
      originalTxHash 
    } = req.body;

    // Import and use TelegramService
    const { TelegramService } = await import('../services/telegramService.js');
    const telegramService = TelegramService.getInstance();

    // Send test notification
    await telegramService.sendCopyTradeNotification(
      accountName,
      targetWalletAddress,
      tokenSymbol,
      tokenName,
      copiedAmount,
      transactionHash,
      originalTxHash
    );

    const response: ApiResponse<null> = {
      success: true,
      data: null,
      message: 'Test Telegram notification sent successfully'
    };

    res.json(response);
  } catch (error) {
    logger.error({ err: error }, 'Error sending test Telegram notification');
    res.status(500).json({
      success: false,
      error: (error as Error).message || 'Failed to send test notification'
    } as ApiResponse);
  }
});

/**
 * @swagger
 * /api/monitoring/test-telegram-failed:
 *   post:
 *     summary: Test Telegram notification for failed copy trades
 *     description: Send a test Telegram notification for failed copy trades to verify the notification system is working
 *     tags: [Monitoring]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - accountName
 *               - targetWalletAddress
 *               - tokenSymbol
 *               - tokenName
 *               - errorMessage
 *             properties:
 *               accountName:
 *                 type: string
 *                 description: The CDP account name
 *               targetWalletAddress:
 *                 type: string
 *                 description: The target wallet address being copied
 *               tokenSymbol:
 *                 type: string
 *                 description: The token symbol
 *               tokenName:
 *                 type: string
 *                 description: The token name
 *               errorMessage:
 *                 type: string
 *                 description: The error message
 *     responses:
 *       200:
 *         description: Test notification sent successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 */
router.post('/test-telegram-failed', async (req: Request, res: Response) => {
  try {
    const { 
      accountName, 
      targetWalletAddress, 
      tokenSymbol, 
      tokenName, 
      errorMessage 
    } = req.body;

    // Import and use TelegramService
    const { TelegramService } = await import('../services/telegramService.js');
    const telegramService = TelegramService.getInstance();

    // Send test failed notification
    await telegramService.sendFailedCopyTradeNotification(
      accountName,
      targetWalletAddress,
      tokenSymbol,
      tokenName,
      errorMessage
    );

    const response: ApiResponse<null> = {
      success: true,
      data: null,
      message: 'Test failed copy trade Telegram notification sent successfully'
    };

    res.json(response);
  } catch (error) {
    logger.error({ err: error }, 'Error sending test failed copy trade Telegram notification');
    res.status(500).json({
      success: false,
      error: (error as Error).message || 'Failed to send test failed notification'
    } as ApiResponse);
  }
});

/**
 * @swagger
 * /api/monitoring/test-user:
 *   post:
 *     summary: Create a test user for Telegram notifications
 *     description: Create a test user with CDP account name to test Telegram notifications
 *     tags: [Monitoring]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - telegramId
 *               - cdpAccountName
 *             properties:
 *               telegramId:
 *                 type: string
 *                 description: The Telegram user ID
 *               cdpAccountName:
 *                 type: string
 *                 description: The CDP account name
 *               username:
 *                 type: string
 *                 description: The Telegram username
 *     responses:
 *       200:
 *         description: Test user created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 */
router.post('/test-user', async (req: Request, res: Response) => {
  try {
    const { telegramId, cdpAccountName, username } = req.body;

    // Import User model
    const { User } = await import('../models/User.js');

    // Create test user
    const testUser = new User({
      telegramId,
      username: username || 'testuser',
      firstName: 'Test',
      lastName: 'User',
      isActive: true,
      settings: {
        notifications: true,
        language: 'en',
        timezone: 'UTC',
        cdpAccountName
      }
    });

    await testUser.save();

    const response: ApiResponse<null> = {
      success: true,
      data: null,
      message: `Test user created with telegramId: ${telegramId}, cdpAccountName: ${cdpAccountName}`
    };

    res.json(response);
  } catch (error) {
    logger.error({ err: error }, 'Error creating test user');
    res.status(500).json({
      success: false,
      error: (error as Error).message || 'Failed to create test user'
    } as ApiResponse);
  }
});

/**
 * @swagger
 * /api/monitoring/check-db:
 *   get:
 *     summary: Check database for users and copy trade configs
 *     description: Inspect the database to see what data is available for Telegram notifications
 *     tags: [Monitoring]
 *     responses:
 *       200:
 *         description: Database inspection results
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                 message:
 *                   type: string
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 */
router.get('/check-db', async (req: Request, res: Response) => {
  try {
    // Import models
    const { User } = await import('../models/User.js');
    const { CopyTradeConfigModel } = await import('../models/CopyTradeConfig.js');

    // Get all users
    const users = await User.find({}).lean();
    
    // Get all copy trade configs
    const copyTradeConfigs = await CopyTradeConfigModel.find({}).lean();

    // Analyze the data
    const analysis = {
      totalUsers: users.length,
      usersWithCdpAccount: users.filter(u => u.settings?.cdpAccountName).length,
      usersWithNotifications: users.filter(u => u.settings?.notifications).length,
      activeUsers: users.filter(u => u.isActive).length,
      totalCopyTradeConfigs: copyTradeConfigs.length,
      uniqueCdpAccounts: [...new Set(copyTradeConfigs.map(c => c.accountName))],
      userDetails: users.map(u => ({
        telegramId: u.telegramId,
        username: u.username,
        isActive: u.isActive,
        settings: u.settings,
        hasCdpAccount: !!u.settings?.cdpAccountName,
        hasNotifications: !!u.settings?.notifications
      })),
      copyTradeConfigDetails: copyTradeConfigs.map(c => ({
        accountName: c.accountName,
        targetWalletAddress: c.targetWalletAddress,
        isActive: c.isActive,
        delegationAmount: c.delegationAmount,
        totalSpent: c.totalSpent
      }))
    };

    const response: ApiResponse<any> = {
      success: true,
      data: analysis,
      message: `Database analysis complete. Found ${users.length} users and ${copyTradeConfigs.length} copy trade configs.`
    };

    res.json(response);
  } catch (error) {
    logger.error({ err: error }, 'Error checking database');
    res.status(500).json({
      success: false,
      error: (error as Error).message || 'Failed to check database'
    } as ApiResponse);
  }
});

/**
 * @swagger
 * /api/monitoring/webhook/update-addresses:
 *   post:
 *     summary: Update CDP webhook addresses with all active copy-trade target wallets
 *     tags: [Monitoring]
 *     description: |
 *       Manually updates the CDP webhook with all target wallet addresses from active copy-trade configurations.
 *       This endpoint ensures the webhook is monitoring all wallets that should be copy-traded.
 *       
 *       ## Integration Guide
 *       
 *       ### When to Use This Endpoint
 *       - After adding new copy-trade configurations
 *       - When webhook addresses are out of sync
 *       - During system maintenance or recovery
 *       
 *       ### Webhook Integration Process
 *       1. **Create Copy-Trade Config**: Use `/api/monitoring/copy-trading` to add new target wallets
 *       2. **Verify Webhook Update**: This endpoint automatically updates webhook addresses
 *       3. **Manual Sync**: If needed, call this endpoint to force webhook address synchronization
 *       4. **Monitor Webhook**: Check webhook status via `/api/cdp/webhooks/{webhookId}`
 *       
 *       ### CDP Webhook Configuration
 *       - **Event Type**: `wallet_activity`
 *       - **Network**: `base-mainnet`
 *       - **Addresses**: All target wallet addresses from active copy-trade configs
 *       - **Auto-Update**: Webhook addresses are automatically updated when copy-trade configs change
 *       
 *       ### Troubleshooting
 *       - If webhook addresses are missing, call this endpoint to sync
 *       - Check webhook status and addresses via CDP webhook endpoints
 *       - Verify copy-trade configs are active before updating webhook
 *     responses:
 *       200:
 *         description: Webhook addresses updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     webhookId:
 *                       type: string
 *                       description: The CDP webhook ID that was updated
 *                     addressCount:
 *                       type: number
 *                       description: Number of addresses in the webhook
 *                     addresses:
 *                       type: array
 *                       items:
 *                         type: string
 *                       description: List of all target wallet addresses
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *                       description: When the webhook was last updated
 *                 message:
 *                   type: string
 *                   description: Success message
 *       400:
 *         description: Bad request or webhook not configured
 *       500:
 *         description: Internal server error
 */
router.post('/webhook/update-addresses', async (req: Request, res: Response) => {
  try {
    const { config: appConfig } = await import('../config/index.js');
    const { CdpWebhookService } = await import('../services/cdpWebhookService.js');
    const { CopyTradeConfigModel } = await import('../models/CopyTradeConfig.js');
    
    let webhookId = appConfig.cdp.webhookId || process.env.CDP_WEBHOOK_ID || '';
    
    // If no webhook ID is configured, try to get the first available webhook
    if (!webhookId) {
      try {
        const svc = CdpWebhookService.getInstance();
        const webhooks = await svc.listWebhooks();
        if (webhooks.length > 0) {
          webhookId = webhooks[0].model?.id || webhooks[0].id;
          logger.info({ webhookId }, 'Using first available webhook since CDP_WEBHOOK_ID not configured');
        }
      } catch (err) {
        logger.warn({ err }, 'Failed to get available webhooks');
      }
    }
    
    if (!webhookId) {
      return res.status(400).json({
        success: false,
        error: 'No CDP webhook ID configured and no webhooks available. Please set CDP_WEBHOOK_ID environment variable.'
      } as ApiResponse);
    }

    // Get all active copy-trade configs
    const allConfigs = await CopyTradeConfigModel.find({ isActive: true }).lean();
    const allTargetWallets = [...new Set(allConfigs.map(cfg => cfg.targetWalletAddress.toLowerCase()))];
    
    if (allTargetWallets.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No active copy-trade configurations found. Add copy-trade configs first.'
      } as ApiResponse);
    }

    // Update webhook addresses
    const svc = CdpWebhookService.getInstance();
    await svc.updateWalletActivityAddresses({
      webhookId,
      addresses: allTargetWallets,
      walletId: '',
    });

    // Get updated webhook details
    const webhookDetails = await svc.getWebhookById(webhookId);
    
    logger.info({ 
      webhookId, 
      walletCount: allTargetWallets.length, 
      wallets: allTargetWallets 
    }, 'CDP webhook addresses manually updated');

    const response: ApiResponse<{
      webhookId: string;
      addressCount: number;
      addresses: string[];
      updatedAt: string;
    }> = {
      success: true,
      data: {
        webhookId,
        addressCount: webhookDetails.addressCount,
        addresses: webhookDetails.addresses,
        updatedAt: webhookDetails.updatedAt
      },
      message: `Webhook addresses updated successfully. Now monitoring ${allTargetWallets.length} target wallets.`
    };

    res.json(response);
  } catch (error) {
    logger.error({ err: error }, 'Error updating webhook addresses');
    res.status(500).json({
      success: false,
      error: (error as Error).message || 'Failed to update webhook addresses'
    } as ApiResponse);
  }
});

export { router as monitoringRoutes }; 