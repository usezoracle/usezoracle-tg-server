import { Router } from "express";

import { CdpService } from "../services/cdpService.js";
import { validateParams, validateQuery } from "../middleware/requestValidation.js";
import { z } from 'zod';
import { logger } from '../lib/logger.js';

const router = Router();
const cdpService = CdpService.getInstance();

const contractParamSchema = z.object({ contractAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/) });
const tokenQuerySchema = z.object({ network: z.enum(["base","base-sepolia","ethereum"]).optional() });

router.get("/:contractAddress", validateParams(contractParamSchema), validateQuery(tokenQuerySchema), async (req, res, next) => {
  try {
    const contractAddress = req.params.contractAddress as `0x${string}`;
    const network = ((req.query.network as "base"|"base-sepolia"|"ethereum"|undefined) ?? "base");

    const result = await cdpService.getTokenInfo(contractAddress, network);
    logger.info({ contractAddress, network }, 'Token info fetched');
    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * @route GET /api/tokens/test/:contractAddress
 * @description Test token metadata fetching for any token address
 */
router.get("/test/:contractAddress", validateParams(contractParamSchema), async (req, res, next) => {
  try {
    const contractAddress = req.params.contractAddress as `0x${string}`;

    const result = await cdpService.testTokenMetadata(contractAddress);
    logger.info({ contractAddress }, 'Test token metadata fetched');
    res.json(result);
  } catch (error) {
    next(error);
  }
});

export { router as tokenRoutes }; 