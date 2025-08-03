import dotenv from 'dotenv';
import fs from 'fs';

// Load environment variables
dotenv.config();

function checkWalletSecret() {
  console.log('🔍 Checking wallet secret format...\n');

  const walletSecret = process.env.CDP_WALLET_SECRET;
  
  if (!walletSecret) {
    console.log('❌ CDP_WALLET_SECRET not found in environment variables');
    return;
  }

  console.log('1. Current wallet secret format:');
  console.log('Length:', walletSecret.length);
  console.log('Starts with:', walletSecret.substring(0, 20));
  console.log('Ends with:', walletSecret.substring(walletSecret.length - 20));

  // Check if it's already in PEM format
  if (walletSecret.includes('-----BEGIN PRIVATE KEY-----')) {
    console.log('✅ Wallet secret appears to be in PEM format');
  } else {
    console.log('⚠️ Wallet secret is not in PEM format');
    console.log('Converting to PEM format...');
    
    // Convert to PEM format
    const pemFormatted = `-----BEGIN PRIVATE KEY-----\n${walletSecret}\n-----END PRIVATE KEY-----`;
    
    console.log('2. PEM formatted wallet secret:');
    console.log(pemFormatted);
    
    // Update .env file
    try {
      let envContent = fs.readFileSync('.env', 'utf8');
      envContent = envContent.replace(
        /CDP_WALLET_SECRET=.*/,
        `CDP_WALLET_SECRET="${pemFormatted}"`
      );
      fs.writeFileSync('.env', envContent);
      console.log('✅ Updated .env file with PEM formatted wallet secret');
    } catch (error) {
      console.log('❌ Failed to update .env file:', error.message);
    }
  }
}

checkWalletSecret(); 