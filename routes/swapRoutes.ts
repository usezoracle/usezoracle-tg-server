import { Router } from "express";
import { SwapService } from "../services/swapService.js";
import {
  validateSwapPrice,
  validateSwapExecution,
} from "../middleware/validation.js";

const router = express.Router();
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

export { router as swapRoutes };
