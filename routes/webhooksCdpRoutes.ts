import { Router } from "express";

import { logger } from "../lib/logger.js";

const router = Router();

// CDP Webhook receiver (wallet_activity and others)
router.post("/", async (req, res) => {
  const body = req.body;

  // Log everything useful for debugging/observability
  try {
    logger.info({
      path: req.path,
      method: req.method,
      headers: {
        "user-agent": req.headers["user-agent"],
        "x-coinbase-signature": req.headers["x-coinbase-signature"],
        "content-type": req.headers["content-type"],
      },
      query: req.query,
      body,
    }, "CDP webhook received");

    // Human-readable activity line for quick scanning
    const et = (body as any)?.eventType;
    if (et === "erc20_transfer") {
      logger.info({
        eventType: et,
        network: (body as any)?.network,
        token: (body as any)?.contractAddress,
        from: (body as any)?.from,
        to: (body as any)?.to,
        value: (body as any)?.value,
        tx: (body as any)?.transactionHash,
        logIndex: (body as any)?.logIndex,
      }, "erc20_transfer activity");
    } else if (et === "transaction") {
      logger.info({
        eventType: et,
        network: (body as any)?.network,
        from: (body as any)?.from,
        to: (body as any)?.to,
        value: (body as any)?.valueString ?? (body as any)?.value,
        tx: (body as any)?.transactionHash,
      }, "native transaction activity");
    }

    // Trigger copy-trade execution on incoming ERC-20 transfers to monitored wallets
    if (et === "erc20_transfer") {
      const to = ((body as any)?.to || "").toLowerCase();
      const tokenAddress = (body as any)?.contractAddress as string | undefined;
      const txHash = (body as any)?.transactionHash as string | undefined;
      if (to && tokenAddress && txHash) {
        try {
          const { CopyTradeConfigModel } = await import("../models/CopyTradeConfig.js");
          const configs = await CopyTradeConfigModel.find({
            isActive: true,
            $or: [
              { targetWalletAddress: to },
              { beneficiaryAddresses: to },
            ],
          }).lean();

          if (configs.length > 0) {
            const { CdpService } = await import("../services/cdpService.js");
            const cdp = CdpService.getInstance();
            // Fetch token metadata for nicer logs/symbols
            let tokenSymbol = "UNKNOWN";
            let tokenName = "Unknown Token";
            try {
              const info = await cdp.getTokenInfo(tokenAddress as `0x${string}`);
              tokenSymbol = info.data.symbol;
              tokenName = info.data.name;
            } catch {}

            const { CopyTradingService } = await import("../services/copyTradingService.js");
            const svc = CopyTradingService.getInstance();

            for (const cfg of configs) {
              try {
                await svc.executeCopyTrade(
                  (cfg as any)._id.toString(),
                  { hash: txHash, value: 0n },
                  tokenAddress,
                  tokenSymbol,
                  tokenName,
                  cfg.delegationAmount // use delegation as original baseline
                );
                logger.info({ configId: (cfg as any)._id.toString(), tokenAddress, txHash }, "Copy trade triggered from webhook");
              } catch (err) {
                logger.warn({ err, configId: (cfg as any)._id.toString(), tokenAddress, txHash }, "Copy trade trigger failed");
              }
            }
          }
        } catch (err) {
          logger.warn({ err }, "Webhook copy-trade processing failed");
        }
      }
    }
  } catch (_e) {
    console.warn("[CDP Webhook] Received:", {
      headers: {
        "user-agent": req.headers["user-agent"],
        "x-coinbase-signature": req.headers["x-coinbase-signature"],
        "content-type": req.headers["content-type"],
      },
      query: req.query,
      body,
    });
  }

  // Respond quickly to avoid retries; processing can be added later
  res.status(200).json({ ok: true, receivedAt: new Date().toISOString() });
});

export { router as webhooksCdpRoutes };


