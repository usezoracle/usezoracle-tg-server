import { Router } from "express";
import { SwapService } from "../services/swapService.js";
import { validateSwapPrice, validateSwapExecution } from "../middleware/validation.js";

const router = Router();
const swapService = SwapService.getInstance();

/**
 * @route GET /api/swaps/tokens/:network
 * @description Get list of common token addresses for a specific network
 * @note All swaps include a 5% fee sent to the fee recipient address
 */
router.get("/tokens/:network", (req, res, next) => {
  try {
    const { network } = req.params;
    
    if (!["base", "base-sepolia", "ethereum"].includes(network)) {
      return res.status(400).json({
        success: false,
        error: "Invalid network. Supported networks: base, base-sepolia, ethereum"
      });
    }
    
    const tokens = swapService.getCommonTokens(network as "base" | "base-sepolia" | "ethereum");
    
    res.json({
      success: true,
      data: tokens,
      message: `Token addresses for ${network} network`
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route GET /api/swaps/price
 * @description Get price estimate for a swap (includes 5% fee calculation)
 */
router.get("/price", validateSwapPrice, async (req, res, next) => {
  try {
    const { accountName, fromToken, toToken, fromAmount, network } = req.query as any;
    
    const result = await swapService.getSwapPrice({
      accountName,
      fromToken,
      toToken,
      fromAmount,
      network: network || "base"
    });
    
    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * @route POST /api/swaps/execute
 * @description Execute a swap between tokens with a 5% fee
 * @note 5% of the output is sent to the fee recipient address: 0x27cEe32550DcC30De5a23551bAF7de2f3b0b98A0
 */
router.post("/execute", validateSwapExecution, async (req, res, next) => {
  try {
    const { accountName, fromToken, toToken, fromAmount, slippageBps, network } = req.body;
    
    const result = await swapService.executeSwap({
      accountName,
      fromToken,
      toToken,
      fromAmount,
      slippageBps,
      network: network || "base"
    });
    
    res.json(result);
  } catch (error) {
    next(error);
  }
});

export { router as swapRoutes };