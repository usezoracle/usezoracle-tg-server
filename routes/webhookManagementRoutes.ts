import { Router, Request, Response } from 'express';
import { WebhookManagementService } from '../services/webhookManagementService';
import { logger } from '../lib/logger';

const router = Router();
const webhookService = WebhookManagementService.getInstance();

// Static webhook ID - no need for users to pass it
const WEBHOOK_ID = '68a91f5bf3e21b15f0b528a9';

/**
 * @route PUT /api/webhooks/addresses
 * @desc Update webhook addresses (complete replacement as per CDP docs)
 * @access Private
 */
router.put('/addresses', async (req: Request, res: Response) => {
    try {
        const { addresses, walletId } = req.body;

        // Validate request body
        if (!addresses || !Array.isArray(addresses)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid request body',
                message: 'Addresses array is required'
            });
        }

        // Validate addresses format (Ethereum address format)
        const addressRegex = /^0x[a-fA-F0-9]{40}$/;
        const invalidAddresses = addresses.filter(addr => !addressRegex.test(addr));

        if (invalidAddresses.length > 0) {
            return res.status(400).json({
                success: false,
                error: 'Invalid addresses',
                message: `Invalid address format: ${invalidAddresses.join(', ')}`,
                invalidAddresses
            });
        }

        // Update the webhook addresses using the static ID
        const updatedWebhook = await webhookService.updateWebhookAddresses(WEBHOOK_ID, addresses, walletId);

        res.json({
            success: true,
            message: 'Webhook addresses updated successfully',
            data: {
                webhookId: WEBHOOK_ID,
                addresses: addresses,
                addressCount: addresses.length,
                note: 'All previous addresses have been replaced with the new list'
            }
        });
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error({ err: error, webhookId: WEBHOOK_ID, body: req.body }, 'Failed to update webhook addresses');

        res.status(500).json({
            success: false,
            error: 'Failed to update webhook addresses',
            message: errorMessage
        });
    }
});

/**
 * @route POST /api/webhooks/addresses
 * @desc Add a single address to webhook by merging with existing addresses from CDP
 * @access Private
 */
router.post('/addresses', async (req: Request, res: Response) => {
    try {
        const { address } = req.body;

        // Validate request body
        if (!address || typeof address !== 'string') {
            return res.status(400).json({
                success: false,
                error: 'Invalid request body',
                message: 'Address string is required'
            });
        }

        // Validate address format (Ethereum address format)
        const addressRegex = /^0x[a-fA-F0-9]{40}$/;
        if (!addressRegex.test(address)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid address format',
                message: 'Address must be a valid Ethereum address (0x format)'
            });
        }

        // Add the address to webhook by merging with existing addresses from database
        const result = await webhookService.addAddressToWebhook(address, WEBHOOK_ID);

        res.json({
            success: true,
            message: 'Address added to webhook successfully',
            data: {
                webhookId: WEBHOOK_ID,
                newAddress: address,
                totalAddresses: result.totalAddresses,
                note: 'Address was merged with existing addresses from CDP webhook'
            }
        });
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error({ err: error, webhookId: WEBHOOK_ID, body: req.body }, 'Failed to add address to webhook');

        res.status(500).json({
            success: false,
            error: 'Failed to add address to webhook',
            message: errorMessage
        });
    }
});

/**
 * @route GET /api/webhooks/addresses
 * @desc Get current addresses monitored by the webhook
 * @access Private
 */
router.get('/addresses', async (req: Request, res: Response) => {
    try {
        const addresses = await webhookService.getWebhookAddresses(WEBHOOK_ID);

        res.json({
            success: true,
            data: {
                webhookId: WEBHOOK_ID,
                addresses,
                count: addresses.length
            }
        });
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error({ err: error, webhookId: WEBHOOK_ID }, 'Failed to get webhook addresses');

        res.status(500).json({
            success: false,
            error: 'Failed to retrieve webhook addresses',
            message: errorMessage
        });
    }
});

/**
 * @route GET /api/webhooks
 * @desc List all webhooks associated with the CDP account (for testing)
 * @access Private
 */
router.get('/', async (req: Request, res: Response) => {
    try {
        const webhooks = await webhookService.listAllWebhooks();

        res.json({
            success: true,
            data: {
                totalWebhooks: webhooks.length,
                webhooks
            }
        });
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error({ err: error }, 'Failed to list webhooks');

        res.status(500).json({
            success: false,
            error: 'Failed to list webhooks',
            message: errorMessage
        });
    }
});

export default router;
