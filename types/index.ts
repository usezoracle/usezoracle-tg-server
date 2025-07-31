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
