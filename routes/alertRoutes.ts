import { Router, Request, Response } from 'express';
import { z } from 'zod';

import { AlertsService } from '../services/alertsService.js';
import { ApiResponse, AlertResponse } from '../types/index.js';
import { validateParams, validateQuery, validateBody, alertIdParamSchema, priceAlertBodySchema, portfolioAlertBodySchema, tradeAlertBodySchema, marketAlertBodySchema, setupCopyTradingBodySchema, copyTradingStatusQuerySchema } from '../middleware/requestValidation.js';
import { logger } from '../lib/logger.js';

const router = Router();
let alertsService: AlertsService | null = null;

// Lazy initialization of alerts service
function getAlertsService(): AlertsService {
  if (!alertsService) {
    alertsService = new AlertsService();
  }
  return alertsService;
}

/**
 * @swagger
 * /api/alerts:
 *   get:
 *     summary: Get all alerts with filtering options
 *     description: Retrieve all alerts (price, portfolio, trade, market, copy trading) with optional filtering
 *     tags:
 *       - Alerts
 *     parameters:
 *       - in: query
 *         name: accountName
 *         schema:
 *           type: string
 *         description: Filter alerts by account name
 *       - in: query
 *         name: alertType
 *         schema:
 *           type: string
 *           enum: [price, portfolio, trade, market, copy]
 *         description: Filter alerts by type
 *     responses:
 *       200:
 *         description: Alerts retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/AlertResponse"
 *       500:
 *         description: Internal server error
 */
const alertsQuerySchema = z.object({
  accountName: z.string().optional(),
  alertType: z.enum(['price','portfolio','trade','market','copy']).optional()
});

router.get('/', validateQuery(alertsQuerySchema), async (req: Request, res: Response) => {
  try {
    const { accountName, alertType } = req.query;
    
    const alerts = await getAlertsService().getAlerts(
      accountName as string,
      alertType as 'price' | 'portfolio' | 'trade' | 'market' | 'copy'
    );
    
    const response: ApiResponse<AlertResponse> = {
      success: true,
      data: alerts,
      message: `Successfully retrieved alerts (${alerts.summary.activeAlerts} active)`
    };

    res.json(response);
  } catch (error) {
    logger.error({ err: error }, 'Error getting alerts');
    res.status(500).json({
      success: false,
      error: (error as Error).message || 'Failed to get alerts'
    } as ApiResponse);
  }
});

/**
 * @swagger
 * /api/alerts/price:
 *   post:
 *     summary: Create a price alert
 *     description: Create an alert that triggers when a token reaches a certain price
 *     tags:
 *       - Alerts
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - accountName
 *               - tokenAddress
 *               - targetPrice
 *               - condition
 *             properties:
 *               accountName:
 *                 type: string
 *                 description: The account name
 *               tokenAddress:
 *                 type: string
 *                 description: The token contract address
 *               targetPrice:
 *                 type: string
 *                 description: The target price to trigger the alert
 *               condition:
 *                 type: string
 *                 enum: [above, below]
 *                 description: Whether to trigger above or below the target price
 *     responses:
 *       200:
 *         description: Price alert created successfully
 *       400:
 *         description: Bad request
 *       500:
 *         description: Internal server error
 */
router.post('/price', validateBody(priceAlertBodySchema), async (req: Request, res: Response) => {
  try {
    const { accountName, tokenAddress, targetPrice, condition } = req.body;
    
    const alert = await getAlertsService().createPriceAlert(
      accountName,
      tokenAddress,
      targetPrice,
      condition
    );
    
    const response: ApiResponse = {
      success: true,
      data: alert,
      message: `Price alert created for ${alert.tokenSymbol} ${condition} ${targetPrice}`
    };

    res.json(response);
  } catch (error) {
    logger.error({ err: error }, 'Error creating price alert');
    res.status(500).json({
      success: false,
      error: (error as Error).message || 'Failed to create price alert'
    } as ApiResponse);
  }
});

/**
 * @swagger
 * /api/alerts/portfolio:
 *   post:
 *     summary: Create a portfolio alert
 *     description: Create an alert that triggers when portfolio value changes significantly
 *     tags:
 *       - Alerts
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - accountName
 *               - alertType
 *               - threshold
 *               - condition
 *             properties:
 *               accountName:
 *                 type: string
 *                 description: The account name
 *               alertType:
 *                 type: string
 *                 enum: [value_increase, value_decrease, pnl_threshold]
 *                 description: Type of portfolio alert
 *               threshold:
 *                 type: string
 *                 description: The threshold value to trigger the alert
 *               condition:
 *                 type: string
 *                 enum: [above, below]
 *                 description: Whether to trigger above or below the threshold
 *     responses:
 *       200:
 *         description: Portfolio alert created successfully
 *       400:
 *         description: Bad request
 *       500:
 *         description: Internal server error
 */
router.post('/portfolio', validateBody(portfolioAlertBodySchema), async (req: Request, res: Response) => {
  try {
    const { accountName, alertType, threshold, condition } = req.body;
    
    const alert = await getAlertsService().createPortfolioAlert(
      accountName,
      alertType,
      threshold,
      condition
    );
    
    const response: ApiResponse = {
      success: true,
      data: alert,
      message: `Portfolio alert created: ${alertType} ${condition} ${threshold}`
    };

    res.json(response);
  } catch (error) {
    logger.error({ err: error }, 'Error creating portfolio alert');
    res.status(500).json({
      success: false,
      error: (error as Error).message || 'Failed to create portfolio alert'
    } as ApiResponse);
  }
});

/**
 * @swagger
 * /api/alerts/trade:
 *   post:
 *     summary: Create a trade alert
 *     description: Create an alert for trade-related events
 *     tags:
 *       - Alerts
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - accountName
 *               - alertType
 *             properties:
 *               accountName:
 *                 type: string
 *                 description: The account name
 *               alertType:
 *                 type: string
 *                 enum: [successful_trade, failed_transaction, large_trade]
 *                 description: Type of trade alert
 *               tokenAddress:
 *                 type: string
 *                 description: The token contract address (optional)
 *               amount:
 *                 type: string
 *                 description: The trade amount (optional)
 *     responses:
 *       200:
 *         description: Trade alert created successfully
 *       400:
 *         description: Bad request
 *       500:
 *         description: Internal server error
 */
router.post('/trade', validateBody(tradeAlertBodySchema), async (req: Request, res: Response) => {
  try {
    const { accountName, alertType, tokenAddress, amount } = req.body;
    
    const alert = await getAlertsService().createTradeAlert(
      accountName,
      alertType,
      tokenAddress,
      amount
    );
    
    const response: ApiResponse = {
      success: true,
      data: alert,
      message: `Trade alert created: ${alertType} for ${accountName}`
    };

    res.json(response);
  } catch (error) {
    logger.error({ err: error }, 'Error creating trade alert');
    res.status(500).json({
      success: false,
      error: (error as Error).message || 'Failed to create trade alert'
    } as ApiResponse);
  }
});

/**
 * @swagger
 * /api/alerts/market:
 *   post:
 *     summary: Create a market alert
 *     description: Create an alert for market-related events
 *     tags:
 *       - Alerts
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - alertType
 *               - threshold
 *               - condition
 *             properties:
 *               alertType:
 *                 type: string
 *                 enum: [price_spike, volume_surge, market_opportunity]
 *                 description: Type of market alert
 *               threshold:
 *                 type: string
 *                 description: The threshold value to trigger the alert
 *               condition:
 *                 type: string
 *                 enum: [above, below]
 *                 description: Whether to trigger above or below the threshold
 *               tokenAddress:
 *                 type: string
 *                 description: The token contract address (optional)
 *     responses:
 *       200:
 *         description: Market alert created successfully
 *       400:
 *         description: Bad request
 *       500:
 *         description: Internal server error
 */
router.post('/market', validateBody(marketAlertBodySchema), async (req: Request, res: Response) => {
  try {
    const { alertType, threshold, condition, tokenAddress } = req.body;
    
    const alert = await getAlertsService().createMarketAlert(
      alertType,
      threshold,
      condition,
      tokenAddress
    );
    
    const response: ApiResponse = {
      success: true,
      data: alert,
      message: `Market alert created: ${alertType} ${condition} ${threshold}`
    };

    res.json(response);
  } catch (error) {
    logger.error({ err: error }, 'Error creating market alert');
    res.status(500).json({
      success: false,
      error: (error as Error).message || 'Failed to create market alert'
    } as ApiResponse);
  }
});

/**
 * @swagger
 * /api/alerts/copy-trading:
 *   post:
 *     summary: Monitor wallet for copy trading (DEPRECATED)
 *     description: This endpoint is deprecated. Copy trading alerts are now created automatically when copy trades are executed or when target wallets make trades. Use the copy trading service endpoints instead.
 *     tags:
 *       - Alerts
 *     responses:
 *       410:
 *         description: This endpoint is deprecated. Copy trading alerts are created automatically.
 */
router.post('/copy-trading', async (req: Request, res: Response) => {
  res.status(410).json({
    success: false,
    error: 'This endpoint is deprecated. Copy trading alerts are now created automatically when copy trades are executed or when target wallets make trades. Use the copy trading service endpoints instead.',
    message: 'Copy trading alerts are created automatically by the copy trading service when trades are detected.'
  } as ApiResponse);
});

/**
 * @swagger
 * /api/alerts/setup-copy-trading:
 *   post:
 *     summary: Setup copy trading configuration
 *     description: Create a copy trading configuration that will automatically create alerts when the target wallet makes trades
 *     tags:
 *       - Alerts
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - accountName
 *               - targetWalletAddress
 *               - delegationAmount
 *             properties:
 *               accountName:
 *                 type: string
 *                 description: The account name that will copy trade
 *               targetWalletAddress:
 *                 type: string
 *                 description: The wallet address to monitor and copy
 *               delegationAmount:
 *                 type: string
 *                 description: The maximum amount of ETH to use for copy trading
 *               maxSlippage:
 *                 type: number
 *                 description: Maximum slippage tolerance (default 0.05 = 5%)
 *     responses:
 *       200:
 *         description: Copy trading configuration created successfully
 *       400:
 *         description: Bad request
 *       500:
 *         description: Internal server error
 */
router.post('/setup-copy-trading', validateBody(setupCopyTradingBodySchema), async (req: Request, res: Response) => {
  try {
    const { accountName, targetWalletAddress, delegationAmount, maxSlippage = 0.05 } = req.body;
    
    // Import and use the copy trading service
    const { CopyTradingService } = await import('../services/copyTradingService.js');
    const copyTradingService = CopyTradingService.getInstance();
    
    const config = await copyTradingService.createCopyTradeConfig(
      accountName,
      targetWalletAddress,
      delegationAmount,
      maxSlippage
    );
    
    const response: ApiResponse = {
      success: true,
      data: config,
      message: `Copy trading configuration created for ${accountName} monitoring ${targetWalletAddress}`
    };

    res.json(response);
  } catch (error) {
    logger.error({ err: error }, 'Error setting up copy trading');
    res.status(500).json({
      success: false,
      error: (error as Error).message || 'Failed to setup copy trading'
    } as ApiResponse);
  }
});

/**
 * @swagger
 * /api/alerts/copy-trading/status:
 *   get:
 *     summary: Get copy trading status
 *     description: Get the status of copy trading configurations and recent events
 *     tags:
 *       - Alerts
 *     parameters:
 *       - in: query
 *         name: accountName
 *         schema:
 *           type: string
 *         description: Filter by account name
 *     responses:
 *       200:
 *         description: Copy trading status retrieved successfully
 *       500:
 *         description: Internal server error
 */
router.get('/copy-trading/status', validateQuery(copyTradingStatusQuerySchema), async (req: Request, res: Response) => {
  try {
    const { accountName } = req.query;
    
    // Import and use the copy trading service
    const { CopyTradingService } = await import('../services/copyTradingService.js');
    const copyTradingService = CopyTradingService.getInstance();
    
    const configs = await copyTradingService.getCopyTradeConfigs(accountName as string);
    const events = await copyTradingService.getCopyTradeEvents(accountName as string);
    
    const response: ApiResponse = {
      success: true,
      data: {
        configs,
        events,
        summary: {
          totalConfigs: configs.length,
          activeConfigs: configs.filter(c => c.isActive).length,
          totalEvents: events.length,
          successfulTrades: events.filter(e => e.status === 'success').length,
          totalSpent: configs.reduce((sum, c) => sum + parseFloat(c.totalSpent), 0).toFixed(6)
        }
      },
      message: `Copy trading status for ${accountName}: ${configs.filter(c => c.isActive).length} active configs, ${events.filter(e => e.status === 'success').length} successful trades`
    };

    res.json(response);
  } catch (error) {
    logger.error({ err: error }, 'Error getting copy trading status');
    res.status(500).json({
      success: false,
      error: (error as Error).message || 'Failed to get copy trading status'
    } as ApiResponse);
  }
});

/**
 * @swagger
 * /api/alerts/copy-trading/stop:
 *   post:
 *     summary: Stop copy trading configuration
 *     description: Deactivate a copy trading configuration
 *     tags:
 *       - Alerts
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - configId
 *             properties:
 *               configId:
 *                 type: string
 *                 description: The configuration ID to stop
 *     responses:
 *       200:
 *         description: Copy trading configuration stopped successfully
 *       400:
 *         description: Bad request
 *       500:
 *         description: Internal server error
 */
router.post('/copy-trading/stop', async (req: Request, res: Response) => {
  try {
    const { configId } = req.body;
    
    if (!configId) {
      return res.status(400).json({
        success: false,
        error: 'configId is required'
      } as ApiResponse);
    }
    
    // Import and use the copy trading service
    const { CopyTradingService } = await import('../services/copyTradingService.js');
    const copyTradingService = CopyTradingService.getInstance();
    
    const updatedConfig = await copyTradingService.updateCopyTradeConfig(configId, {
      isActive: false
    });
    
    const response: ApiResponse = {
      success: true,
      data: updatedConfig,
      message: `Copy trading configuration ${configId} stopped successfully`
    };

    res.json(response);
  } catch (error) {
    logger.error({ err: error }, 'Error stopping copy trading');
    res.status(500).json({
      success: false,
      error: (error as Error).message || 'Failed to stop copy trading'
    } as ApiResponse);
  }
});

/**
 * @swagger
 * /api/alerts/{alertId}:
 *   delete:
 *     summary: Delete an alert
 *     description: Delete a specific alert by ID
 *     tags:
 *       - Alerts
 *     parameters:
 *       - in: path
 *         name: alertId
 *         required: true
 *         schema:
 *           type: string
 *         description: The alert ID to delete
 *     responses:
 *       200:
 *         description: Alert deleted successfully
 *       404:
 *         description: Alert not found
 *       500:
 *         description: Internal server error
 */
router.delete('/:alertId', validateParams(alertIdParamSchema), async (req: Request, res: Response) => {
  try {
  const alertId = req.params.alertId as string;
    
    const deleted = await getAlertsService().deleteAlert(alertId);
    
    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: 'Alert not found'
      } as ApiResponse);
    }
    
    const response: ApiResponse = {
      success: true,
      message: `Alert ${alertId} deleted successfully`
    };

    res.json(response);
  } catch (error) {
    logger.error({ err: error }, 'Error deleting alert');
    res.status(500).json({
      success: false,
      error: (error as Error).message || 'Failed to delete alert'
    } as ApiResponse);
  }
});

/**
 * @swagger
 * /api/alerts/check:
 *   post:
 *     summary: Check and trigger alerts
 *     description: Manually check and trigger all active alerts
 *     tags:
 *       - Alerts
 *     responses:
 *       200:
 *         description: Alerts checked successfully
 *       500:
 *         description: Internal server error
 */
router.post('/check', async (req: Request, res: Response) => {
  try {
    const priceAlerts = await getAlertsService().checkPriceAlerts();
    const portfolioAlerts = await getAlertsService().checkPortfolioAlerts();
    
    const totalTriggered = priceAlerts.length + portfolioAlerts.length;
    
    const response: ApiResponse = {
      success: true,
      data: {
        priceAlerts,
        portfolioAlerts,
        totalTriggered
      },
      message: `Checked alerts: ${totalTriggered} triggered`
    };

    res.json(response);
  } catch (error) {
    logger.error({ err: error }, 'Error checking alerts');
    res.status(500).json({
      success: false,
      error: (error as Error).message || 'Failed to check alerts'
    } as ApiResponse);
  }
});

export { router as alertRoutes }; 