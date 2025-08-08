import { Router, Request, Response } from 'express';

import { MonitoringService, SnipeEvent } from '../services/monitoringService.js';
import { ApiResponse } from '../types/index.js';
import { logger } from '../lib/logger.js';

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
 * /api/snipe:
 *   post:
 *     summary: Snipe a token - execute a trade as fast as possible
 *     description: Executes a fast token purchase using secure CDP account management (no private keys required)
 *     tags:
 *       - Snipe
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - accountName
 *               - tokenAddress
 *               - amount
 *             properties:
 *               accountName:
 *                 type: string
 *                 description: The CDP account name to use for the snipe
 *               tokenAddress:
 *                 type: string
 *                 description: The token contract address to snipe
 *               amount:
 *                 type: string
 *                 description: Amount of ETH to spend on the token
 *               slippage:
 *                 type: number
 *                 description: Slippage tolerance (default 0.05 for 5%)
 *     responses:
 *       200:
 *         description: Snipe transaction executed successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/SnipeResponse"
 *       400:
 *         description: Bad request
 *       500:
 *         description: Internal server error
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const { accountName, tokenAddress, amount, slippage = 0.05 } = req.body;

    if (!accountName || !tokenAddress || !amount) {
      return res.status(400).json({
        success: false,
        error: 'accountName, tokenAddress, and amount are required'
      } as ApiResponse);
    }

    // Validate token address format
    if (!/^0x[a-fA-F0-9]{40}$/.test(tokenAddress)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid token address format'
      } as ApiResponse);
    }

    // Validate account name format (alphanumeric and hyphens)
    if (!/^[a-zA-Z0-9-]+$/.test(accountName)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid account name format. Use only letters, numbers, and hyphens.'
      } as ApiResponse);
    }

    const snipeEvent = await getMonitoringService().snipeToken(
      accountName,
      tokenAddress,
      amount,
      slippage
    );
    
    const response: ApiResponse<SnipeEvent> = {
      success: true,
      data: snipeEvent,
      message: `Successfully sniped token ${tokenAddress} using account ${accountName}`
    };

    res.json(response);
  } catch (error) {
    logger.error({ err: error }, 'Error in token sniping');
    res.status(500).json({
      success: false,
      error: (error as Error).message || 'Failed to snipe token'
    } as ApiResponse);
  }
});

export { router as snipeRoutes }; 