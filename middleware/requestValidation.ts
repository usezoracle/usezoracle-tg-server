import { z } from 'zod';
import { Request, Response, NextFunction } from 'express';

export const addressParamSchema = z.object({
  address: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid Ethereum address')
});

export const includeQuerySchema = z.object({
  include: z.string().optional()
});

export const networkParamSchema = z.object({
  network: z.enum(['base', 'base-sepolia', 'ethereum'])
});

export const accountQuerySchema = z.object({
  accountName: z.string().min(1)
});

export const accountNameParamSchema = z.object({
  accountName: z.string().min(1)
});

export const positionIdParamSchema = z.object({
  positionId: z.string().min(1)
});

export const statusParamSchema = z.object({
  status: z.enum(['open', 'closed', 'pending'])
});

export const alertIdParamSchema = z.object({
  alertId: z.string().min(1)
});

export const allowanceQuerySchema = z.object({
  accountName: z.string().min(1),
  tokenAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid Ethereum address'),
  network: z.string().optional()
});

export const swapPriceQuerySchema = z.object({
  accountName: z.string().min(1),
  fromToken: z.string().regex(/^0x[a-fA-F0-9]{40}$|^0x[eE]{40}$/u, 'Invalid token address'),
  toToken: z.string().regex(/^0x[a-fA-F0-9]{40}$|^0x[eE]{40}$/u, 'Invalid token address'),
  fromAmount: z.string().min(1),
  network: z.string().optional()
});

export const validateBody = (schema: z.ZodSchema<any>) => (req: Request, res: Response, next: NextFunction) => {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ success: false, error: result.error.errors.map(e => e.message).join(', '), timestamp: new Date().toISOString() });
  }
  next();
};

export const validateParams = (schema: z.ZodSchema<any>) => (req: Request, res: Response, next: NextFunction) => {
  const result = schema.safeParse(req.params);
  if (!result.success) {
    return res.status(400).json({ success: false, error: result.error.errors.map(e => e.message).join(', '), timestamp: new Date().toISOString() });
  }
  next();
};

export const validateQuery = (schema: z.ZodSchema<any>) => (req: Request, res: Response, next: NextFunction) => {
  const result = schema.safeParse(req.query);
  if (!result.success) {
    return res.status(400).json({ success: false, error: result.error.errors.map(e => e.message).join(', '), timestamp: new Date().toISOString() });
  }
  next();
};

export const hexAddressParamSchema = z.object({
  address: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid Ethereum address')
});

export const tokenBalanceBodySchema = z.object({
  tokenAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid Ethereum address'),
  walletAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid Ethereum address')
});

export const transferBodySchema = z.object({
  accountName: z.string().min(1),
  to: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid Ethereum address'),
  amount: z.string().min(1),
  token: z.union([
    z.literal('ETH'),
    z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid token address')
  ]),
  network: z.enum(['base', 'base-sepolia', 'ethereum']).optional()
});

// Alerts & Copy Trading Schemas
export const priceAlertBodySchema = z.object({
  accountName: z.string().min(1),
  tokenAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid Ethereum address'),
  targetPrice: z.string().min(1),
  condition: z.enum(['above', 'below'])
});

export const portfolioAlertBodySchema = z.object({
  accountName: z.string().min(1),
  alertType: z.enum(['value_increase', 'value_decrease', 'pnl_threshold']),
  threshold: z.string().min(1),
  condition: z.enum(['above', 'below'])
});

export const tradeAlertBodySchema = z.object({
  accountName: z.string().min(1),
  alertType: z.enum(['successful_trade', 'failed_transaction', 'large_trade']),
  tokenAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid Ethereum address').optional(),
  amount: z.string().min(1).optional()
});

export const marketAlertBodySchema = z.object({
  alertType: z.enum(['price_spike', 'volume_surge', 'market_opportunity']),
  threshold: z.string().min(1),
  condition: z.enum(['above', 'below']),
  tokenAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid Ethereum address').optional()
});

export const setupCopyTradingBodySchema = z.object({
  accountName: z.string().min(1),
  targetWalletAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid Ethereum address'),
  delegationAmount: z.string().min(1),
  maxSlippage: z.number().optional()
});

export const copyTradingStatusQuerySchema = z.object({
  accountName: z.string().min(1)
});