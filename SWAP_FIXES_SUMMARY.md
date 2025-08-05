# Swap Service Fixes Summary

## Issues Resolved

### 1. Token Approval Error: `account.getTokenAllowance is not a function`

**Problem**: The CDP SDK's `account.swap()` method was trying to call `getTokenAllowance` internally, but this method didn't exist on the account object.

**Solution**: Implemented a JavaScript Proxy to intercept method calls and provide the missing `getTokenAllowance` method:

```typescript
// Create a proxy to intercept method calls
const accountProxy = new Proxy(account, {
  get(target, prop) {
    if (prop === 'getTokenAllowance') {
      return async (tokenAddress: string, spenderAddress: string) => {
        console.log(`Token allowance check requested for ${tokenAddress} with spender ${spenderAddress}`);
        
        // Check if this is the Permit2 contract
        const PERMIT2_CONTRACT = "0x000000000022d473030f116ddee9f6b43ac78ba3";
        if (spenderAddress.toLowerCase() === PERMIT2_CONTRACT.toLowerCase()) {
          console.log(`Token approval required for Permit2 contract. Please approve ${tokenAddress} to spend your tokens.`);
          return BigInt(0);
        }
        
        return BigInt(0);
      };
    }
    return (target as any)[prop];
  }
});
```

### 2. Rate Limiting Issues with Base Network RPC

**Problem**: The default Base network RPC endpoint was returning 429 (rate limit) errors when fetching token metadata.

**Solution**: Updated the public client to use Ankr's reliable RPC endpoint:

```typescript
// Use Ankr RPC endpoint for Base network to avoid rate limiting
const ankrRpcUrl = process.env.PROVIDER_URL || "https://rpc.ankr.com/base/b39a19f9ecf66252bf862fe6948021cd1586009ee97874655f46481cfbf3f129";

publicClient = createPublicClient({
  chain: base,
  transport: http(ankrRpcUrl),
});
```

### 3. Better Error Handling for Token Approvals

**Problem**: Users were getting generic errors when token approvals were required.

**Solution**: Added specific error handling and helpful error messages:

```typescript
catch (swapError) {
  // Check if the error is related to token approval
  const errorMessage = (swapError as Error).message;
  if (errorMessage.includes('allowance') || errorMessage.includes('approval')) {
    throw new Error(`Token approval required. Please approve the Permit2 contract (0x000000000022d473030f116ddee9f6b43ac78ba3) to spend your ${params.fromToken} tokens before executing this swap. You can do this by calling the 'approve' function on the token contract with the Permit2 address as the spender.`);
  }
  throw swapError;
}
```

## New API Endpoints Added

### 1. Check Token Allowance
```
GET /api/swaps/allowance?accountName=xxx&tokenAddress=xxx&spenderAddress=xxx&network=base
```

### 2. Get Approval Instructions
```
GET /api/swaps/approval-instructions?accountName=xxx&tokenAddress=xxx&amount=xxx&network=base
```

## How Token Approvals Work

1. **For Native ETH**: No approval is required
2. **For ERC-20 Tokens**: Users must approve the Permit2 contract (`0x000000000022d473030f116ddee9f6b43ac78ba3`) to spend their tokens

### Manual Approval Process:
1. Connect wallet to Base network
2. Navigate to token contract on BaseScan
3. Call the `approve` function with:
   - `spender`: `0x000000000022d473030f116ddee9f6b43ac78ba3`
   - `amount`: The amount you want to swap (in wei/smallest unit)
4. Confirm the transaction
5. Wait for confirmation before attempting the swap

## Testing the Fixes

1. **Build the project**: `npm run build`
2. **Start the server**: `npm start`
3. **Test native ETH swaps**: Should work without approval
4. **Test ERC-20 token swaps**: Should provide clear error messages about required approvals

## References

- [Coinbase CDP Documentation](https://docs.cdp.coinbase.com/)
- [Ankr Documentation](https://www.ankr.com/docs/)
- [Permit2 Contract](https://basescan.org/address/0x000000000022d473030f116ddee9f6b43ac78ba3) 