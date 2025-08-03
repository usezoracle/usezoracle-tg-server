import dotenv from 'dotenv';
import { CdpClient } from "@coinbase/cdp-sdk";

// Load environment variables
dotenv.config();

async function testCdpAuthentication() {
  console.log('🔍 Testing CDP Authentication...\n');

  // Check environment variables
  console.log('1. Checking environment variables:');
  console.log('CDP_API_KEY_ID exists:', !!process.env.CDP_API_KEY_ID);
  console.log('CDP_API_KEY_SECRET exists:', !!process.env.CDP_API_KEY_SECRET);
  console.log('CDP_WALLET_SECRET exists:', !!process.env.CDP_WALLET_SECRET);
  
  if (!process.env.CDP_API_KEY_ID || !process.env.CDP_API_KEY_SECRET || !process.env.CDP_WALLET_SECRET) {
    console.log('❌ Missing required environment variables');
    return;
  }

  console.log('\n2. Testing CDP Client initialization:');
  try {
    const cdp = new CdpClient({
      apiKeyId: process.env.CDP_API_KEY_ID,
      apiKeySecret: process.env.CDP_API_KEY_SECRET,
      walletSecret: process.env.CDP_WALLET_SECRET,
    });
    console.log('✅ CDP Client initialized successfully');

    console.log('\n3. Testing basic CDP operations:');
    
    // Test listing accounts
    try {
      console.log('Testing listAccounts...');
      const accounts = await cdp.evm.listAccounts();
      console.log('✅ listAccounts successful');
      console.log('Number of accounts:', accounts.accounts.length);
    } catch (error) {
      console.log('❌ listAccounts failed:', error.message);
    }

    // Test creating a test account
    try {
      console.log('Testing createAccount...');
      const testAccountName = `test-account-${Date.now()}`;
      const account = await cdp.evm.createAccount({ name: testAccountName });
      console.log('✅ createAccount successful');
      console.log('Account address:', account.address);
      
      // Clean up - delete the test account
      try {
        await cdp.evm.deleteAccount({ name: testAccountName });
        console.log('✅ Test account cleaned up');
      } catch (cleanupError) {
        console.log('⚠️ Could not clean up test account:', cleanupError.message);
      }
    } catch (error) {
      console.log('❌ createAccount failed:', error.message);
    }

  } catch (error) {
    console.log('❌ CDP Client initialization failed:', error.message);
    console.log('Error details:', error);
  }
}

// Run the test
testCdpAuthentication().catch(console.error); 