import { Router, Request, Response } from 'express';
import { MonitoringService, DepositEvent, CopyTradeEvent } from '../services/monitoringService.js';
import { ApiResponse, Position } from '../types/index.js';

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
 *     summary: Monitor a wallet for copy trading opportunities
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
 *                 description: The wallet address to monitor for trading activities
 *     responses:
 *       200:
 *         description: Copy trading events found
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
 *                       walletAddress:
 *                         type: string
 *                       transactionHash:
 *                         type: string
 *                       method:
 *                         type: string
 *                       params:
 *                         type: object
 *                       timestamp:
 *                         type: number
 *       400:
 *         description: Bad request
 *       500:
 *         description: Internal server error
 */
router.post('/copy-trading', async (req: Request, res: Response) => {
  try {
    const { walletAddress } = req.body;

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

    const copyTradeEvents = await getMonitoringService().monitorCopyTrading(walletAddress);
    
    const response: ApiResponse<CopyTradeEvent[]> = {
      success: true,
      data: copyTradeEvents,
      message: `Found ${copyTradeEvents.length} copy trading events for wallet ${walletAddress}`
    };

    res.json(response);
  } catch (error) {
    console.error('Error in copy trading monitoring:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to monitor copy trading'
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