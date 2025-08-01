/**
 * Mock Swap Routes - Example routes using the mock swap service
 * This file demonstrates how to integrate the mock swap service into Express routes
 */

import express from 'express';
import { MockSwapService } from '../services/mockSwapService.js';

const router = express.Router();
const swapService = MockSwapService.getInstance();

/**
 * Get common token addresses for a specific network
 * GET /api/mock-swaps/tokens/:network
 */
router.get('/tokens/:network', (req, res) => {
  try {
    const { network } = req.params;
    const tokens = swapService.getCommonTokens(network);
    
    if (!Object.keys(tokens).length) {
      return res.status(404).json({
        success: false,
        error: `Network ${network} not found or not supported`,
        message: `Supported networks include: base, ethereum, base-sepolia`
      });
    }
    
    return res.status(200).json({
      success: true,
      data: { tokens },
      message: `Common tokens for ${network} retrieved successfully`
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message,
      message: 'Failed to retrieve token list'
    });
  }
});

/**
 * Get swap price estimation with 5% fee calculation
 * GET /api/mock-swaps/price?accountName=&fromToken=&toToken=&fromAmount=&network=
 */
router.get('/price', async (req, res) => {
  try {
    const { accountName, fromToken, toToken, fromAmount, network } = req.query;
    
    // Simple validation
    if (!accountName || !fromToken || !toToken || !fromAmount || !network) {
      return res.status(400).json({
        success: false,
        error: "Missing required parameters",
        message: "accountName, fromToken, toToken, fromAmount, and network are required"
      });
    }
    
    // Get price estimation with fee calculation
    const priceResult = await swapService.getSwapPrice({
      accountName,
      fromToken,
      toToken,
      fromAmount,
      network
    });
    
    return res.status(priceResult.success ? 200 : 400).json(priceResult);
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message,
      message: 'Failed to get swap price'
    });
  }
});

/**
 * Execute swap with 5% fee
 * POST /api/mock-swaps/execute
 * Body: { accountName, fromToken, toToken, fromAmount, slippageBps, network }
 */
router.post('/execute', async (req, res) => {
  try {
    const { accountName, fromToken, toToken, fromAmount, slippageBps, network } = req.body;
    
    // Simple validation
    if (!accountName || !fromToken || !toToken || !fromAmount || !network) {
      return res.status(400).json({
        success: false,
        error: "Missing required parameters",
        message: "accountName, fromToken, toToken, fromAmount, and network are required"
      });
    }
    
    // Execute swap with fee calculation
    const swapResult = await swapService.executeSwap({
      accountName,
      fromToken,
      toToken,
      fromAmount,
      slippageBps: slippageBps || 100, // Default 1% slippage
      network
    });
    
    return res.status(swapResult.success ? 200 : 400).json(swapResult);
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message,
      message: 'Failed to execute swap'
    });
  }
});

export const mockSwapRoutes = router;