import dotenv from 'dotenv';
import { WebhookManagementService } from '../services/webhookManagementService';

// Load environment variables
dotenv.config();

async function testWebhookListing() {
    try {
        console.log('🔍 Testing webhook listing functionality...');
        console.log('📋 Environment check:');
        console.log(`   CDP_API_KEY_ID: ${process.env.CDP_API_KEY_ID ? '✅ Set' : '❌ Not set'}`);
        console.log(`   CDP_API_KEY_SECRET: ${process.env.CDP_API_KEY_SECRET ? '✅ Set' : '❌ Not set'}`);
        console.log('');

        if (!process.env.CDP_API_KEY_ID || !process.env.CDP_API_KEY_SECRET) {
            console.error('❌ Missing required environment variables. Please set CDP_API_KEY_ID and CDP_API_KEY_SECRET');
            process.exit(1);
        }

        console.log('🚀 Initializing WebhookManagementService...');
        const service = WebhookManagementService.getInstance();
        
        console.log('📡 Fetching all webhooks from CDP...');
        const webhooks = await service.listAllWebhooks();
        
        console.log('');
        console.log('✅ Successfully fetched webhooks:');
        console.log(`   Total webhooks: ${webhooks.length}`);
        console.log('');
        
        if (webhooks.length === 0) {
            console.log('📝 No webhooks found. This might mean:');
            console.log('   - No webhooks have been created yet');
            console.log('   - The API credentials don\'t have access to webhooks');
            console.log('   - The webhooks are in a different environment');
        } else {
            webhooks.forEach((webhook, index) => {
                console.log(`📋 Webhook ${index + 1}:`);
                console.log(`   ID: ${webhook.id}`);
                console.log(`   Event Type: ${webhook.eventType}`);
                console.log(`   Network: ${webhook.networkId}`);
                console.log(`   Notification URI: ${webhook.notificationUri}`);
                console.log(`   Created: ${webhook.createdAt}`);
                console.log(`   Updated: ${webhook.updatedAt}`);
                
                if (webhook.eventTypeFilter && webhook.eventTypeFilter.addresses) {
                    console.log(`   Monitored Addresses: ${webhook.eventTypeFilter.addresses.length}`);
                    if (webhook.eventTypeFilter.addresses.length > 0) {
                        console.log(`   Sample Address: ${webhook.eventTypeFilter.addresses[0]}`);
                    }
                }
                console.log('');
            });
        }
        
        console.log('🎯 Next steps:');
        console.log('   1. Use one of the webhook IDs above in your routes');
        console.log('   2. Update the WEBHOOK_ID constant in webhookManagementRoutes.ts');
        console.log('   3. Test the /api/webhooks/addresses endpoint');
        
    } catch (error) {
        console.error('❌ Error testing webhook listing:');
        console.error('   Message:', error.message);
        console.error('   Stack:', error.stack);
        
        if (error.message.includes('authentication')) {
            console.error('');
            console.error('🔐 Authentication error detected. Please check:');
            console.error('   - CDP_API_KEY_ID is correct');
            console.error('   - CDP_API_KEY_SECRET is correct');
            console.error('   - API key has proper permissions');
        }
        
        process.exit(1);
    }
}

// Run the test
testWebhookListing();
