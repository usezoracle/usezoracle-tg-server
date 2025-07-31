import { Router } from "express";
import { CdpService } from "../services/cdpService";
import { validateTransfer } from "../middleware/validation";

const router = Router();
const cdpService = CdpService.getInstance();

router.post("/transfer", validateTransfer, async (req, res, next) => {
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
