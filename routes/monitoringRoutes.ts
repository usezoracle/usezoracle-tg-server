import { Router, Request, Response } from 'express';
import { MonitoringService, DepositEvent } from '../services/monitoringService.js';
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
router.post('/deposits', async (req: Request, res: Response) => {
  try {
    const { walletAddress, fromBlock } = req.body;

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
    console.error('Error in deposit monitoring:', error);
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
 *                 description: The wallet address to monitor for trading activities
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
 *         description: Copy trading events found and executed
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
 *                       id:
 *                         type: string
 *                       configId:
 *                         type: string
 *                       accountName:
 *                         type: string
 *                       targetWalletAddress:
 *                         type: string
 *                       tokenAddress:
 *                         type: string
 *                       tokenSymbol:
 *                         type: string
 *                       tokenName:
 *                         type: string
 *                       originalAmount:
 *                         type: string
 *                       copiedAmount:
 *                         type: string
 *                       transactionHash:
 *                         type: string
 *                       timestamp:
 *                         type: number
 *                       status:
 *                         type: string
 *       400:
 *         description: Bad request
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

    // Create copy trading configuration
    const copyTradingService = CopyTradingService.getInstance();
    const config = await copyTradingService.createCopyTradeConfig(
      accountName,
      walletAddress,
      delegationAmount,
      maxSlippage
    );

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
    console.error('Error in copy trading monitoring:', error);
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
    console.error('Error getting copy trading configs:', error);
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
    console.error('Error getting copy trading events:', error);
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
    const { configId } = req.params;
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
    console.error('Error updating copy trading config:', error);
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
    const { configId } = req.params;

    const copyTradingService = CopyTradingService.getInstance();
    await copyTradingService.deleteCopyTradeConfig(configId);
    
    const response: ApiResponse = {
      success: true,
      message: 'Copy trading configuration deleted successfully'
    };

    res.json(response);
  } catch (error) {
    console.error('Error deleting copy trading config:', error);
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
router.get('/balance/:address', async (req: Request, res: Response) => {
  try {
    const { address } = req.params;

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
    console.error('Error getting wallet balance:', error);
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
router.post('/token-balance', async (req: Request, res: Response) => {
  try {
    const { tokenAddress, walletAddress } = req.body;

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
    console.error('Error getting token balance:', error);
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
router.get('/recent-transactions/:address', async (req: Request, res: Response) => {
  try {
    const { address } = req.params;
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
    console.error('Error getting recent transactions:', error);
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
    console.error('Error checking limit orders:', error);
    res.status(500).json({
      success: false,
      error: (error as Error).message || 'Failed to check limit orders'
    } as ApiResponse);
  }
});

export { router as monitoringRoutes }; 