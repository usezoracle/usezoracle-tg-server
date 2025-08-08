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
