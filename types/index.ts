export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

export interface Account {
  address: string;
  name: string;
  // Add other account properties as needed
}

export interface TransactionRequest {
  accountName: string;
  to: string;
  value: string;
  network?: string;
}

export interface TransferRequest {
  accountName: string;
  to: string;
  amount: string;
  token: string;
  network?: string;
}

export interface Balance {
  contractAddress: string;
  balance: string;
  tokenName: string;
  tokenSymbol: string;
  formattedAmount: string;
}

export interface Position {
  id: string;
  accountName: string;
  tokenAddress: string;
  tokenSymbol: string;
  tokenName: string;
  amount: string;
  entryPrice: string;
  currentPrice?: string;
  pnl?: string;
  pnlPercentage?: number;
  status: 'open' | 'closed' | 'pending';
  transactionHash: string;
  timestamp: number;
  closedAt?: number;
  exitTransactionHash?: string;
}

export interface PositionsResponse {
  open: Position[];
  closed: Position[];
  pending: Position[];
  summary: {
    totalOpen: number;
    totalClosed: number;
    totalPending: number;
    totalPnl: string;
    totalPnlPercentage: number;
  };
}

export interface PriceAlert {
  id: string;
  accountName: string;
  tokenAddress: string;
  tokenSymbol: string;
  tokenName: string;
  targetPrice: string;
  condition: 'above' | 'below';
  isActive: boolean;
  createdAt: number;
  triggeredAt?: number;
  triggeredPrice?: string;
}

export interface PortfolioAlert {
  id: string;
  accountName: string;
  alertType: 'value_increase' | 'value_decrease' | 'pnl_threshold';
  threshold: string;
  condition: 'above' | 'below';
  isActive: boolean;
  createdAt: number;
  triggeredAt?: number;
  triggeredValue?: string;
}

export interface TradeAlert {
  id: string;
  accountName: string;
  alertType: 'successful_trade' | 'failed_transaction' | 'large_trade';
  tokenAddress?: string;
  tokenSymbol?: string;
  amount?: string;
  transactionHash?: string;
  isActive: boolean;
  createdAt: number;
  triggeredAt?: number;
}

export interface MarketAlert {
  id: string;
  alertType: 'price_spike' | 'volume_surge' | 'market_opportunity';
  tokenAddress?: string;
  tokenSymbol?: string;
  threshold: string;
  condition: 'above' | 'below';
  isActive: boolean;
  createdAt: number;
  triggeredAt?: number;
  triggeredValue?: string;
}

export interface CopyTradingAlert {
  id: string;
  accountName: string;
  alertType: 'wallet_activity' | 'large_transaction' | 'new_token_purchase';
  walletAddress: string;
  tokenAddress?: string;
  tokenSymbol?: string;
  amount?: string;
  transactionHash?: string;
  isActive: boolean;
  createdAt: number;
  triggeredAt?: number;
}

export interface AlertResponse {
  priceAlerts: PriceAlert[];
  portfolioAlerts: PortfolioAlert[];
  tradeAlerts: TradeAlert[];
  marketAlerts: MarketAlert[];
  copyTradingAlerts: CopyTradingAlert[];
  summary: {
    totalPriceAlerts: number;
    totalPortfolioAlerts: number;
    totalTradeAlerts: number;
    totalMarketAlerts: number;
    totalCopyTradingAlerts: number;
    activeAlerts: number;
  };
}
