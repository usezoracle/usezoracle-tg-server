# Token Swap Integration Guide

This guide explains how to integrate the UseZoracle token swap functionality into your application. All swaps include a 5% fee that is sent to a designated recipient address.

## Key Features

- Token swaps across multiple networks (base, ethereum, base-sepolia)
- 5% fee on all swaps sent to a designated recipient
- Price estimation including fee calculation
- Slippage protection
- Detailed response data with transaction details

## Integration Steps

### 1. Include the Swap API Endpoints

Add these routes to your application:

```javascript
// In server.ts
import { swapRoutes } from "./routes/swapRoutes.js";

// Add the route to your Express app
app.use("/api/swaps", swapRoutes);
```

### 2. Access Common Token Addresses

Get the list of common token addresses for a specific network:

```
GET /api/swaps/tokens/{network}
```

Example:
```javascript
// Get common tokens for Base network
const response = await fetch('http://localhost:3000/api/swaps/tokens/base');
const data = await response.json();
// data.data.tokens contains addresses like { "ETH": "0xEeeee...", "WETH": "0x4200...", ... }
```

### 3. Get Swap Price Estimation

Before executing a swap, get a price estimation including the 5% fee calculation:

```
GET /api/swaps/price?accountName={accountName}&fromToken={fromToken}&toToken={toToken}&fromAmount={fromAmount}&network={network}
```

Example:
```javascript
// Get price for swapping 1 ETH to USDC on Base
const params = new URLSearchParams({
  accountName: 'myAccount',
  fromToken: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', // ETH
  toToken: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // USDC
  fromAmount: '1000000000000000000', // 1 ETH in wei
  network: 'base'
});

const response = await fetch(`http://localhost:3000/api/swaps/price?${params}`);
const data = await response.json();

// data.data contains swap details including:
// - grossAmount: total before fee
// - feeAmount: 5% of grossAmount
// - toAmount: net amount after fee
// - feeRecipient: where the fee is sent
```

### 4. Execute the Swap

Execute a token swap with the 5% fee applied:

```
POST /api/swaps/execute
```

Example:
```javascript
// Execute swap of 1 ETH to USDC on Base
const body = {
  accountName: 'myAccount',
  fromToken: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', // ETH
  toToken: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // USDC
  fromAmount: '1000000000000000000', // 1 ETH in wei
  slippageBps: 100, // 1% slippage tolerance
  network: 'base'
};

const response = await fetch('http://localhost:3000/api/swaps/execute', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body)
});

const data = await response.json();

// data.data contains transaction details including:
// - transactionHash: the swap transaction hash
// - grossAmount: total before fee
// - feeAmount: 5% of grossAmount
// - toAmount: net amount after fee
// - feeRecipient: where the fee was sent
```

## Fee Implementation Details

All token swaps include a 5% fee that is automatically:

1. Calculated from the gross swap amount
2. Deducted from the output tokens
3. Sent to the designated fee recipient address: `0x27cEe32550DcC30De5a23551bAF7de2f3b0b98A0`

### Fee Calculation Example

For a swap that would yield 1800 USDC tokens (gross amount):
- Fee: 1800 * 5% = 90 USDC
- Net amount user receives: 1800 - 90 = 1710 USDC
- Fee recipient `0x27cEe32550DcC30De5a23551bAF7de2f3b0b98A0` receives 90 USDC

## Response Examples

### Token List Response

```json
{
  "success": true,
  "data": {
    "tokens": {
      "ETH": "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
      "WETH": "0x4200000000000000000000000000000000000006",
      "USDC": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      "USDT": "0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA"
    }
  },
  "message": "Common tokens for base retrieved successfully"
}
```

### Swap Price Response

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

### Swap Execution Response

```json
{
  "success": true,
  "data": {
    "transactionHash": "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
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

## Important Implementation Details

### Token Addresses

- ETH: Use `0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE` to represent native ETH
- Other tokens: Use their contract addresses (e.g., `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` for USDC on Base)

### Token Amounts

- All amounts should be provided in base units (e.g., wei for ETH)
- 1 ETH = 1000000000000000000 wei (18 decimals)
- 1 USDC = 1000000 (6 decimals)

### Slippage Protection

- `slippageBps` is expressed in basis points (1 bps = 0.01%)
- Default is 100 bps (1% slippage tolerance)
- Higher values allow more price movement but increase chances of the swap going through
- Lower values provide better price protection but may cause the swap to fail in volatile markets

### Networks

Supported networks:
- `base` (Base mainnet)
- `ethereum` (Ethereum mainnet)
- `base-sepolia` (Base Sepolia testnet)

## Error Handling

Common error scenarios:

1. Insufficient balance:
```json
{
  "success": false,
  "error": "Insufficient balance to complete swap",
  "message": "Failed to execute swap"
}
```

2. Liquidity not available:
```json
{
  "success": false,
  "error": "Liquidity not available for this swap",
  "message": "Failed to get swap price"
}
```

3. Price impact too high:
```json
{
  "success": false,
  "error": "Price impact exceeds slippage tolerance",
  "message": "Failed to execute swap"
}
```