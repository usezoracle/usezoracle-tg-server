import { Router, Request, Response } from 'express';

import { PositionsService } from '../services/positionsService.js';
import { ApiResponse, PositionsResponse, Position } from '../types/index.js';
import { validateParams, validateQuery, accountNameParamSchema, positionIdParamSchema, statusParamSchema } from '../middleware/requestValidation.js';
import { logger } from '../lib/logger.js';

const router = Router();
let positionsService: PositionsService | null = null;

// Lazy initialization of positions service
function getPositionsService(): PositionsService {
  if (!positionsService) {
    positionsService = new PositionsService();
  }
  return positionsService;
}

/**
 * @swagger
 * /api/positions:
 *   get:
 *     summary: Get all positions with filtering options
 *     description: Retrieve all positions (open, closed, pending) with optional filtering by account name and status
 *     tags:
 *       - Positions
 *     parameters:
 *       - in: query
 *         name: accountName
 *         schema:
 *           type: string
 *         description: Filter positions by account name
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [open, closed, pending]
 *         description: Filter positions by status
 *     responses:
 *       200:
 *         description: Positions retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/PositionsResponse"
 *       500:
 *         description: Internal server error
 */
router.get('/', validateQuery(statusParamSchema.partial().extend({ accountName: (accountNameParamSchema.shape as any).accountName.optional() })), async (req: Request, res: Response) => {
  try {
    const { accountName, status } = req.query;
    
    const positions = await getPositionsService().getPositions(
      accountName as string,
      status as 'open' | 'closed' | 'pending'
    );
    
    const response: ApiResponse<PositionsResponse> = {
      success: true,
      data: positions,
      message: `Successfully retrieved ${positions.summary.totalOpen + positions.summary.totalClosed + positions.summary.totalPending} positions`
    };

    res.json(response);
  } catch (error) {
    logger.error({ err: error }, 'Error getting positions');
    res.status(500).json({
      success: false,
      error: (error as Error).message || 'Failed to get positions'
    } as ApiResponse);
  }
});

/**
 * @swagger
 * /api/positions/{positionId}:
 *   get:
 *     summary: Get a specific position by ID
 *     description: Retrieve detailed information about a specific position
 *     tags:
 *       - Positions
 *     parameters:
 *       - in: path
 *         name: positionId
 *         required: true
 *         schema:
 *           type: string
 *         description: The position ID
 *     responses:
 *       200:
 *         description: Position retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/Position"
 *       404:
 *         description: Position not found
 *       500:
 *         description: Internal server error
 */
router.get('/:positionId', validateParams(positionIdParamSchema), async (req: Request, res: Response) => {
  try {
    const positionId = req.params.positionId as string;
    
    const position = await getPositionsService().getPosition(positionId);
    
    if (!position) {
      return res.status(404).json({
        success: false,
        error: 'Position not found'
      } as ApiResponse);
    }
    
    const response: ApiResponse<Position> = {
      success: true,
      data: position,
      message: `Successfully retrieved position ${positionId}`
    };

    res.json(response);
  } catch (error) {
    logger.error({ err: error }, 'Error getting position');
    res.status(500).json({
      success: false,
      error: (error as Error).message || 'Failed to get position'
    } as ApiResponse);
  }
});

/**
 * @swagger
 * /api/positions/account/{accountName}:
 *   get:
 *     summary: Get positions by account name
 *     description: Retrieve all positions for a specific account
 *     tags:
 *       - Positions
 *     parameters:
 *       - in: path
 *         name: accountName
 *         required: true
 *         schema:
 *           type: string
 *         description: The account name
 *     responses:
 *       200:
 *         description: Positions retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/PositionsResponse"
 *       500:
 *         description: Internal server error
 */
router.get('/account/:accountName', validateParams(accountNameParamSchema), async (req: Request, res: Response) => {
  try {
    const accountName = req.params.accountName as string;
    
    const positions = await getPositionsService().getPositionsByAccount(accountName);
    
    const response: ApiResponse<PositionsResponse> = {
      success: true,
      data: positions,
      message: `Successfully retrieved positions for account ${accountName}`
    };

    res.json(response);
  } catch (error) {
    logger.error({ err: error }, 'Error getting positions by account');
    res.status(500).json({
      success: false,
      error: (error as Error).message || 'Failed to get positions by account'
    } as ApiResponse);
  }
});

/**
 * @swagger
 * /api/positions/status/{status}:
 *   get:
 *     summary: Get positions by status
 *     description: Retrieve all positions with a specific status (open, closed, pending)
 *     tags:
 *       - Positions
 *     parameters:
 *       - in: path
 *         name: status
 *         required: true
 *         schema:
 *           type: string
 *           enum: [open, closed, pending]
 *         description: The position status to filter by
 *     responses:
 *       200:
 *         description: Positions retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: "#/components/schemas/Position"
 *       400:
 *         description: Invalid status parameter
 *       500:
 *         description: Internal server error
 */
router.get('/status/:status', validateParams(statusParamSchema), async (req: Request, res: Response) => {
  try {
    const status = req.params.status as 'open' | 'closed' | 'pending' | string;
    
    if (!['open', 'closed', 'pending'].includes(status)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid status. Must be one of: open, closed, pending'
      } as ApiResponse);
    }
    
    const positions = await getPositionsService().getPositionsByStatus(status as 'open' | 'closed' | 'pending');
    
    const response: ApiResponse<Position[]> = {
      success: true,
      data: positions,
      message: `Successfully retrieved ${positions.length} ${status} positions`
    };

    res.json(response);
  } catch (error) {
    logger.error({ err: error }, 'Error getting positions by status');
    res.status(500).json({
      success: false,
      error: (error as Error).message || 'Failed to get positions by status'
    } as ApiResponse);
  }
});

/**
 * @swagger
 * /api/positions/{positionId}/close:
 *   post:
 *     summary: Close a position
 *     description: Close an open position and calculate PnL
 *     tags:
 *       - Positions
 *     parameters:
 *       - in: path
 *         name: positionId
 *         required: true
 *         schema:
 *           type: string
 *         description: The position ID to close
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - exitTransactionHash
 *             properties:
 *               exitTransactionHash:
 *                 type: string
 *                 description: The transaction hash of the exit transaction
 *     responses:
 *       200:
 *         description: Position closed successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/Position"
 *       404:
 *         description: Position not found
 *       400:
 *         description: Position is not open
 *       500:
 *         description: Internal server error
 */
router.post('/:positionId/close', async (req: Request, res: Response) => {
  try {
  const positionId = req.params.positionId as string;
  const exitTransactionHash = req.body.exitTransactionHash as string;
    
    if (!exitTransactionHash) {
      return res.status(400).json({
        success: false,
        error: 'exitTransactionHash is required'
      } as ApiResponse);
    }
    
  const position = await getPositionsService().closePosition(positionId, exitTransactionHash);
    
    const response: ApiResponse<Position> = {
      success: true,
      data: position,
      message: `Successfully closed position ${positionId}`
    };

    res.json(response);
  } catch (error) {
    logger.error({ err: error }, 'Error closing position');
    
    if ((error as Error).message.includes('not found')) {
      return res.status(404).json({
        success: false,
        error: (error as Error).message
      } as ApiResponse);
    }
    
    if ((error as Error).message.includes('not open')) {
      return res.status(400).json({
        success: false,
        error: (error as Error).message
      } as ApiResponse);
    }
    
    res.status(500).json({
      success: false,
      error: (error as Error).message || 'Failed to close position'
    } as ApiResponse);
  }
});

/**
 * @swagger
 * /api/positions/{positionId}/pending:
 *   post:
 *     summary: Set position to pending
 *     description: Set a position to pending status when creating a limit order that hasn't been triggered yet. This is used for orders that are waiting for the market to reach a specific price (e.g., limit buy/sell orders).
 *     tags:
 *       - Positions
 *     parameters:
 *       - in: path
 *         name: positionId
 *         required: true
 *         schema:
 *           type: string
 *         description: The position ID to set to pending
 *     responses:
 *       200:
 *         description: Position set to pending successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/Position"
 *       404:
 *         description: Position not found
 *       500:
 *         description: Internal server error
 */
router.post('/:positionId/pending', async (req: Request, res: Response) => {
  try {
  const positionId = req.params.positionId as string;
    
    // Set position to pending for limit orders waiting to be triggered
    // Example: Limit buy order at $2500 when current price is $2600
    // Example: Limit sell order at $2700 when current price is $2600
  const position = await getPositionsService().setPositionPending(positionId);
    
    const response: ApiResponse<Position> = {
      success: true,
      data: position,
      message: `Successfully set position ${positionId} to pending (limit order waiting to be triggered)`
    };

    res.json(response);
  } catch (error) {
    logger.error({ err: error }, 'Error setting position to pending');
    
    if ((error as Error).message.includes('not found')) {
      return res.status(404).json({
        success: false,
        error: (error as Error).message
      } as ApiResponse);
    }
    
    res.status(500).json({
      success: false,
      error: (error as Error).message || 'Failed to set position to pending (limit order)'
    } as ApiResponse);
  }
});

/**
 * @swagger
 * /api/positions/limit-order:
 *   post:
 *     summary: Create a limit order
 *     description: Create a limit order that will trigger when the token reaches a specific price. The order will be set to pending status until the price condition is met.
 *     tags:
 *       - Positions
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - accountName
 *               - tokenAddress
 *               - orderType
 *               - targetPrice
 *               - amount
 *             properties:
 *               accountName:
 *                 type: string
 *                 description: The account name to create the limit order for
 *                 example: "Bright"
 *               tokenAddress:
 *                 type: string
 *                 description: The token contract address
 *                 example: "0x4200000000000000000000000000000000000006"
 *               orderType:
 *                 type: string
 *                 enum: [buy, sell]
 *                 description: Type of limit order (buy or sell)
 *                 example: "buy"
 *               targetPrice:
 *                 type: string
 *                 description: The target price at which the order should trigger
 *                 example: "2500.00"
 *               amount:
 *                 type: string
 *                 description: The amount of tokens to buy/sell
 *                 example: "0.1"
 *               slippage:
 *                 type: string
 *                 description: Maximum allowed slippage percentage (optional)
 *                 example: "0.5"
 *     responses:
 *       200:
 *         description: Limit order created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/Position"
 *       400:
 *         description: Bad request (invalid parameters)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 */
router.post('/limit-order', async (req: Request, res: Response) => {
  try {
    const { accountName, tokenAddress, orderType, targetPrice, amount, slippage } = req.body;
    
    // Validate required fields
    if (!accountName || !tokenAddress || !orderType || !targetPrice || !amount) {
      return res.status(400).json({
        success: false,
        error: 'accountName, tokenAddress, orderType, targetPrice, and amount are required'
      } as ApiResponse);
    }
    
    // Validate order type
    if (!['buy', 'sell'].includes(orderType)) {
      return res.status(400).json({
        success: false,
        error: 'orderType must be "buy" or "sell"'
      } as ApiResponse);
    }
    
    // Validate target price is a positive number
    const price = parseFloat(targetPrice);
    if (isNaN(price) || price <= 0) {
      return res.status(400).json({
        success: false,
        error: 'targetPrice must be a positive number'
      } as ApiResponse);
    }
    
    // Validate amount is a positive number
    const orderAmount = parseFloat(amount);
    if (isNaN(orderAmount) || orderAmount <= 0) {
      return res.status(400).json({
        success: false,
        error: 'amount must be a positive number'
      } as ApiResponse);
    }
    
    // Create the limit order
    const position = await getPositionsService().createLimitOrder(
      accountName,
      tokenAddress,
      orderType,
      targetPrice,
      amount,
      slippage
    );
    
    const response: ApiResponse<Position> = {
      success: true,
      data: position,
      message: `Limit ${orderType} order created at ${targetPrice} for ${amount} tokens`
    };

    res.json(response);
  } catch (error) {
    logger.error({ err: error }, 'Error creating limit order');
    
    if ((error as Error).message.includes('invalid')) {
      return res.status(400).json({
        success: false,
        error: (error as Error).message
      } as ApiResponse);
    }
    
    res.status(500).json({
      success: false,
      error: (error as Error).message || 'Failed to create limit order'
    } as ApiResponse);
  }
});

export { router as positionRoutes }; 