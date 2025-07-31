import { Router } from "express";
import { CdpService } from "../services/cdpService";

const router = Router();
const cdpService = CdpService.getInstance();

router.get("/:accountName", async (req, res, next) => {
  try {
    const { accountName } = req.params;

    const result = await cdpService.getBalances(accountName);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

export { router as balanceRoutes };
