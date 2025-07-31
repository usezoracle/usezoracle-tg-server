import { Router } from "express";
import { CdpService } from "../services/cdpService";
import { validateAccountName } from "../middleware/validation";

const router = Router();
const cdpService = CdpService.getInstance();

router.post("/", validateAccountName, async (req, res, next) => {
  try {
    const { name } = req.body;
    const result = await cdpService.createAccount(name);
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

router.get("/:name", async (req, res, next) => {
  try {
    const { name } = req.params;
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
