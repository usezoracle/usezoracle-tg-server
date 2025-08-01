import { SwapService } from './services/swapService.js';

async function testSwapFee() {
  console.log('Testing swap fee calculation...');
  
  // Example input amount (1 WETH)
  const fromAmount = '1000000000000000000'; // 1 WETH with 18 decimals
  
  // Create mock data for testing
  const mockSwapPrice = {
    liquidityAvailable: true,
    fromAmount: BigInt(fromAmount),
    toAmount: BigInt('1800000000'), // 1.8 USDC with 6 decimals
    minToAmount: BigInt('1782000000'), // 1.782 USDC with 6 decimals (1% slippage)
    fromToken: '0x4200000000000000000000000000000000000006', // WETH
    toToken: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // USDC
  };

  // Calculate the 5% fee
  const feePercentage = 5;
  const feeAmount = (mockSwapPrice.toAmount * BigInt(feePercentage)) / BigInt(100);
  const userAmount = mockSwapPrice.toAmount - feeAmount;
  
  console.log('Input amount:', fromAmount, 'WETH');
  console.log('Gross output amount:', mockSwapPrice.toAmount.toString(), 'USDC');
  console.log('Fee amount (5%):', feeAmount.toString(), 'USDC');
  console.log('User receives:', userAmount.toString(), 'USDC');
  console.log('Fee percentage:', (Number(feeAmount) / Number(mockSwapPrice.toAmount) * 100).toFixed(2) + '%');
  
  console.log('\nTest complete!');
}

testSwapFee().catch(console.error);