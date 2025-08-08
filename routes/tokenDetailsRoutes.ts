import { Router } from "express";

import { TokenDetailsService } from "../services/tokenDetailsService.js";
import { burstLimiter } from "../middleware/rateLimit.js";
import { logger } from '../lib/logger.js';
import { validateParams, validateQuery, addressParamSchema, includeQuerySchema } from '../middleware/requestValidation.js';

const router = Router();
const tokenDetailsService = TokenDetailsService.getInstance();

/**
 * @route GET /api/tokens/{address}
 * @description Get specific token details on Base network using GeckoTerminal API
 * @param {string} address - Token contract address
 * @param {string} include - Optional: Attributes for related resources to include (e.g., 'top_pools')
 */
router.get("/tokens/:address", burstLimiter, validateParams(addressParamSchema), validateQuery(includeQuerySchema), async (req, res, next) => {
  try {
    const address = req.params.address as string;
    const include = (req.query.include as string | undefined) ?? undefined;

    logger.info({ network: 'base', address, include: include || 'none' }, 'Token details request');

    const result = await tokenDetailsService.getTokenDetails({
      network: 'base',
      address,
      include
    });

    res.json(result);
  } catch (error) {
    logger.error({ err: error }, 'Error in token details route');
    next(error);
  }
});

/**
 * @route GET /api/tokens/{address}/with-pools
 * @description Get token details with top pools included on Base network
 * @param {string} address - Token contract address
 */
router.get("/tokens/:address/with-pools", burstLimiter, validateParams(addressParamSchema), async (req, res, next) => {
  try {
    const address = req.params.address as string;

    logger.info({ network: 'base', address }, 'Token details with pools request');

    const result = await tokenDetailsService.getTokenDetailsWithPools({
      network: 'base',
      address
    });

    res.json(result);
  } catch (error) {
    logger.error({ err: error }, 'Error in token details with pools route');
    next(error);
  }
});

export { router as tokenDetailsRoutes }; 