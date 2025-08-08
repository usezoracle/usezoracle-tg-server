import { Router } from "express";

import { SwapService, EvmSwapsNetwork } from "../services/swapService.js";
import { sensitiveLimiter, burstLimiter } from "../middleware/rateLimit.js";
import { validateParams, validateQuery, networkParamSchema, allowanceQuerySchema, swapPriceQuerySchema } from "../middleware/requestValidation.js";
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
router.get("/tokens/:network", validateParams(networkParamSchema), (req, res, _next) => {
  try {
    const network = req.params.network as "base" | "base-sepolia" | "ethereum";
    if (!["base", "base-sepolia", "ethereum"].includes(network)) {
      return res.status(400).json({
        success: false,
        error:
          "Invalid network. Supported networks: base, base-sepolia, ethereum",
      });
    }

    const tokens = swapService.getCommonTokens(
      network as EvmSwapsNetwork | "base-sepolia"
    );
    res.json({
      success: true,
      data: tokens,
      message: `Token addresses for ${network} network`,
    });
  } catch (error) {
    _next(error);
  }
});

/**
 * @route GET /api/swaps/price
 * @description Get price estimate for a swap
 */
router.get("/price", burstLimiter, validateQuery(swapPriceQuerySchema), validateSwapPrice, async (req, res, _next) => {
  try {
    const { accountName, fromToken, toToken, fromAmount, network } =
      req.query as { accountName?: string; fromToken?: string; toToken?: string; fromAmount?: string; network?: string };

    const result = await swapService.getSwapPrice({
      accountName: accountName as string,
      fromToken: fromToken as string,
      toToken: toToken as string,
      fromAmount: fromAmount as string,
      network: ((network || "base") as EvmSwapsNetwork),
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
router.post("/execute", sensitiveLimiter, validateSwapExecution, async (req, res, _next) => {
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
      accountName: accountName as string,
      fromToken: fromToken as string,
      toToken: toToken as string,
      fromAmount: fromAmount as string,
      slippageBps: slippageBps as number,
      network: ((network || "base") as EvmSwapsNetwork),
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
router.post("/approve", sensitiveLimiter, async (req, res, _next) => {
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
      accountName as string,
      tokenAddress as string,
      amount as string,
      ((network || "base") as EvmSwapsNetwork)
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
router.get("/allowance", validateQuery(allowanceQuerySchema), async (req, res, _next) => {
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
      accountName as string,
      tokenAddress as string,
      ((network || "base") as EvmSwapsNetwork)
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
router.post("/validate", async (req, res, _next) => {
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
      accountName as string,
      fromToken as string,
      fromAmount as string,
      ((network || "base") as EvmSwapsNetwork)
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
router.post("/fund", async (req, res, _next) => {
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
      accountName as string,
      amount as string,
      ((network || "base") as EvmSwapsNetwork)
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
router.get("/balance", async (req, res, _next) => {
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
      accountName as string,
      ((network || "base") as EvmSwapsNetwork)
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
router.get("/max-amount", async (req, res, _next) => {
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
      accountName as string,
      tokenAddress as string,
      ((network || "base") as EvmSwapsNetwork)
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
router.get("/check-approval-support", async (req, res, _next) => {
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
      tokenAddress as string,
      ((network || "base") as EvmSwapsNetwork)
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
