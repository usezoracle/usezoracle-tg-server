import dotenv from 'dotenv';
import { CdpClient } from "@coinbase/cdp-sdk";

// Load environment variables
dotenv.config();

async function testCdpComprehensive() {
  console.log('🔍 Comprehensive CDP Authentication Test...\n');

  // Check environment variables
  console.log('1. Environment Variables:');
  console.log('CDP_API_KEY_ID:', process.env.CDP_API_KEY_ID ? '✅ Set' : '❌ Missing');
  console.log('CDP_API_KEY_SECRET:', process.env.CDP_API_KEY_SECRET ? '✅ Set' : '❌ Missing');
  console.log('CDP_WALLET_SECRET:', process.env.CDP_WALLET_SECRET ? '✅ Set' : '❌ Missing');
  console.log('CDP_NETWORK:', process.env.CDP_NETWORK || 'Not set');

  if (!process.env.CDP_API_KEY_ID || !process.env.CDP_API_KEY_SECRET || !process.env.CDP_WALLET_SECRET) {
    console.log('\n❌ Missing required environment variables');
    return;
  }

  console.log('\n2. Testing different CDP client configurations:');

  // Test 1: Basic configuration
  console.log('\n--- Test 1: Basic Configuration ---');
  try {
    const cdp1 = new CdpClient({
      apiKeyId: process.env.CDP_API_KEY_ID,
      apiKeySecret: process.env.CDP_API_KEY_SECRET,
      walletSecret: process.env.CDP_WALLET_SECRET,
    });
    console.log('✅ Basic client created');
    
    // Test a simple operation
    try {
      const accounts = await cdp1.evm.listAccounts();
      console.log('✅ listAccounts successful');
    } catch (error) {
      console.log('❌ listAccounts failed:', error.message);
    }
  } catch (error) {
    console.log('❌ Basic client creation failed:', error.message);
  }

  // Test 2: With explicit network
  console.log('\n--- Test 2: With Explicit Network ---');
  try {
    const cdp2 = new CdpClient({
      apiKeyId: process.env.CDP_API_KEY_ID,
      apiKeySecret: process.env.CDP_API_KEY_SECRET,
      walletSecret: process.env.CDP_WALLET_SECRET,
      network: 'base', // Explicitly set network
    });
    console.log('✅ Client with explicit network created');
    
    try {
      const accounts = await cdp2.evm.listAccounts();
      console.log('✅ listAccounts with explicit network successful');
    } catch (error) {
      console.log('❌ listAccounts with explicit network failed:', error.message);
    }
  } catch (error) {
    console.log('❌ Client with explicit network creation failed:', error.message);
  }

  // Test 3: Check if API keys are valid by testing a different endpoint
  console.log('\n--- Test 3: Testing API Key Validity ---');
  try {
    const cdp3 = new CdpClient({
      apiKeyId: process.env.CDP_API_KEY_ID,
      apiKeySecret: process.env.CDP_API_KEY_SECRET,
      walletSecret: process.env.CDP_WALLET_SECRET,
    });
    
    // Try to get account info if we have any existing accounts
    try {
      const accounts = await cdp3.evm.listAccounts();
      if (accounts.accounts.length > 0) {
        const firstAccount = accounts.accounts[0];
        console.log('✅ Found existing account:', firstAccount.name);
        
        // Try to get this account's details
        try {
          const accountDetails = await cdp3.evm.getAccount({ name: firstAccount.name });
          console.log('✅ Account details retrieved successfully');
          console.log('Account address:', accountDetails.address);
        } catch (accountError) {
          console.log('❌ Failed to get account details:', accountError.message);
        }
      } else {
        console.log('ℹ️ No existing accounts found');
      }
    } catch (listError) {
      console.log('❌ Failed to list accounts:', listError.message);
    }
  } catch (error) {
    console.log('❌ API key validity test failed:', error.message);
  }

  // Test 4: Check wallet secret format
  console.log('\n--- Test 4: Wallet Secret Format ---');
  const walletSecret = process.env.CDP_WALLET_SECRET;
  if (walletSecret) {
    console.log('Wallet secret length:', walletSecret.length);
    console.log('Contains PEM headers:', walletSecret.includes('-----BEGIN PRIVATE KEY-----'));
    console.log('Contains PEM footers:', walletSecret.includes('-----END PRIVATE KEY-----'));
    
    if (!walletSecret.includes('-----BEGIN PRIVATE KEY-----')) {
      console.log('⚠️ Wallet secret might need PEM formatting');
    } else {
      console.log('✅ Wallet secret appears to be in correct PEM format');
    }
  }

  console.log('\n--- Summary ---');
  console.log('If all tests are failing with "Unauthorized", please check:');
  console.log('1. API keys are valid and have proper permissions');
  console.log('2. Wallet secret is correctly formatted');
  console.log('3. Network configuration is correct');
  console.log('4. CDP account is properly set up');
}

// Run the comprehensive test
testCdpComprehensive().catch(console.error); 