import { Router } from "express";
import { SwapService } from "../services/swapService.js";
import {
  validateSwapPrice,
  validateSwapExecution,
} from "../middleware/validation.js";

const router = Router();
const swapService = SwapService.getInstance();

/**
 * @route GET /api/swaps/tokens/:network
 * @description Get list of common token addresses for a specific network
 */
router.get("/tokens/:network", (req, res, next) => {
  try {
    const { network } = req.params;
    if (!["base", "base-sepolia", "ethereum"].includes(network)) {
      return res.status(400).json({
        success: false,
        error:
          "Invalid network. Supported networks: base, base-sepolia, ethereum",
      });
    }

    const tokens = swapService.getCommonTokens(
      network as "base" | "base-sepolia" | "ethereum"
    );
    res.json({
      success: true,
      data: tokens,
      message: `Token addresses for ${network} network`,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route GET /api/swaps/price
 * @description Get price estimate for a swap
 */
router.get("/price", validateSwapPrice, async (req, res, next) => {
  try {
    const { accountName, fromToken, toToken, fromAmount, network } =
      req.query as any;

    const result = await swapService.getSwapPrice({
      accountName,
      fromToken,
      toToken,
      fromAmount,
      network: network || "base",
    });

    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message
    });
  }
});

/**
 * @route POST /api/swaps/execute
 * @description Execute a swap between tokens
 * @note Automatically handles token allowance checking and approval for ERC20 tokens
 * @note Supports ERC20 to ERC20, ETH to ERC20, and ERC20 to ETH swaps
 */
router.post("/execute", validateSwapExecution, async (req, res, next) => {
  try {
    const {
      accountName,
      fromToken,
      toToken,
      fromAmount,
      slippageBps,
      network,
    } = req.body;

    const result = await swapService.executeSwap({
      accountName,
      fromToken,
      toToken,
      fromAmount,
      slippageBps,
      network: network || "base",
    });

    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message
    });
  }
});

/**
 * @route POST /api/swaps/approve
 * @description Manually approve tokens for the Permit2 contract
 */
router.post("/approve", async (req, res, next) => {
  try {
    const {
      accountName,
      tokenAddress,
      amount,
      network,
    } = req.body;

    if (!accountName || !tokenAddress || !amount) {
      return res.status(400).json({
        success: false,
        error: "Missing required parameters: accountName, tokenAddress, amount"
      });
    }

    const result = await swapService.approveTokens(
      accountName,
      tokenAddress,
      amount,
      network || "base"
    );

    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message
    });
  }
});

/**
 * @route GET /api/swaps/allowance
 * @description Check current token allowance for an account
 */
router.get("/allowance", async (req, res, next) => {
  try {
    const {
      accountName,
      tokenAddress,
      network,
    } = req.query as any;

    if (!accountName || !tokenAddress) {
      return res.status(400).json({
        success: false,
        error: "Missing required parameters: accountName, tokenAddress"
      });
    }

    const result = await swapService.checkTokenAllowance(
      accountName,
      tokenAddress,
      network || "base"
    );

    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message
    });
  }
});

/**
 * @route POST /api/swaps/validate
 * @description Validate account and balance before swap operations
 */
router.post("/validate", async (req, res, next) => {
  try {
    const {
      accountName,
      fromToken,
      fromAmount,
      network,
    } = req.body;

    if (!accountName || !fromToken || !fromAmount) {
      return res.status(400).json({
        success: false,
        error: "Missing required parameters: accountName, fromToken, fromAmount"
      });
    }

    const result = await swapService.validateSwapPrerequisites(
      accountName,
      fromToken,
      fromAmount,
      network || "base"
    );

    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message
    });
  }
});

/**
 * @route POST /api/swaps/fund
 * @description Fund an account with ETH for gas fees
 */
router.post("/fund", async (req, res, next) => {
  try {
    const {
      accountName,
      amount,
      network,
    } = req.body;

    if (!accountName || !amount) {
      return res.status(400).json({
        success: false,
        error: "Missing required parameters: accountName, amount"
      });
    }

    const result = await swapService.fundAccountWithEth(
      accountName,
      amount,
      network || "base"
    );

    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message
    });
  }
});

/**
 * @route GET /api/swaps/balance
 * @description Check account ETH balance
 */
router.get("/balance", async (req, res, next) => {
  try {
    const {
      accountName,
      network,
    } = req.query as any;

    if (!accountName) {
      return res.status(400).json({
        success: false,
        error: "Missing required parameter: accountName"
      });
    }

    const result = await swapService.checkAccountEthBalance(
      accountName,
      network || "base"
    );

    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message
    });
  }
});

/**
 * @route GET /api/swaps/max-amount
 * @description Get maximum available amount for a token
 */
router.get("/max-amount", async (req, res, next) => {
  try {
    const {
      accountName,
      tokenAddress,
      network,
    } = req.query as any;

    if (!accountName || !tokenAddress) {
      return res.status(400).json({
        success: false,
        error: "Missing required parameters: accountName, tokenAddress"
      });
    }

    const result = await swapService.getMaxAvailableAmount(
      accountName,
      tokenAddress,
      network || "base"
    );

    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message
    });
  }
});

/**
 * @route GET /api/swaps/check-approval-support
 * @description Check if a token supports standard ERC20 approval
 */
router.get("/check-approval-support", async (req, res, next) => {
  try {
    const {
      tokenAddress,
      network,
    } = req.query as any;

    if (!tokenAddress) {
      return res.status(400).json({
        success: false,
        error: "Missing required parameter: tokenAddress"
      });
    }

    const result = await swapService.checkTokenApprovalSupport(
      tokenAddress,
      network || "base"
    );

    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message
    });
  }
});

export { router as swapRoutes };
