import { Router, Request, Response } from 'express';
import { AlertsService } from '../services/alertsService.js';
import { ApiResponse, AlertResponse } from '../types/index.js';

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
router.get('/', async (req: Request, res: Response) => {
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
    console.error('Error getting alerts:', error);
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
router.post('/price', async (req: Request, res: Response) => {
  try {
    const { accountName, tokenAddress, targetPrice, condition } = req.body;
    
    if (!accountName || !tokenAddress || !targetPrice || !condition) {
      return res.status(400).json({
        success: false,
        error: 'accountName, tokenAddress, targetPrice, and condition are required'
      } as ApiResponse);
    }
    
    if (!['above', 'below'].includes(condition)) {
      return res.status(400).json({
        success: false,
        error: 'condition must be "above" or "below"'
      } as ApiResponse);
    }
    
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
    console.error('Error creating price alert:', error);
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
router.post('/portfolio', async (req: Request, res: Response) => {
  try {
    const { accountName, alertType, threshold, condition } = req.body;
    
    if (!accountName || !alertType || !threshold || !condition) {
      return res.status(400).json({
        success: false,
        error: 'accountName, alertType, threshold, and condition are required'
      } as ApiResponse);
    }
    
    if (!['value_increase', 'value_decrease', 'pnl_threshold'].includes(alertType)) {
      return res.status(400).json({
        success: false,
        error: 'alertType must be "value_increase", "value_decrease", or "pnl_threshold"'
      } as ApiResponse);
    }
    
    if (!['above', 'below'].includes(condition)) {
      return res.status(400).json({
        success: false,
        error: 'condition must be "above" or "below"'
      } as ApiResponse);
    }
    
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
    console.error('Error creating portfolio alert:', error);
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
router.post('/trade', async (req: Request, res: Response) => {
  try {
    const { accountName, alertType, tokenAddress, amount } = req.body;
    
    if (!accountName || !alertType) {
      return res.status(400).json({
        success: false,
        error: 'accountName and alertType are required'
      } as ApiResponse);
    }
    
    if (!['successful_trade', 'failed_transaction', 'large_trade'].includes(alertType)) {
      return res.status(400).json({
        success: false,
        error: 'alertType must be "successful_trade", "failed_transaction", or "large_trade"'
      } as ApiResponse);
    }
    
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
    console.error('Error creating trade alert:', error);
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
router.post('/market', async (req: Request, res: Response) => {
  try {
    const { alertType, threshold, condition, tokenAddress } = req.body;
    
    if (!alertType || !threshold || !condition) {
      return res.status(400).json({
        success: false,
        error: 'alertType, threshold, and condition are required'
      } as ApiResponse);
    }
    
    if (!['price_spike', 'volume_surge', 'market_opportunity'].includes(alertType)) {
      return res.status(400).json({
        success: false,
        error: 'alertType must be "price_spike", "volume_surge", or "market_opportunity"'
      } as ApiResponse);
    }
    
    if (!['above', 'below'].includes(condition)) {
      return res.status(400).json({
        success: false,
        error: 'condition must be "above" or "below"'
      } as ApiResponse);
    }
    
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
    console.error('Error creating market alert:', error);
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
 *     summary: Create a copy trading alert
 *     description: Create an alert for copy trading activities
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
 *               - walletAddress
 *             properties:
 *               accountName:
 *                 type: string
 *                 description: The account name
 *               alertType:
 *                 type: string
 *                 enum: [wallet_activity, large_transaction, new_token_purchase]
 *                 description: Type of copy trading alert
 *               walletAddress:
 *                 type: string
 *                 description: The wallet address to monitor
 *               tokenAddress:
 *                 type: string
 *                 description: The token contract address (optional)
 *               amount:
 *                 type: string
 *                 description: The transaction amount (optional)
 *     responses:
 *       200:
 *         description: Copy trading alert created successfully
 *       400:
 *         description: Bad request
 *       500:
 *         description: Internal server error
 */
router.post('/copy-trading', async (req: Request, res: Response) => {
  try {
    const { accountName, alertType, walletAddress, tokenAddress, amount } = req.body;
    
    if (!accountName || !alertType || !walletAddress) {
      return res.status(400).json({
        success: false,
        error: 'accountName, alertType, and walletAddress are required'
      } as ApiResponse);
    }
    
    if (!['wallet_activity', 'large_transaction', 'new_token_purchase'].includes(alertType)) {
      return res.status(400).json({
        success: false,
        error: 'alertType must be "wallet_activity", "large_transaction", or "new_token_purchase"'
      } as ApiResponse);
    }
    
    const alert = await getAlertsService().createCopyTradingAlert(
      accountName,
      alertType,
      walletAddress,
      tokenAddress,
      amount
    );
    
    const response: ApiResponse = {
      success: true,
      data: alert,
      message: `Copy trading alert created: ${alertType} for wallet ${walletAddress}`
    };

    res.json(response);
  } catch (error) {
    console.error('Error creating copy trading alert:', error);
    res.status(500).json({
      success: false,
      error: (error as Error).message || 'Failed to create copy trading alert'
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
router.delete('/:alertId', async (req: Request, res: Response) => {
  try {
    const { alertId } = req.params;
    
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
    console.error('Error deleting alert:', error);
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
    console.error('Error checking alerts:', error);
    res.status(500).json({
      success: false,
      error: (error as Error).message || 'Failed to check alerts'
    } as ApiResponse);
  }
});

export { router as alertRoutes }; 