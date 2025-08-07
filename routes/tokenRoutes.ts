import { Router } from "express";
import { CdpService } from "../services/cdpService.js";

const router = Router();
const cdpService = CdpService.getInstance();

router.get("/:contractAddress", async (req, res, next) => {
  try {
    const { contractAddress } = req.params;
    const { network } = req.query as any;

    const result = await cdpService.getTokenInfo(
      contractAddress as `0x${string}`,
      network || "base"
    );
    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * @route GET /api/tokens/test/:contractAddress
 * @description Test token metadata fetching for any token address
 */
router.get("/test/:contractAddress", async (req, res, next) => {
  try {
    const { contractAddress } = req.params;

    const result = await cdpService.testTokenMetadata(
      contractAddress as `0x${string}`
    );
    res.json(result);
  } catch (error) {
    next(error);
  }
});

export { router as tokenRoutes }; 