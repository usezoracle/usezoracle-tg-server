import { Router } from "express";

import { CdpService } from "../services/cdpService.js";
import { validateParams, accountNameParamSchema } from "../middleware/requestValidation.js";
import { logger } from '../lib/logger.js';

const router = Router();
const cdpService = CdpService.getInstance();

router.get("/:accountName", validateParams(accountNameParamSchema), async (req, res, next) => {
  try {
    const accountName = req.params.accountName as string;

    // First check if the account exists
    try {
      await cdpService.getAccount(accountName);
    } catch (accountError) {
      if (accountError instanceof Error && accountError.message.includes("not found")) {
        return res.status(404).json({
          success: false,
          error: "Account not found",
          message: `Account '${accountName}' does not exist. Please create an account first using POST /accounts with body: {"name": "${accountName}"}`,
          suggestion: "Use POST /accounts to create a new account before checking balances"
        });
      }
      throw accountError;
    }

    const result = await cdpService.getBalances(accountName);
    logger.info({ accountName }, 'Balances fetched');
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// Convenience endpoint to create account if it doesn't exist, then get balances
router.post("/:accountName", async (req, res, next) => {
  try {
    const { accountName } = req.params;
    const { createIfNotExists = false } = req.body;

    // Check if account exists
    let accountExists = false;
    try {
      await cdpService.getAccount(accountName);
      accountExists = true;
    } catch (accountError) {
      if (accountError instanceof Error && accountError.message.includes("not found")) {
        accountExists = false;
      } else {
        throw accountError;
      }
    }

    // Create account if it doesn't exist and createIfNotExists is true
    if (!accountExists) {
      if (createIfNotExists) {
        await cdpService.createAccount(accountName);
        res.status(201).json({
          success: true,
          message: `Account '${accountName}' created successfully`,
          accountCreated: true
        });
      } else {
        return res.status(404).json({
          success: false,
          error: "Account not found",
          message: `Account '${accountName}' does not exist. Set createIfNotExists: true in request body to create it automatically.`,
          suggestion: "Use POST /accounts to create a new account, or set createIfNotExists: true"
        });
      }
    } else {
      const result = await cdpService.getBalances(accountName);
      res.json(result);
    }
  } catch (error) {
    next(error);
  }
});

export { router as balanceRoutes };
