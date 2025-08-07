# CDP Server API Documentation

## Base URL
```
https://usezoracle-telegrambot-production.up.railway.app
```

## API Documentation
Interactive API documentation is available at:
```
/api-docs
```

Example: `https://usezoracle-telegrambot-production.up.railway.app/api-docs`

## Overview
This API provides endpoints for managing Coinbase Developer Platform (CDP) accounts, transactions, balances, and copy trading functionality.

## Authentication
All endpoints require proper CDP API credentials configured on the server.

## Features

### Core Features
- **Account Management**: Create and manage CDP accounts
- **Balance Tracking**: Monitor token balances across accounts
- **Transaction Execution**: Send transactions securely via CDP
- **Position Management**: Track trading positions and performance
- **Alert System**: Set up price, portfolio, and trade alerts

### Copy Trading (NEW)
- **Automated Copy Trading**: Monitor wallets and automatically copy their buy transactions
- **Delegation Control**: Set maximum amounts to delegate for copy trading
- **Risk Management**: Configurable slippage limits and position sizing
- **Performance Tracking**: Monitor copy trading performance and history
- **Buy-Only Strategy**: Only copies buy transactions (no sells)

## Endpoints

### Health Check
**GET** `/health`

Check if the server is running.

**Response:**
```json
{
  "status": "OK",
  "timestamp": "2025-07-31T05:37:31.153Z"
}
```

---

### Copy Trading

#### Setup Copy Trading
**POST** `/api/monitoring/copy-trading`

Monitor a wallet for copy trading opportunities and execute copy trades.

**Request Body:**
```json
{
  "walletAddress": "0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6",
  "accountName": "myWallet",
  "delegationAmount": "0.5",
  "maxSlippage": 0.05
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "config": {
      "id": "copy_1703123456789_abc123def",
      "accountName": "myWallet",
      "targetWalletAddress": "0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6",
      "delegationAmount": "0.5",
      "maxSlippage": 0.05,
      "isActive": true,
      "createdAt": 1703123456,
      "totalExecutedTrades": 0,
      "totalSpent": "0"
    },
    "events": []
  },
  "message": "Copy trading setup complete. Found 0 buy transactions to copy."
}
```

#### Get Copy Trading Configurations
**GET** `/api/monitoring/copy-trading/configs?accountName=myWallet`

Get all copy trading configurations for an account.

#### Get Copy Trading Events
**GET** `/api/monitoring/copy-trading/events?accountName=myWallet`

Get copy trading events for an account.

#### Update Copy Trading Configuration
**PUT** `/api/monitoring/copy-trading/configs/{configId}`

Update a copy trading configuration.

#### Delete Copy Trading Configuration
**DELETE** `/api/monitoring/copy-trading/configs/{configId}`

Delete a copy trading configuration.

---

### Account Management

#### Create Account
**POST** `/api/accounts`

Create a new CDP account.

**Request Body:**
```json
{
  "name": "my-account-name"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "address": "0x...",
    "name": "my-account-name",
    "network": "base"
  },
  "message": "Account my-account-name created successfully"
}
```

#### Get Account
**GET** `/api/accounts/{accountName}`

Retrieve account details by name.

**Example:** `GET /api/accounts/techwithmide-ox`

**Response:**
```json
{
  "success": true,
  "data": {
    "address": "0x...",
    "name": "techwithmide-ox",
    "network": "base"
  },
  "message": "Account techwithmide-ox retrieved successfully"
}
```

#### List All Accounts
**GET** `/api/accounts`

Get all available accounts.

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "address": "0x...",
      "name": "account1",
      "network": "base"
    },
    {
      "address": "0x...",
      "name": "account2", 
      "network": "base"
    }
  ],
  "message": "Accounts retrieved successfully"
}
```

---

### Transaction Management

#### Send Transfer
**POST** `/api/transactions/transfer`

Transfer tokens between accounts.

**Request Body:**
```json
{
  "accountName": "my-account",
  "to": "0x4252e0c9A3da5A2700e7d91cb50aEf522D0C6Fe8",
  "amount": "0.001",
  "token": "eth",
  "network": "base"
}
```

**Parameters:**
- `accountName` (string, required): Source account name
- `to` (string, required): Recipient address (0x format)
- `amount` (string, required): Amount to transfer
- `token` (string, required): Token type ("eth" or "usdc")
- `network` (string, optional): Network ("base" or "base-sepolia", defaults to "base")

**Response:**
```json
{
  "success": true,
  "data": {
    "transactionHash": "0x..."
  },
  "message": "Transfer completed successfully"
}
```

---

### Balance Management

#### Get Account Balances
**GET** `/api/balances/{accountName}`

Get token balances for a specific account with USD values and price information.

**Example:** `GET /api/balances/techwithmide-ox`

**Response:**
```json
{
  "success": true,
  "data": {
    "account": "techwithmide-ox",
    "network": "base",
    "totalUsdValue": 2500.50,
    "balances": [
      {
        "token": {
          "contractAddress": "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
          "name": "Ethereum",
          "symbol": "ETH",
          "decimals": 18
        },
        "amount": {
          "raw": "1000000000000000000",
          "formatted": "1.0"
        },
        "price": {
          "usd": 2500.50,
          "usd_24h_change": 2.5
        },
        "usdValue": 2500.50
      },
      {
        "token": {
          "contractAddress": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
          "name": "USD Coin",
          "symbol": "USDC",
          "decimals": 6
        },
        "amount": {
          "raw": "1000000",
          "formatted": "1.0"
        },
        "price": {
          "usd": 1.0,
          "usd_24h_change": 0.0
        },
        "usdValue": 1.0
      }
    ]
  },
  "message": "Balances retrieved successfully"
}
```

---

## Error Responses

All endpoints return consistent error responses:

```json
{
  "success": false,
  "error": "Error description",
  "timestamp": "2025-07-31T05:37:31.153Z"
}
```

### Common Error Codes
- `400` - Bad Request (validation errors)
- `404` - Route not found

- `500` - Internal server error



## Example Usage

### Using cURL

```bash
# Health check
curl https://usezoracle-telegrambot-production.up.railway.app/health

# Create account
curl -X POST https://usezoracle-telegrambot-production.up.railway.app/api/accounts \
  -H "Content-Type: application/json" \
  -d '{"name": "my-new-account"}'

# Get account
curl https://usezoracle-telegrambot-production.up.railway.app/api/accounts/my-new-account

# Get balances
curl https://usezoracle-telegrambot-production.up.railway.app/api/balances/my-new-account

# Transfer tokens
curl -X POST https://usezoracle-telegrambot-production.up.railway.app/api/transactions/transfer \
  -H "Content-Type: application/json" \
  -d '{
    "accountName": "my-new-account",
    "to": "0x4252e0c9A3da5A2700e7d91cb50aEf522D0C6Fe8",
    "amount": "0.001",
    "token": "eth"
  }'
```

### Using JavaScript/Fetch

```javascript
// Health check
const health = await fetch('https://usezoracle-telegrambot-production.up.railway.app/health');
const healthData = await health.json();

// Create account
const createAccount = await fetch('https://usezoracle-telegrambot-production.up.railway.app/api/accounts', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: 'my-new-account' })
});
const accountData = await createAccount.json();

// Get balances
const balances = await fetch('https://usezoracle-telegrambot-production.up.railway.app/api/balances/my-new-account');
const balanceData = await balances.json();
```

---

## Notes
- All amounts should be provided as strings to maintain precision
- Token addresses are automatically resolved for common tokens (ETH, USDC)
- The API supports Base mainnet and Base Sepolia testnet
- All timestamps are in ISO 8601 format (UTC)

## Troubleshooting

### Node.js Version Error
If you encounter an error like:
```json
{
  "success": false,
  "error": "Node.js version 18.20.5 is not supported. CDP SDK requires Node.js version 19 or higher."
}
```

This means the server needs to be updated to Node.js 19+ to support the CDP SDK. Contact the server administrator to upgrade the Node.js version.

### Common Issues
- **400 Bad Request**: Check that all required fields are provided and in the correct format
- **404 Not Found**: Verify the endpoint URL is correct

- **500 Internal Server Error**: Server-side issue. Try again later or contact support 