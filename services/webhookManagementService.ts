import { Coinbase, Webhook } from "@coinbase/coinbase-sdk";

import { logger } from '../lib/logger.js';
import { User } from '../models/User.js';

export class WebhookManagementService {
    private static instance: WebhookManagementService;

    private constructor() {
        // Initialize Coinbase configuration
        Coinbase.configure({
            apiKeyName: process.env.COINBASE_API_KEY_NAME || "e28ed30c-d012-4c1e-991a-e361e1ca23ce",
            privateKey: process.env.COINBASE_PRIVATE_KEY || "mfouEAg4pjPFwKKTyoHIai+ovxY+BxTLKXryn94SBKo3pARVcNAnHyKbuHhFhZ1MVciABGwWa8XqPUEZ9BsZCg==",
        });
    }

    static getInstance(): WebhookManagementService {
        if (!WebhookManagementService.instance) {
            WebhookManagementService.instance = new WebhookManagementService();
        }
        return WebhookManagementService.instance;
    }

    /**
     * Fetch all wallet addresses from users_new collection
     */
    async getAllUserWalletAddresses(): Promise<string[]> {
        try {
            const users = await User.find(
                {
                    walletAddress: { $exists: true, $ne: null },
                    isActive: true
                },
                'walletAddress'
            ).lean();

            const addresses = users
                .map(user => user.walletAddress)
                .filter(address => address && address.trim() !== '')
                .map(address => address!.toLowerCase()); // Normalize to lowercase

            logger.info({
                totalUsers: users.length,
                validAddresses: addresses.length
            }, 'Fetched wallet addresses from database');

            return addresses;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger.error({ err: error }, 'Failed to fetch user wallet addresses from database');
            throw new Error(`Failed to fetch user wallet addresses: ${errorMessage}`);
        }
    }

    /**
     * Update webhook addresses to monitor
     * According to CDP docs: Updates use PUT method and require complete address list replacement
     */
    async updateWebhookAddresses(webhookId: string, addresses: string[], walletId?: string) {
        try {
            const webhooks = await Webhook.list();
            const webhook = webhooks.data.find((w: any) => w.getId() === webhookId);

            if (!webhook) {
                throw new Error(`Webhook with ID ${webhookId} not found`);
            }

            // Prepare event type filter based on CDP documentation
            const eventTypeFilter: any = {
                addresses: addresses
            };

            // For wallet_activity events, wallet_id is required according to CDP docs
            if (webhook.getEventType() === 'wallet_activity') {
                // Use provided walletId or fallback to webhook ID as per CDP docs
                eventTypeFilter.wallet_id = walletId || webhook.getId();
            }

            logger.info({
                webhookId,
                addresses,
                walletId: eventTypeFilter.wallet_id,
                eventType: webhook.getEventType(),
                addressCount: addresses.length
            }, 'Updating webhook addresses (complete replacement)');

            // Update the webhook with complete address list replacement
            const updatedWebhook = await webhook.update({
                eventTypeFilter
            });

            logger.info({
                webhookId: updatedWebhook.getId(),
                newAddressCount: addresses.length
            }, 'Webhook addresses updated successfully');

            return {
                id: updatedWebhook.getId(),
                eventType: updatedWebhook.getEventType(),
                networkId: updatedWebhook.getNetworkId(),
                notificationUri: updatedWebhook.getNotificationURI(),
                eventTypeFilter: updatedWebhook.getEventTypeFilter()
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger.error({ err: error, webhookId, addresses }, 'Failed to update webhook addresses');
            throw new Error(`Failed to update webhook addresses: ${errorMessage}`);
        }
    }

    /**
     * Add a new address to webhook by merging with existing addresses from CDP
     */
    async addAddressToWebhook(newAddress: string, webhookId: string, walletId?: string) {
        try {
            // Validate the new address format
            const addressRegex = /^0x[a-fA-F0-9]{40}$/;
            if (!addressRegex.test(newAddress)) {
                throw new Error(`Invalid address format: ${newAddress}`);
            }

            // Get existing addresses directly from CDP webhook
            const existingAddresses = await this.getWebhookAddresses(webhookId);

            // Add the new address if it's not already in the list
            if (!existingAddresses.includes(newAddress.toLowerCase())) {
                existingAddresses.push(newAddress.toLowerCase());
            }

            // Update webhook with all addresses (existing + new)
            const updatedWebhook = await this.updateWebhookAddresses(webhookId, existingAddresses, walletId);

            logger.info({
                newAddress,
                existingCount: existingAddresses.length - 1,
                totalAddresses: existingAddresses.length,
                wasNewAddress: !existingAddresses.includes(newAddress.toLowerCase())
            }, 'Address added to webhook successfully');

            return {
                ...updatedWebhook,
                newAddress,
                existingCount: existingAddresses.length - 1,
                totalAddresses: existingAddresses.length
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger.error({ err: error, newAddress, webhookId }, 'Failed to add address to webhook');
            throw new Error(`Failed to add address to webhook: ${errorMessage}`);
        }
    }

    /**
     * Get current addresses being monitored by a webhook
     */
    async getWebhookAddresses(webhookId: string) {
        try {
            const webhooks = await Webhook.list();
            const webhook = webhooks.data.find((w: any) => w.getId() === webhookId);

            if (!webhook) {
                throw new Error(`Webhook with ID ${webhookId} not found`);
            }

            return (webhook.getEventTypeFilter() as any)?.addresses || [];
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger.error({ err: error, webhookId }, 'Failed to get webhook addresses');
            throw new Error(errorMessage);
        }
    }

    /**
     * List all webhooks associated with the CDP account
     */
    async listAllWebhooks() {
        try {
            const webhooks = await Webhook.list();
            
            logger.info({
                totalWebhooks: webhooks.data.length
            }, 'Fetched all webhooks from CDP');

            // Debug: Log the first webhook to see what methods are available
            if (webhooks.data.length > 0) {
                const firstWebhook = webhooks.data[0];
                logger.debug({
                    webhookKeys: Object.keys(firstWebhook),
                    webhookMethods: Object.getOwnPropertyNames(Object.getPrototypeOf(firstWebhook)),
                    webhookType: typeof firstWebhook,
                    webhookConstructor: firstWebhook.constructor.name
                }, 'Debug: First webhook structure');
            }

            return webhooks.data.map((webhook: any) => {
                // Only use methods that we know exist
                const webhookInfo: any = {
                    id: webhook.getId ? webhook.getId() : webhook.id,
                    eventType: webhook.getEventType ? webhook.getEventType() : webhook.eventType,
                    networkId: webhook.getNetworkId ? webhook.getNetworkId() : webhook.networkId,
                    notificationUri: webhook.getNotificationURI ? webhook.getNotificationURI() : webhook.notificationUri
                };

                // Safely get eventTypeFilter if the method exists
                if (webhook.getEventTypeFilter) {
                    webhookInfo.eventTypeFilter = webhook.getEventTypeFilter();
                } else if (webhook.eventTypeFilter) {
                    webhookInfo.eventTypeFilter = webhook.eventTypeFilter;
                }

                // Only add timestamp fields if the methods exist
                if (webhook.getCreatedAt) {
                    webhookInfo.createdAt = webhook.getCreatedAt();
                }
                if (webhook.getUpdatedAt) {
                    webhookInfo.updatedAt = webhook.getUpdatedAt();
                }

                return webhookInfo;
            });
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger.error({ err: error }, 'Failed to list webhooks from CDP');
            throw new Error(`Failed to list webhooks: ${errorMessage}`);
        }
    }
}
