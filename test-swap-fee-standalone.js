// Standalone test for swap fee calculation

// Constants
const FEE_PERCENTAGE = 5; // 5% swap fee
const FEE_RECIPIENT = "0x27cEe32550DcC30De5a23551bAF7de2f3b0b98A0";

function testSwapFee() {
  console.log('Testing swap fee calculation...');
  console.log(`Fee recipient: ${FEE_RECIPIENT}`);
  console.log(`Fee percentage: ${FEE_PERCENTAGE}%`);
  console.log('-----------------------------------');
  
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
  const feeAmount = (mockSwapPrice.toAmount * BigInt(FEE_PERCENTAGE)) / BigInt(100);
  const userAmount = mockSwapPrice.toAmount - feeAmount;
  
  // Format amounts for display
  const formattedToAmount = formatAmount(mockSwapPrice.toAmount, 6);
  const formattedFeeAmount = formatAmount(feeAmount, 6);
  const formattedUserAmount = formatAmount(userAmount, 6);
  
  console.log('Input amount: 1 WETH');
  console.log(`Gross output amount: ${formattedToAmount} USDC (${mockSwapPrice.toAmount.toString()} raw)`);
  console.log(`Fee amount (${FEE_PERCENTAGE}%): ${formattedFeeAmount} USDC (${feeAmount.toString()} raw)`);
  console.log(`User receives: ${formattedUserAmount} USDC (${userAmount.toString()} raw)`);
  console.log(`Actual fee percentage: ${(Number(feeAmount) * 100 / Number(mockSwapPrice.toAmount)).toFixed(2)}%`);
  
  console.log('\nTest complete!');
}

// Helper function to format amounts for display
function formatAmount(amount, decimals = 18) {
  try {
    const amountBigInt = BigInt(amount.toString());
    const divisor = BigInt(10 ** decimals);
    const wholePart = amountBigInt / divisor;
    const fractionalPart = amountBigInt % divisor;
    
    const fractionalStr = fractionalPart.toString().padStart(decimals, "0");
    const trimmedFractional = fractionalStr.replace(/0+$/, "") || "0";
    
    return `${wholePart.toString()}.${trimmedFractional}`;
  } catch (error) {
    console.warn(`Failed to format amount ${amount}`);
    return "0.0";
  }
}

// Run the test
testSwapFee();