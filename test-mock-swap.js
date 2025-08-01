/**
 * Test script for the MockSwapService
 * This script tests the swap functionality with 5% fee calculation
 */

import { MockSwapService } from './services/mockSwapService.js';

// Test various swap scenarios
async function testSwapService() {
  try {
    console.log('🧪 Testing MockSwapService with 5% fee implementation');
    console.log('=====================================================');
    
    const swapService = MockSwapService.getInstance();
    
    // Test 1: Price estimation with 1 ETH to USDC
    console.log('\n📊 Test 1: Get swap price for 1 ETH to USDC');
    console.log('----------------------------------------');
    
    const priceResult = await swapService.getSwapPrice({
      accountName: 'test-account',
      fromToken: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', // ETH
      toToken: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // USDC
      fromAmount: '1000000000000000000', // 1 ETH
      network: 'base'
    });
    
    console.log(`Success: ${priceResult.success}`);
    console.log(`Message: ${priceResult.message}`);
    console.log('Swap price details:');
    console.log(`- From: 1 ETH (${priceResult.data.fromAmount})`);
    console.log(`- Gross amount: ${priceResult.data.grossAmount}`);
    console.log(`- Fee (${priceResult.data.feePercentage}%): ${priceResult.data.feeAmount}`);
    console.log(`- Net amount: ${priceResult.data.toAmount}`);
    console.log(`- Fee recipient: ${priceResult.data.feeRecipient}`);
    console.log(`- Formatted output: ${priceResult.data.expectedOutputFormatted}`);
    
    // Verify fee calculation
    const grossAmount = BigInt(priceResult.data.grossAmount);
    const feeAmount = BigInt(priceResult.data.feeAmount);
    const netAmount = BigInt(priceResult.data.toAmount);
    const expectedFeeAmount = (grossAmount * BigInt(5)) / BigInt(100);
    const expectedNetAmount = grossAmount - expectedFeeAmount;
    
    console.log('\nVerifying fee calculation:');
    console.log(`- Expected fee (5% of gross): ${expectedFeeAmount}`);
    console.log(`- Actual fee amount: ${feeAmount}`);
    console.log(`- Fee calculation correct: ${expectedFeeAmount === feeAmount ? '✅ Yes' : '❌ No'}`);
    console.log(`- Expected net amount: ${expectedNetAmount}`);
    console.log(`- Actual net amount: ${netAmount}`);
    console.log(`- Net amount correct: ${expectedNetAmount === netAmount ? '✅ Yes' : '❌ No'}`);
    
    // Test 2: Execute swap with 1 ETH to USDC
    console.log('\n💱 Test 2: Execute swap for 1 ETH to USDC');
    console.log('----------------------------------------');
    
    const swapResult = await swapService.executeSwap({
      accountName: 'test-account',
      fromToken: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', // ETH
      toToken: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // USDC
      fromAmount: '1000000000000000000', // 1 ETH
      slippageBps: 100, // 1% slippage
      network: 'base'
    });
    
    console.log(`Success: ${swapResult.success}`);
    console.log(`Message: ${swapResult.message}`);
    console.log('Swap execution details:');
    console.log(`- Transaction hash: ${swapResult.data.transactionHash}`);
    console.log(`- From: 1 ETH (${swapResult.data.fromAmount})`);
    console.log(`- Gross amount: ${swapResult.data.grossAmount}`);
    console.log(`- Fee (${swapResult.data.feePercentage}%): ${swapResult.data.feeAmount}`);
    console.log(`- Net amount: ${swapResult.data.toAmount}`);
    console.log(`- Fee recipient: ${swapResult.data.feeRecipient}`);
    console.log(`- Formatted output: ${swapResult.data.amountReceived}`);
    
    // Verify fee calculation for execution
    const exGrossAmount = BigInt(swapResult.data.grossAmount);
    const exFeeAmount = BigInt(swapResult.data.feeAmount);
    const exNetAmount = BigInt(swapResult.data.toAmount);
    const exExpectedFeeAmount = (exGrossAmount * BigInt(5)) / BigInt(100);
    const exExpectedNetAmount = exGrossAmount - exExpectedFeeAmount;
    
    console.log('\nVerifying execution fee calculation:');
    console.log(`- Expected fee (5% of gross): ${exExpectedFeeAmount}`);
    console.log(`- Actual fee amount: ${exFeeAmount}`);
    console.log(`- Fee calculation correct: ${exExpectedFeeAmount === exFeeAmount ? '✅ Yes' : '❌ No'}`);
    console.log(`- Expected net amount: ${exExpectedNetAmount}`);
    console.log(`- Actual net amount: ${exNetAmount}`);
    console.log(`- Net amount correct: ${exExpectedNetAmount === exNetAmount ? '✅ Yes' : '❌ No'}`);
    
    // Test 3: Smaller amount test (0.01 ETH)
    console.log('\n🔍 Test 3: Small amount test (0.01 ETH to USDC)');
    console.log('----------------------------------------');
    
    const smallAmountResult = await swapService.getSwapPrice({
      accountName: 'test-account',
      fromToken: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', // ETH
      toToken: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // USDC
      fromAmount: '10000000000000000', // 0.01 ETH
      network: 'base'
    });
    
    const smallGrossAmount = BigInt(smallAmountResult.data.grossAmount);
    const smallFeeAmount = BigInt(smallAmountResult.data.feeAmount);
    const smallNetAmount = BigInt(smallAmountResult.data.toAmount);
    const smallExpectedFee = (smallGrossAmount * BigInt(5)) / BigInt(100);
    
    console.log(`Small amount test - Gross: ${smallGrossAmount}`);
    console.log(`Small amount test - Fee: ${smallFeeAmount}`);
    console.log(`Small amount test - Net: ${smallNetAmount}`);
    console.log(`Fee calculation correct: ${smallExpectedFee === smallFeeAmount ? '✅ Yes' : '❌ No'}`);
    console.log(`Actual fee percentage: ${(Number(smallFeeAmount) * 100 / Number(smallGrossAmount)).toFixed(2)}%`);
    
    console.log('\n✅ All tests completed successfully');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run the tests
testSwapService();