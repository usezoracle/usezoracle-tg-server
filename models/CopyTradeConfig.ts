import mongoose, { Schema, Document, Model } from 'mongoose';

export interface CopyTradeConfigDoc extends Document {
  accountName: string;
  targetWalletAddress: string;
  beneficiaryAddresses: string[];
  delegationAmount: string; // ETH string
  maxSlippage: number; // percent (0.05 = 5%)
  buyOnly: boolean;
  routerAllowlist: string[];
  isActive: boolean;
  createdAt: number;
  lastExecutedAt?: number;
  totalExecutedTrades: number;
  totalSpent: string; // ETH string
}

const CopyTradeConfigSchema = new Schema<CopyTradeConfigDoc>({
  accountName: { type: String, required: true, index: true },
  targetWalletAddress: { type: String, required: true, index: true, lowercase: true },
  beneficiaryAddresses: { type: [String], required: true, default: [] },
  delegationAmount: { type: String, required: true },
  maxSlippage: { type: Number, required: true, default: 0.05 },
  buyOnly: { type: Boolean, required: true, default: true },
  routerAllowlist: { type: [String], required: true, default: [] },
  isActive: { type: Boolean, required: true, default: true, index: true },
  createdAt: { type: Number, required: true, default: () => Date.now() },
  lastExecutedAt: { type: Number },
  totalExecutedTrades: { type: Number, required: true, default: 0 },
  totalSpent: { type: String, required: true, default: '0' },
});

CopyTradeConfigSchema.index({ targetWalletAddress: 1, isActive: 1 });
// Prevent duplicate copy-trade configs per account and target wallet
CopyTradeConfigSchema.index({ accountName: 1, targetWalletAddress: 1 }, { unique: true });

export const CopyTradeConfigModel: Model<CopyTradeConfigDoc> = mongoose.models.CopyTradeConfig || mongoose.model<CopyTradeConfigDoc>('CopyTradeConfig', CopyTradeConfigSchema);


