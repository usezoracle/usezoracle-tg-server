import { Router } from "express";
import { CdpService } from "../services/cdpService.js";

const router = Router();
const cdpService = CdpService.getInstance();

/**
 * @route GET /api/tokens/{contractAddress}
 * @description Get token information by contract address
 */
router.get("/:contractAddress", async (req, res, next) => {
  try {
    const { contractAddress } = req.params;
    const { network = "base" } = req.query as { network?: string };

    // Validate network
    if (!["base", "base-sepolia", "ethereum"].includes(network)) {
      return res.status(400).json({
        success: false,
        error: "Invalid network. Supported networks: base, base-sepolia, ethereum"
      });
    }

    // Validate contract address format
    const tokenAddressRegex = /^0x[a-fA-F0-9]{40}$/;
    if (!tokenAddressRegex.test(contractAddress)) {
      return res.status(400).json({
        success: false,
        error: "Invalid contract address format"
      });
    }

    const result = await cdpService.getTokenInfo(contractAddress as `0x${string}`, network as "base" | "base-sepolia" | "ethereum");
    res.json(result);
  } catch (error) {
    next(error);
  }
});

export { router as tokenRoutes }; 