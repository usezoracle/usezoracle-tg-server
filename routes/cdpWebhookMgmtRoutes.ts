import { Router } from "express";
import { z } from "zod";

import { CdpWebhookService } from "../services/cdpWebhookService.js";

const router = Router();
const svc = CdpWebhookService.getInstance();

const bodySchema = z.object({
  addresses: z.array(z.string().regex(/^0x[a-fA-F0-9]{40}$/)).min(1),
  walletId: z.string().optional().default(""),
});

router.put("/:id/addresses", async (req, res) => {
  try {
    const webhookId = req.params.id;
    const parsed = bodySchema.parse(req.body);
    await svc.updateWalletActivityAddresses({
      webhookId,
      addresses: parsed.addresses,
      walletId: parsed.walletId,
    });
    res.json({ success: true, message: "Webhook addresses updated" });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message || "Invalid request" });
  }
});

router.get("/", async (_req, res) => {
  try {
    const svc = CdpWebhookService.getInstance();
    const webhooks = await svc.listWebhooks();
    res.json({ success: true, data: webhooks });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || "Failed to list webhooks" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const webhookId = req.params.id;
    const webhook = await svc.getWebhookById(webhookId);
    res.json({ success: true, data: webhook });
  } catch (err: any) {
    res.status(404).json({ success: false, error: err.message || "Webhook not found" });
  }
});

export { router as cdpWebhookMgmtRoutes };


