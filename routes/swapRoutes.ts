import express from 'express';
import { SwapService } from '../services/swapService.js';

const router = express.Router();
const swapService = SwapService.getInstance();

// Get swap price
router.get('/price', async (req, res) => {
  try {
    const { accountName, fromToken, toToken, fromAmount, network } = req.query;
    
    if (!accountName || !fromToken || !toToken || !fromAmount || !network) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: accountName, fromToken, toToken, fromAmount, network'
      });
    }

    const result = await swapService.getSwapPrice({
      accountName: accountName as string,
      fromToken: fromToken as string,
      toToken: toToken as string,
      fromAmount: fromAmount as string,
      network: network as "base" | "ethereum"
    });

    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message
    });
  }
});

// Check token allowance
router.get('/allowance', async (req, res) => {
  try {
    const { accountName, tokenAddress, spenderAddress, network } = req.query;
    
    if (!accountName || !tokenAddress || !spenderAddress || !network) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: accountName, tokenAddress, spenderAddress, network'
      });
    }

    const result = await swapService.checkTokenAllowance({
      accountName: accountName as string,
      tokenAddress: tokenAddress as string,
      spenderAddress: spenderAddress as string,
      network: network as "base" | "ethereum"
    });

    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message
    });
  }
});

// Get approval instructions
router.get('/approval-instructions', async (req, res) => {
  try {
    const { accountName, tokenAddress, amount, network } = req.query;
    
    if (!accountName || !tokenAddress || !amount || !network) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: accountName, tokenAddress, amount, network'
      });
    }

    const result = await swapService.getApprovalInstructions({
      accountName: accountName as string,
      tokenAddress: tokenAddress as string,
      amount: amount as string,
      network: network as "base" | "ethereum"
    });

    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message
    });
  }
});

// Execute swap
router.post('/execute', async (req, res) => {
  try {
    const { accountName, fromToken, toToken, fromAmount, slippageBps, network } = req.body;
    
    if (!accountName || !fromToken || !toToken || !fromAmount || !network) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: accountName, fromToken, toToken, fromAmount, network'
      });
    }

    const result = await swapService.executeSwap({
      accountName,
      fromToken,
      toToken,
      fromAmount,
      slippageBps,
      network: network as "base" | "ethereum"
    });

    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message
    });
  }
});

export default router;