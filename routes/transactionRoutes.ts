import { Router } from "express";

import { CdpService } from "../services/cdpService.js";
import { validateBody } from "../middleware/requestValidation.js";
import { transferBodySchema } from "../middleware/requestValidation.js";

const router = Router();
const cdpService = CdpService.getInstance();

router.post("/transfer", validateBody(transferBodySchema), async (req, res, next) => {
  try {
    const { accountName, to, amount, token, network } = req.body;
    const result = await cdpService.transfer(accountName, {
      to,
      amount,
      token,
      network,
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

export { router as transactionRoutes };
