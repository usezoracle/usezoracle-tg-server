import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Webhook } from '@coinbase/coinbase-sdk';

import { WebhookManagementService } from '../services/webhookManagementService.js';

// Mock the Coinbase SDK
vi.mock('@coinbase/coinbase-sdk', () => ({
    Coinbase: {
        configure: vi.fn()
    },
    Webhook: {
        list: vi.fn()
    }
}));

// Mock the logger
vi.mock('../lib/logger.js', () => ({
    logger: {
        info: vi.fn(),
        error: vi.fn(),
        debug: vi.fn()
    }
}));

// Mock the User model
vi.mock('../models/User.js', () => ({
    User: {
        find: vi.fn().mockReturnValue({
            lean: vi.fn().mockResolvedValue([
                { walletAddress: '0x1234567890123456789012345678901234567890' },
                { walletAddress: '0x0987654321098765432109876543210987654321' }
            ])
        })
    }
}));

describe('WebhookManagementService', () => {
    let service: WebhookManagementService;
    let mockWebhookList: any;

    beforeEach(() => {
        vi.clearAllMocks();
        
        // Create mock webhook data
        mockWebhookList = {
            data: [
                {
                    getId: () => 'webhook-1',
                    getEventType: () => 'wallet_activity',
                    getNetworkId: () => 'base',
                    getNotificationURI: () => 'https://example.com/webhook1',
                    getEventTypeFilter: () => ({ addresses: ['0x123...'] }),
                    getCreatedAt: () => '2024-01-01T00:00:00Z',
                    getUpdatedAt: () => '2024-01-01T00:00:00Z'
                },
                {
                    getId: () => 'webhook-2',
                    getEventType: () => 'transaction',
                    getNetworkId: () => 'base',
                    getNotificationURI: () => 'https://example.com/webhook2',
                    getEventTypeFilter: () => ({ addresses: ['0x456...'] }),
                    getCreatedAt: () => '2024-01-02T00:00:00Z',
                    getUpdatedAt: () => '2024-01-02T00:00:00Z'
                }
            ]
        };

        // Mock the Webhook.list method
        vi.mocked(Webhook.list).mockResolvedValue(mockWebhookList);

        service = WebhookManagementService.getInstance();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('listAllWebhooks', () => {
        it('should list all webhooks associated with the CDP account', async () => {
            const result = await service.listAllWebhooks();

            expect(result).toHaveLength(2);
            expect(result[0]).toEqual({
                id: 'webhook-1',
                eventType: 'wallet_activity',
                networkId: 'base',
                notificationUri: 'https://example.com/webhook1',
                eventTypeFilter: { addresses: ['0x123...'] },
                createdAt: '2024-01-01T00:00:00Z',
                updatedAt: '2024-01-01T00:00:00Z'
            });
            expect(result[1]).toEqual({
                id: 'webhook-2',
                eventType: 'transaction',
                networkId: 'base',
                notificationUri: 'https://example.com/webhook2',
                eventTypeFilter: { addresses: ['0x456...'] },
                createdAt: '2024-01-02T00:00:00Z',
                updatedAt: '2024-01-02T00:00:00Z'
            });
        });

        it('should handle empty webhook list', async () => {
            mockWebhookList.data = [];
            
            const result = await service.listAllWebhooks();
            
            expect(result).toHaveLength(0);
        });

        it('should handle CDP API errors gracefully', async () => {
            vi.mocked(Webhook.list).mockRejectedValue(new Error('CDP API Error'));

            await expect(service.listAllWebhooks()).rejects.toThrow('Failed to list webhooks: CDP API Error');
        });
    });

    describe('getAllUserWalletAddresses', () => {
        it('should fetch and return user wallet addresses', async () => {
            const result = await service.getAllUserWalletAddresses();

            expect(result).toHaveLength(2);
            expect(result).toContain('0x1234567890123456789012345678901234567890');
            expect(result).toContain('0x0987654321098765432109876543210987654321');
        });
    });
});
