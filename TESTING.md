# Testing Guide for UseZoracle API with Swap Fee Implementation

## Environment Setup

1. **API Keys Configuration**
   The application requires Coinbase Developer Platform API keys to function properly. These should be set in the `.env` file:

   ```
   CDP_API_KEY_ID=your-api-key-id
   CDP_API_KEY_SECRET=your-api-key-secret
   CDP_WALLET_SECRET=your-wallet-secret
   CDP_NETWORK=base
   ```

   > **Important**: There appears to be an issue with line breaks in the `.env` file. If you're experiencing the "Missing required CDP Secret API Key configuration parameters" error, try the following:
   > - Make sure each environment variable is on a single line without any breaks
   > - Recreate the `.env` file with proper line breaks
   > - Consider using environment variables directly when launching the server

2. **Build the Project**
   ```
   npm run build
   ```

3. **Start the Server**
   ```
   npm start
   ```

## Swap Fee Implementation

We've successfully implemented the 5% swap fee as requested:

1. **Fee Calculation**
   - 5% of the gross swap amount is calculated
   - The fee is sent to the specified address: `0x27cEe32550DcC30De5a23551bAF7de2f3b0b98A0`

2. **Testing with Standalone Script**
   We created a standalone test script that verifies the fee calculation logic:

   ```
   node test-swap-fee-standalone.js
   ```

   The output shows:
   - Input: 1 WETH
   - Gross output: 1800 USDC
   - Fee amount (5%): 90 USDC
   - Net amount to user: 1710 USDC
   - Verification that fee is exactly 5%

3. **API Implementation**
   The fee logic is implemented in `services/swapService.ts`:
   
   - `getSwapPrice()`: Calculates the expected fee for the swap price estimation
   - `executeSwap()`: Executes the swap and transfers the fee to the recipient address

4. **OpenAPI Documentation**
   The OpenAPI spec in `openapi.yaml` has been updated to reflect the fee structure in the responses.

## Next Steps

1. **Debugging Environment Variables**
   - If you're still experiencing issues with API keys, try using a mock service for testing:
     ```typescript
     // In your route files, use this import instead
     import { MockCdpService as CdpService } from "../services/mock-cdpService.js";
     ```

2. **Testing the API**
   Once the server is running:
   - Access the API documentation: http://localhost:3000/api-docs
   - Test the swap endpoints:
     - GET `/api/swaps/tokens/{network}` to get common token addresses
     - GET `/api/swaps/price` to get swap price estimates with fee calculation
     - POST `/api/swaps/execute` to execute swaps with the 5% fee

3. **Verifying Fee Implementation**
   - Check that the fee is being calculated correctly (5% of gross amount)
   - Verify that the fee recipient address is set to `0x27cEe32550DcC30De5a23551bAF7de2f3b0b98A0`
   - Test with different token amounts to ensure fee scales appropriately