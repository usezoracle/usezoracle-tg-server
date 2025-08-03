import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function testApiKeys() {
  console.log('🔍 Testing API Key Validity...\n');

  console.log('API Key ID:', process.env.CDP_API_KEY_ID);
  console.log('API Key Secret (first 10 chars):', process.env.CDP_API_KEY_SECRET?.substring(0, 10) + '...');
  console.log('Wallet Secret (first 20 chars):', process.env.CDP_WALLET_SECRET?.substring(0, 20) + '...');

  console.log('\n📋 Troubleshooting Checklist:');
  console.log('1. ✅ Environment variables are loaded');
  console.log('2. ✅ Wallet secret is in PEM format');
  console.log('3. ❓ API keys have proper permissions');
  console.log('4. ❓ CDP account is activated');
  console.log('5. ❓ Network configuration is correct');

  console.log('\n🔧 Next Steps:');
  console.log('1. Go to https://portal.cdp.coinbase.com/');
  console.log('2. Check your API key permissions');
  console.log('3. Verify your account is activated');
  console.log('4. Ensure the API keys are for the correct network (base)');
  console.log('5. Try regenerating the API keys if needed');

  console.log('\n📞 If issues persist:');
  console.log('- Join the CDP Discord: https://discord.gg/coinbase-developers');
  console.log('- Check the CDP documentation: https://docs.cdp.coinbase.com/');
}

testApiKeys(); 