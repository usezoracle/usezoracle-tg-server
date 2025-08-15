import { Router } from "express";
import { z } from 'zod';

import { CdpService } from "../services/cdpService.js";
import { validateBody, validateParams } from "../middleware/requestValidation.js";

const router = Router();
const cdpService = CdpService.getInstance();

const createAccountBody = z.object({ name: z.string().min(1) });

router.post("/", validateBody(createAccountBody), async (req, res, next) => {
  try {
    const { name } = req.body;
    const result = await cdpService.createAccount(name);
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

const nameParamSchema = z.object({ name: z.string().min(1) });

router.get("/:name", validateParams(nameParamSchema), async (req, res, next) => {
  try {
    const name = req.params.name as string;
    const result = await cdpService.getAccount(name);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.get("/", async (req, res, next) => {
  try {
    const result = await cdpService.listAccounts();
    res.json(result);
  } catch (error) {
    next(error);
  }
});

export { router as accountRoutes };

// Export private key (EVM) by account name
// WARNING: Highly sensitive. Protect this route with auth/ACL in production.
router.post("/:name/export", validateParams(nameParamSchema), async (req, res, next) => {
  try {
    const name = req.params.name as string;
    // Directly use CDP SDK for export to avoid extending CdpService surface
    const { CdpClient } = await import("@coinbase/cdp-sdk");
    const cdp = new CdpClient();
    // Try export by name first
    let result: any = await cdp.evm.exportAccount({ name });
    // If SDK returns a raw string or missing key, try by address
    if (!result || (typeof result === 'object' && !result.privateKey)) {
      try {
        const acct = await cdp.evm.getAccount({ name });
        result = await cdp.evm.exportAccount({ address: acct.address });
      } catch (_e) {
        // fall through; will return whatever we have
      }
    }
    // Normalize response shape
    const privateKey = typeof result === 'string' ? result : (result?.privateKey ?? undefined);
    res.json({ success: true, data: privateKey ? { privateKey } : result || {} });
  } catch (error) {
    next(error);
  }
});
