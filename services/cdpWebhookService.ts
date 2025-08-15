import { logger } from "../lib/logger.js";

export class CdpWebhookService {
  private static instance: CdpWebhookService;
  private isConfigured = false;

  private constructor() {}

  static getInstance(): CdpWebhookService {
    if (!CdpWebhookService.instance) {
      CdpWebhookService.instance = new CdpWebhookService();
    }
    return CdpWebhookService.instance;
  }

  private async configure(): Promise<void> {
    if (this.isConfigured) return;
    
    // Check for required environment variables
    if (!process.env.CDP_API_KEY_ID) {
      throw new Error("CDP_API_KEY_ID environment variable is required");
    }
    if (!process.env.CDP_API_KEY_SECRET) {
      throw new Error("CDP_API_KEY_SECRET environment variable is required");
    }
    
    const sdk = await import("@coinbase/coinbase-sdk");
    const Coinbase = (sdk as any).Coinbase;
    
    // Configure using environment variables instead of JSON file
    Coinbase.configure({
      apiKeyId: process.env.CDP_API_KEY_ID,
      apiKeySecret: process.env.CDP_API_KEY_SECRET,
    });
    
    this.isConfigured = true;
    logger.info("Coinbase SDK configured for webhooks using environment variables");
  }

  async updateWalletActivityAddresses(params: {
    webhookId: string;
    addresses: string[];
    walletId: string; // required by SDK for PUT
  }): Promise<void> {
    await this.configure();
    try {
      const mod = await import("@coinbase/coinbase-sdk");
      const Webhook = (mod as any).Webhook;
      
      // Try to get webhook by ID directly first
      let webhook;
      try {
        webhook = await Webhook.get(params.webhookId);
        logger.info({ webhookId: params.webhookId }, "Successfully got webhook by ID");
      } catch (getErr) {
        // Fallback to listing and finding
        logger.warn({ err: getErr, webhookId: params.webhookId }, "Failed to get webhook by ID, trying list approach");
        const resp = await Webhook.list();
        const webhooks = resp.data || [];
        logger.info({ webhookCount: webhooks.length, webhookIds: webhooks.map((w: any) => w.model?.id || w.id) }, "Available webhooks");
        webhook = webhooks.find((w: any) => (w.model?.id || w.id) === params.webhookId);
        if (webhook) {
          logger.info({ webhookId: params.webhookId }, "Found webhook in list");
        }
      }
      
      if (!webhook) {
        throw new Error(`Webhook not found: ${params.webhookId}`);
      }

      // Handle both direct response and list response formats
      const webhookData = webhook.model || webhook;
      const eventTypeFilter = webhookData.event_type_filter || {};
      const existing: string[] = [ ...(eventTypeFilter.addresses || []) ];

      // Replace with full list per PUT semantics (params.addresses should contain ALL addresses)
      const merged = Array.from(new Set(params.addresses.map(a => a.toLowerCase())));

      logger.info({ 
        webhookId: params.webhookId, 
        existingCount: existing.length, 
        newCount: params.addresses.length, 
        mergedCount: merged.length,
        existing: existing,
        new: params.addresses,
        merged: merged
      }, "Updating webhook addresses");

      await webhook.update({
        eventTypeFilter: {
          addresses: merged,
          walletId: params.walletId || eventTypeFilter.wallet_id || "",
        }
      });

      logger.info({ webhookId: params.webhookId, count: merged.length }, "Webhook addresses updated");
    } catch (err) {
      logger.error({ err }, "Failed to update webhook addresses");
      throw err;
    }
  }

  async listWebhooks(): Promise<any[]> {
    await this.configure();
    try {
      const sdk = await import("@coinbase/coinbase-sdk");
      const Webhook = (sdk as any).Webhook;
      const resp = await Webhook.list();
      const webhooks = resp?.data ?? [];
      logger.info({ count: webhooks.length }, "Fetched CDP webhooks");
      return webhooks;
    } catch (err) {
      logger.error({ err }, "Failed to list CDP webhooks");
      throw err;
    }
  }

  async getWebhookById(webhookId: string): Promise<any> {
    await this.configure();
    try {
      const mod = await import("@coinbase/coinbase-sdk");
      const Webhook = (mod as any).Webhook;
      
      // Try to get webhook by ID directly first
      let webhook;
      try {
        webhook = await Webhook.get(webhookId);
        logger.info({ webhookId }, "Successfully got webhook by ID");
      } catch (getErr) {
        // Fallback to listing and finding
        logger.warn({ err: getErr, webhookId }, "Failed to get webhook by ID, trying list approach");
        const resp = await Webhook.list();
        const webhooks = resp.data || [];
        logger.info({ webhookCount: webhooks.length, webhookIds: webhooks.map((w: any) => w.model?.id || w.id) }, "Available webhooks");
        webhook = webhooks.find((w: any) => (w.model?.id || w.id) === webhookId);
        if (webhook) {
          logger.info({ webhookId }, "Found webhook in list");
        }
      }
      
      if (!webhook) {
        throw new Error(`Webhook not found: ${webhookId}`);
      }

      // Handle both direct response and list response formats
      const webhookData = webhook.model || webhook;
      const eventTypeFilter = webhookData.event_type_filter || {};
      const addresses = eventTypeFilter.addresses || [];

      return {
        id: webhookData.id,
        name: webhookData.name || "Wallet Activity Webhook",
        url: webhookData.notification_uri,
        addresses: addresses,
        addressCount: addresses.length,
        walletId: eventTypeFilter.wallet_id || "",
        eventType: webhookData.event_type,
        networkId: webhookData.network_id,
        status: webhookData.status,
        createdAt: webhookData.created_at,
        updatedAt: webhookData.updated_at
      };
    } catch (err) {
      logger.error({ err, webhookId }, "Failed to get webhook by ID");
      throw err;
    }
  }
}


