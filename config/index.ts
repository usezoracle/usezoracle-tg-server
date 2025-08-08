import dotenv from 'dotenv';
dotenv.config();

const required = (name: string, fallback?: string): string => {
  const val = process.env[name] ?? fallback;
  if (!val) throw new Error(`Missing required env var: ${name}`);
  return val;
};

export const config = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '3000', 10),
  providerUrl: required('PROVIDER_URL', 'https://rpc.ankr.com/base'),
  geckoTerminalBaseUrl: process.env.GECKO_TERMINAL_BASE_URL ?? 'https://api.geckoterminal.com/api/v2',
  copyTrading: {
    buyOnly: (process.env.COPY_TRADING_BUY_ONLY ?? 'true').toLowerCase() === 'true',
    routerAddresses: (process.env.COPY_TRADING_ROUTERS ?? '')
      .split(',')
      .map(a => a.trim().toLowerCase())
      .filter(a => a.startsWith('0x') && a.length === 42),
  },
  cdp: {
    apiKeyId: required('CDP_API_KEY_ID'),
    apiKeySecret: required('CDP_API_KEY_SECRET'),
    walletSecret: required('CDP_WALLET_SECRET'),
  },
};