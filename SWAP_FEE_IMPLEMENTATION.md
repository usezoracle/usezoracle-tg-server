# 5% Swap Fee Implementation

## Overview

We've successfully implemented and tested a 5% swap fee mechanism for token swaps. The fee is calculated on the gross swap amount and sent to a specified recipient address (`0x27cEe32550DcC30De5a23551bAF7de2f3b0b98A0`).

## Implementation Details

### Fee Calculation

The fee calculation works as follows:

1. The gross amount is determined (amount of tokens received from the swap)
2. 5% of this gross amount is calculated as the fee
3. The fee is deducted from the gross amount to get the net amount the user receives
4. The fee is sent to the specified recipient address

### Code Implementations

We've created multiple implementations to test the fee mechanism:

1. **Standalone Test Script**: `test-swap-fee-standalone.js`
   - Simple JavaScript script that tests the fee calculation logic
   - Confirms that the fee is exactly 5% of the gross amount

2. **Mock Swap Service**: `services/mockSwapService.js`
   - A complete mock implementation of the swap service
   - Implements both price estimation and swap execution with 5% fee
   - Does not require CDP API keys for testing

3. **Mock API Server**: `mock-server.js` with `routes/mockSwapRoutes.js`
   - A fully functional Express server that uses the mock swap service
   - Exposes API endpoints for token listing, price estimation, and swap execution
   - Demonstrates how the fee mechanism works in a real API context

### Test Results

All tests confirm that:

1. The fee is correctly calculated as 5% of the gross swap amount
2. The fee recipient is correctly set to `0x27cEe32550DcC30De5a23551bAF7de2f3b0b98A0`
3. Users receive the net amount (gross - fee)
4. All relevant fee information is included in API responses

## API Response Examples

### Swap Price Estimation with Fee

```json
{
  "success": true,
  "data": {
    "liquidityAvailable": true,
    "fromAmount": "1000000000000000000",
    "toAmount": "1710000000000000000",
    "minToAmount": "1692900000000000000",
    "grossAmount": "1800000000000000000",
    "feeAmount": "90000000000000000",
    "feePercentage": 5,
    "feeRecipient": "0x27cEe32550DcC30De5a23551bAF7de2f3b0b98A0",
    "expectedOutputFormatted": "1.71",
    "minOutputFormatted": "1.6929",
    "exchangeRate": "1.71000000"
  },
  "message": "Swap price estimated successfully (includes 5% fee)"
}
```

### Swap Execution with Fee

```json
{
  "success": true,
  "data": {
    "transactionHash": "0x37c96d8ab9aa18",
    "fromAmount": "1000000000000000000",
    "toAmount": "1710000000000000000",
    "grossAmount": "1800000000000000000",
    "feeAmount": "90000000000000000",
    "feePercentage": 5,
    "feeRecipient": "0x27cEe32550DcC30De5a23551bAF7de2f3b0b98A0",
    "amountReceived": "1.71",
    "network": "base"
  },
  "message": "Swap executed successfully with 5% fee"
}
```

## Integration with Real Service

To use this in the actual application:

1. The `services/swapService.ts` already includes the 5% fee implementation
2. The fee recipient address is already set to `0x27cEe32550DcC30De5a23551bAF7de2f3b0b98A0`
3. The OpenAPI documentation in `openapi.yaml` has been updated to reflect the fee structure

## Testing Instructions

To test the mock implementation:

1. Run the standalone test:
   ```
   node --experimental-modules test-mock-swap.js
   ```

2. Start the mock API server:
   ```
   node --experimental-modules mock-server.js
   ```

3. Test the API endpoints:
   ```
   curl "http://localhost:3001/api/mock-swaps/tokens/base"
   curl "http://localhost:3001/api/mock-swaps/price?accountName=test-account&fromToken=0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE&toToken=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913&fromAmount=1000000000000000000&network=base"
   curl -X POST -H "Content-Type: application/json" -d '{"accountName":"test-account","fromToken":"0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE","toToken":"0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913","fromAmount":"1000000000000000000","slippageBps":100,"network":"base"}' http://localhost:3001/api/mock-swaps/execute
   ```